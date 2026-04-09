from __future__ import annotations

from pathlib import Path
from typing import Any

from flask import current_app


class SheetsSyncError(RuntimeError):
    pass


class SheetsConfigError(SheetsSyncError):
    pass


HEADER_ROW = [
    "job_id",
    "position",
    "company",
    "location",
    "date_found",
    "date_applied",
    "source",
    "job_url",
    "status",
    "notes",
]


def sync_application(job: dict[str, Any]) -> str:
    if not current_app.config.get("GOOGLE_SHEETS_ENABLED", False):
        raise SheetsConfigError("Google Sheets sync is disabled.")

    spreadsheet_id = current_app.config.get("GOOGLE_SHEETS_SPREADSHEET_ID", "").strip()
    service_account_file = current_app.config.get("GOOGLE_SERVICE_ACCOUNT_FILE", "").strip()
    configured_tab_name = current_app.config.get("GOOGLE_SHEETS_TAB_NAME", "").strip()
    configured_gid = current_app.config.get("GOOGLE_SHEETS_TAB_GID", "").strip()

    if not spreadsheet_id:
        raise SheetsConfigError("Missing spreadsheet ID.")
    if not service_account_file:
        raise SheetsConfigError("Missing service account file path.")

    service_file = Path(service_account_file)
    if not service_file.exists():
        raise SheetsConfigError(f"Service account file was not found at {service_file}.")

    service = build_sheets_service(service_file)
    sheet_title = resolve_sheet_title(
        service=service,
        spreadsheet_id=spreadsheet_id,
        configured_title=configured_tab_name,
        configured_gid=configured_gid,
    )

    values = get_sheet_values(service, spreadsheet_id, sheet_title)
    row = build_application_row(job)

    ensure_header_row(service, spreadsheet_id, sheet_title, values)
    upsert_row(service, spreadsheet_id, sheet_title, values, row)

    return sheet_title


def build_sheets_service(service_account_file: Path):
    try:
        from google.oauth2.service_account import Credentials
        from googleapiclient.discovery import build
    except ImportError as exc:
        raise SheetsConfigError(
            "Google API packages are not installed. Run `pip3 install -r requirements.txt`."
        ) from exc

    credentials = Credentials.from_service_account_file(
        service_account_file,
        scopes=["https://www.googleapis.com/auth/spreadsheets"],
    )
    return build("sheets", "v4", credentials=credentials, cache_discovery=False)


def resolve_sheet_title(
    service,
    spreadsheet_id: str,
    configured_title: str,
    configured_gid: str,
) -> str:
    if configured_title:
        return configured_title

    metadata = (
        service.spreadsheets()
        .get(spreadsheetId=spreadsheet_id, fields="sheets(properties(sheetId,title))")
        .execute()
    )
    sheets = metadata.get("sheets", [])
    if not sheets:
        raise SheetsSyncError("The spreadsheet does not contain any tabs.")

    if configured_gid:
        try:
            target_gid = int(configured_gid)
        except ValueError:
            target_gid = None
        else:
            for sheet in sheets:
                properties = sheet.get("properties", {})
                if properties.get("sheetId") == target_gid:
                    return properties["title"]

    return sheets[0]["properties"]["title"]


def get_sheet_values(service, spreadsheet_id: str, sheet_title: str) -> list[list[str]]:
    response = (
        service.spreadsheets()
        .values()
        .get(spreadsheetId=spreadsheet_id, range=f"{sheet_title}!A:J")
        .execute()
    )
    values = response.get("values", [])
    return [[str(cell) for cell in row] for row in values]


def ensure_header_row(service, spreadsheet_id: str, sheet_title: str, values: list[list[str]]) -> None:
    if values:
        return

    (
        service.spreadsheets()
        .values()
        .update(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_title}!A1:J1",
            valueInputOption="RAW",
            body={"values": [HEADER_ROW]},
        )
        .execute()
    )


def upsert_row(
    service,
    spreadsheet_id: str,
    sheet_title: str,
    existing_values: list[list[str]],
    row: list[str],
) -> None:
    existing_rows = existing_values[1:] if existing_values else []
    job_id = row[0]

    for index, existing_row in enumerate(existing_rows, start=2):
        if existing_row and existing_row[0] == job_id:
            (
                service.spreadsheets()
                .values()
                .update(
                    spreadsheetId=spreadsheet_id,
                    range=f"{sheet_title}!A{index}:J{index}",
                    valueInputOption="RAW",
                    body={"values": [row]},
                )
                .execute()
            )
            return

    (
        service.spreadsheets()
        .values()
        .append(
            spreadsheetId=spreadsheet_id,
            range=f"{sheet_title}!A:J",
            valueInputOption="RAW",
            insertDataOption="INSERT_ROWS",
            body={"values": [row]},
        )
        .execute()
    )


def build_application_row(job: dict[str, Any]) -> list[str]:
    application = job.get("application") or {}
    notes = application.get("notes", "")

    return [
        str(job["id"]),
        job["title"],
        job["company"],
        job["location"],
        job["posted_at"],
        application.get("applied_at", ""),
        job["source"],
        job["job_url"],
        application.get("status", "Applied"),
        notes,
    ]
