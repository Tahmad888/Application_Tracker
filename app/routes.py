from __future__ import annotations

from urllib.parse import quote

from flask import Blueprint, flash, redirect, render_template, request, session, url_for
from flask import current_app

from .db import load_sample_jobs
from .gmail_oauth import (
    GmailOAuthConfigError,
    GmailOAuthError,
    exchange_code_for_tokens,
    get_gmail_authorization_url,
    list_recent_job_emails,
)
from .google_sheets import SheetsConfigError, SheetsSyncError, sync_application
from .matching import score_jobs
from .parser import extract_keywords, infer_candidate_profile
from .repository import (
    fetch_dashboard_data,
    fetch_gmail_connection,
    fetch_job,
    mark_job_applied,
    record_sync_event,
    replace_keywords,
    save_resume,
    upsert_gmail_connection,
    upsert_jobs,
)

bp = Blueprint("dashboard", __name__)


def frontend_redirect(message: str | None = None, level: str = "info"):
    frontend_url = current_app.config.get("FRONTEND_URL", "http://127.0.0.1:3000").rstrip("/")
    if not message:
        return redirect(frontend_url)
    return redirect(f"{frontend_url}/?auth_message={quote(message)}&auth_level={quote(level)}")


@bp.route("/api/<path:_unused>", methods=["OPTIONS"])
def api_options(_unused: str):
    return ("", 204)


@bp.get("/")
def index():
    return render_template("dashboard.html", data=fetch_dashboard_data())


@bp.get("/gmail/connect")
def connect_gmail():
    try:
        authorization_url, state, code_verifier = get_gmail_authorization_url()
    except GmailOAuthConfigError as exc:
        flash(f"Gmail OAuth still needs setup: {exc}", "error")
        return frontend_redirect(f"Gmail OAuth still needs setup: {exc}", "error")

    session["gmail_oauth_state"] = state
    session["gmail_oauth_code_verifier"] = code_verifier
    return redirect(authorization_url)


@bp.get("/oauth/google/callback")
def gmail_callback():
    expected_state = session.pop("gmail_oauth_state", None)
    code_verifier = session.pop("gmail_oauth_code_verifier", None)
    returned_state = request.args.get("state")
    oauth_error = request.args.get("error")

    if oauth_error:
        return frontend_redirect(f"Google sign-in was canceled or denied: {oauth_error}.", "error")

    if not expected_state or returned_state != expected_state:
        return frontend_redirect("Google OAuth state did not match. Start the Gmail connection again.", "error")

    try:
        token_record, email = exchange_code_for_tokens(
            request.url,
            expected_state,
            code_verifier=code_verifier,
        )
    except Exception as exc:
        message = str(exc)
        return frontend_redirect(message, "error")

    upsert_gmail_connection(email, token_record)
    return frontend_redirect(f"Gmail connected for {email}.", "success")


@bp.post("/gmail/check")
def check_gmail():
    connection = fetch_gmail_connection()
    if not connection:
        flash("Connect Gmail before checking job-related messages.", "error")
        return redirect(url_for("dashboard.index"))

    try:
        messages = list_recent_job_emails(connection)
    except GmailOAuthError as exc:
        flash(f"Gmail check failed: {exc}", "error")
        return redirect(url_for("dashboard.index"))

    session["gmail_recent_messages"] = messages
    flash(f"Gmail checked successfully. Found {len(messages)} recent job-related message(s).", "success")
    return redirect(url_for("dashboard.index"))


@bp.post("/resume")
def upload_resume():
    resume_file = request.files.get("resume_file")
    resume_text = request.form.get("resume_text", "").strip()

    filename = "pasted_resume.txt"
    if resume_file and resume_file.filename:
        raw_bytes = resume_file.read()
        resume_text = raw_bytes.decode("utf-8", errors="ignore").strip()
        filename = resume_file.filename

    if not resume_text:
        flash("Add resume text or upload a plain text resume file to continue.", "error")
        return redirect(url_for("dashboard.index"))

    keywords, queries = extract_keywords(resume_text)
    if not keywords:
        flash("The parser could not find enough ATS keywords. Add more detailed resume content.", "error")
        return redirect(url_for("dashboard.index"))

    profile = infer_candidate_profile(resume_text, keywords, queries)
    resume_id = save_resume(filename=filename, raw_text=resume_text)
    replace_keywords(resume_id, keywords, queries)

    matches = score_jobs(load_sample_jobs(), keywords, profile=profile)
    upsert_jobs(matches)

    flash("Resume parsed and dashboard refreshed with matched jobs.", "success")
    return redirect(url_for("dashboard.index"))


@bp.get("/jobs/<int:job_id>")
def job_detail(job_id: int):
    job = fetch_job(job_id)
    if not job:
        flash("That job could not be found.", "error")
        return redirect(url_for("dashboard.index"))
    return render_template("job_detail.html", job=job)


@bp.post("/jobs/<int:job_id>/apply")
def apply(job_id: int):
    mark_job_applied(job_id)
    job = fetch_job(job_id)

    if not job:
        flash("Job was marked as applied, but it could not be loaded for sync.", "error")
        return redirect(request.referrer or url_for("dashboard.index"))

    try:
        sheet_title = sync_application(job)
    except SheetsConfigError as exc:
        record_sync_event("google_sheets", job_id, "config_error", str(exc))
        flash(f"Job marked as applied. Sheets sync still needs setup: {exc}", "error")
    except SheetsSyncError as exc:
        record_sync_event("google_sheets", job_id, "sync_error", str(exc))
        flash(f"Job marked as applied, but Google Sheets sync failed: {exc}", "error")
    else:
        record_sync_event("google_sheets", job_id, "success", f"Synced to {sheet_title}.")
        flash(f"Job marked as applied and synced to Google Sheets tab '{sheet_title}'.", "success")

    return redirect(request.referrer or url_for("dashboard.index"))
