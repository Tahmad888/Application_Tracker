from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from typing import Any

from flask import current_app


class GmailOAuthError(RuntimeError):
    pass


class GmailOAuthConfigError(GmailOAuthError):
    pass


def get_google_client_config() -> dict[str, Any]:
    client_id = current_app.config.get("GOOGLE_OAUTH_CLIENT_ID", "").strip()
    client_secret = current_app.config.get("GOOGLE_OAUTH_CLIENT_SECRET", "").strip()
    redirect_uri = current_app.config.get("GOOGLE_OAUTH_REDIRECT_URI", "").strip()

    if not client_id or not client_secret:
        raise GmailOAuthConfigError("Missing Google OAuth client ID or client secret.")
    if not redirect_uri:
        raise GmailOAuthConfigError("Missing Google OAuth redirect URI.")

    return {
        "web": {
            "client_id": client_id,
            "project_id": "jobfinder-492510",
            "auth_uri": "https://accounts.google.com/o/oauth2/auth",
            "token_uri": "https://oauth2.googleapis.com/token",
            "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
            "client_secret": client_secret,
            "redirect_uris": [redirect_uri],
            "javascript_origins": [
                "http://127.0.0.1:5000",
                "http://localhost:5000",
            ],
        }
    }


def get_gmail_authorization_url() -> tuple[str, str, str | None]:
    flow = build_flow()
    authorization_url, state = flow.authorization_url(
        access_type="offline",
        include_granted_scopes="true",
        prompt="consent",
        login_hint=current_app.config.get("GMAIL_TARGET_EMAIL", "").strip() or None,
    )
    return authorization_url, state, getattr(flow, "code_verifier", None)


def exchange_code_for_tokens(
    authorization_response: str,
    state: str,
    code_verifier: str | None = None,
) -> tuple[dict[str, Any], str]:
    flow = build_flow(state=state, code_verifier=code_verifier)
    try:
        flow.fetch_token(authorization_response=authorization_response)
        credentials = flow.credentials
        service = build_gmail_service(credentials)
        profile = service.users().getProfile(userId="me").execute()
        email = profile["emailAddress"]
    except Exception as exc:
        message = str(exc)
        if "gmail.googleapis.com" in message or "Gmail API" in message:
            raise GmailOAuthError(
                "Google OAuth succeeded, but the Gmail API call failed. Make sure the Gmail API is enabled in Google Cloud."
            ) from exc
        raise GmailOAuthError(f"Gmail connection failed: {message}") from exc

    return credentials_to_record(credentials), email


def credentials_to_record(credentials) -> dict[str, Any]:
    expiry = ""
    if credentials.expiry:
        expiry = credentials.expiry.astimezone(timezone.utc).replace(microsecond=0).isoformat()

    return {
        "access_token": credentials.token or "",
        "refresh_token": credentials.refresh_token or "",
        "token_uri": credentials.token_uri or "https://oauth2.googleapis.com/token",
        "scopes": json.dumps(sorted(list(credentials.scopes or []))),
        "expiry": expiry,
    }


def build_flow(state: str | None = None, code_verifier: str | None = None):
    try:
        from google_auth_oauthlib.flow import Flow
    except ImportError as exc:
        raise GmailOAuthConfigError(
            "Google OAuth flow package is not installed. Run `pip3 install -r requirements.txt`."
        ) from exc

    # Local development uses http://127.0.0.1, which oauthlib treats as insecure
    # unless this flag is set explicitly.
    os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")

    flow = Flow.from_client_config(
        get_google_client_config(),
        scopes=list(current_app.config.get("GMAIL_SCOPES", ())),
        state=state,
    )
    flow.redirect_uri = current_app.config["GOOGLE_OAUTH_REDIRECT_URI"]
    if code_verifier:
        flow.code_verifier = code_verifier
    return flow


def build_gmail_service(credentials):
    try:
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise GmailOAuthConfigError(
            "Google API client package is not installed. Run `pip3 install -r requirements.txt`."
        ) from exc

    return build("gmail", "v1", credentials=credentials, cache_discovery=False)


def hydrate_credentials(connection: dict[str, Any]):
    try:
        from google.oauth2.credentials import Credentials
    except ImportError as exc:
        raise GmailOAuthConfigError(
            "Google auth package is not installed. Run `pip3 install -r requirements.txt`."
        ) from exc

    return Credentials(
        token=connection["access_token"],
        refresh_token=connection["refresh_token"] or None,
        token_uri=connection["token_uri"],
        client_id=current_app.config["GOOGLE_OAUTH_CLIENT_ID"],
        client_secret=current_app.config["GOOGLE_OAUTH_CLIENT_SECRET"],
        scopes=json.loads(connection["scopes"]),
    )


def list_recent_job_emails(connection: dict[str, Any], max_results: int = 50) -> list[dict[str, str]]:
    credentials = hydrate_credentials(connection)
    service = build_gmail_service(credentials)
    response = (
        service.users()
        .messages()
        .list(
            userId="me",
            maxResults=max_results,
            q='newer_than:30d (interview OR recruiter OR application OR rejected OR "next steps" OR assessment OR offer OR congratulations OR "thank you for applying" OR "phone screen")',
        )
        .execute()
    )
    messages = response.get("messages", [])

    results: list[dict[str, str]] = []
    for message in messages:
        detail = service.users().messages().get(userId="me", id=message["id"]).execute()
        headers = {
            item["name"].lower(): item["value"]
            for item in detail.get("payload", {}).get("headers", [])
        }
        results.append(
            {
                "id": detail["id"],
                "from": headers.get("from", ""),
                "subject": headers.get("subject", ""),
                "date": headers.get("date", ""),
                "snippet": detail.get("snippet", ""),
            }
        )
    return results


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
