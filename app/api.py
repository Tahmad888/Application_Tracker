from __future__ import annotations

from flask import Blueprint, jsonify, request

from .db import load_sample_jobs
from .gmail_oauth import (
    GmailOAuthConfigError,
    GmailOAuthError,
    list_recent_job_emails,
)
from .google_sheets import SheetsConfigError, SheetsSyncError, sync_application
from .job_tracker import JobTrackerError, build_tailored_resume, fetch_job_posting
from .matching import score_jobs
from .parser import extract_keywords, infer_candidate_profile
from .resume_ingest import ResumeParseError, extract_resume_text
from .repository import (
    fetch_dashboard_data,
    fetch_gmail_connection,
    fetch_job,
    mark_job_applied,
    record_sync_event,
    replace_keywords,
    save_resume,
    upsert_manual_job,
    upsert_jobs,
)

api_bp = Blueprint("api", __name__, url_prefix="/api")


@api_bp.get("/health")
def health():
    return jsonify({"ok": True})


@api_bp.get("/dashboard")
def dashboard():
    return jsonify(fetch_dashboard_data())


@api_bp.post("/resume")
def parse_resume():
    resume_file = request.files.get("resume_file")
    resume_text = request.form.get("resume_text", "").strip()
    raw_bytes: bytes | None = None

    filename = "pasted_resume.txt"
    if resume_file and resume_file.filename:
        raw_bytes = resume_file.read()
        filename = resume_file.filename

    if not resume_text and request.is_json:
        payload = request.get_json(silent=True) or {}
        resume_text = str(payload.get("resume_text", "")).strip()

    try:
        resume_text, filename = extract_resume_text(
            resume_text=resume_text,
            resume_bytes=raw_bytes,
            filename=filename,
            content_type=resume_file.mimetype if resume_file else "",
        )
    except ResumeParseError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 400

    if not resume_text:
        return jsonify({"ok": False, "message": "Add resume text or upload a PDF or plain text resume file."}), 400

    keywords, queries = extract_keywords(resume_text)
    if not keywords:
        return jsonify({"ok": False, "message": "The parser could not find enough ATS keywords."}), 400

    profile = infer_candidate_profile(resume_text, keywords, queries)
    resume_id = save_resume(filename=filename, raw_text=resume_text)
    replace_keywords(resume_id, keywords, queries)
    matches = score_jobs(load_sample_jobs(), keywords, profile=profile)
    upsert_jobs(matches)

    return jsonify(
        {
            "ok": True,
            "message": "Resume parsed and matched jobs refreshed.",
            "data": fetch_dashboard_data(),
        }
    )


@api_bp.get("/jobs/<int:job_id>")
def job_detail(job_id: int):
    job = fetch_job(job_id)
    if not job:
        return jsonify({"ok": False, "message": "Job not found."}), 404
    return jsonify({"ok": True, "data": job})


@api_bp.post("/jobs/<int:job_id>/apply")
def apply(job_id: int):
    mark_job_applied(job_id)
    job = fetch_job(job_id)
    if not job:
        return jsonify({"ok": False, "message": "Job marked applied, but not found afterward."}), 404

    message = "Job marked as applied."
    try:
        sheet_title = sync_application(job)
    except SheetsConfigError as exc:
        record_sync_event("google_sheets", job_id, "config_error", str(exc))
        message = f"Job marked as applied. Sheets setup still needs attention: {exc}"
    except SheetsSyncError as exc:
        record_sync_event("google_sheets", job_id, "sync_error", str(exc))
        message = f"Job marked as applied, but Google Sheets sync failed: {exc}"
    else:
        record_sync_event("google_sheets", job_id, "success", f"Synced to {sheet_title}.")
        message = f"Job marked as applied and synced to Google Sheets tab '{sheet_title}'."

    return jsonify({"ok": True, "message": message, "data": fetch_job(job_id)})


@api_bp.get("/gmail/status")
def gmail_status():
    return jsonify({"ok": True, "data": fetch_gmail_connection()})


@api_bp.post("/gmail/check")
def gmail_check():
    connection = fetch_gmail_connection()
    if not connection:
        return jsonify({"ok": False, "message": "Connect Gmail before checking for messages."}), 400

    try:
        messages = list_recent_job_emails(connection)
    except (GmailOAuthConfigError, GmailOAuthError) as exc:
        return jsonify({"ok": False, "message": f"Gmail check failed: {exc}"}), 400

    return jsonify(
        {
            "ok": True,
            "message": f"Found {len(messages)} recent job-related message(s).",
            "data": messages,
        }
    )


@api_bp.post("/tracker/intake")
def tracker_intake():
    payload = request.form if request.form else (request.get_json(silent=True) or {})
    job_url = str(payload.get("job_url", "")).strip()
    resume_text = str(payload.get("resume_text", "")).strip()
    notes = str(payload.get("notes", "")).strip()

    resume_file = request.files.get("resume_file")
    raw_bytes: bytes | None = None
    filename = "tracker_resume.txt"
    if resume_file and resume_file.filename:
        raw_bytes = resume_file.read()
        filename = resume_file.filename

    if not job_url:
        return jsonify({"ok": False, "message": "Paste a job link to track it."}), 400

    try:
        tracked_job = fetch_job_posting(job_url)
    except JobTrackerError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 400

    tailored = None
    if resume_text or raw_bytes:
        try:
            parsed_resume_text, parsed_filename = extract_resume_text(
                resume_text=resume_text,
                resume_bytes=raw_bytes,
                filename=filename,
                content_type=resume_file.mimetype if resume_file else "",
            )
        except ResumeParseError as exc:
            return jsonify({"ok": False, "message": str(exc)}), 400

        save_resume(filename=parsed_filename, raw_text=parsed_resume_text)
        tailored = build_tailored_resume(tracked_job, parsed_resume_text)

    job_record = upsert_manual_job(tracked_job.to_record(), status="Applied", notes=notes)

    sync_message = "Tracked job saved."
    try:
        sheet_title = sync_application(job_record)
    except SheetsConfigError as exc:
        record_sync_event("google_sheets", job_record["id"], "config_error", str(exc))
        sync_message = f"Tracked job saved, but Sheets still needs attention: {exc}"
    except SheetsSyncError as exc:
        record_sync_event("google_sheets", job_record["id"], "sync_error", str(exc))
        sync_message = f"Tracked job saved, but Google Sheets sync failed: {exc}"
    else:
        record_sync_event("google_sheets", job_record["id"], "success", f"Synced to {sheet_title}.")
        sync_message = f"Tracked job saved and synced to Google Sheets tab '{sheet_title}'."

    return jsonify(
        {
            "ok": True,
            "message": sync_message,
            "data": {
                "dashboard": fetch_dashboard_data(),
                "tracked_job": job_record,
                "tailored_resume": tailored,
            },
        }
    )
