from __future__ import annotations

from flask import Blueprint, jsonify, request

from .db import load_sample_jobs
from .gmail_oauth import (
    GmailOAuthConfigError,
    GmailOAuthError,
    list_recent_job_emails,
)
from .gmail_matching import match_email_to_job, should_advance_status
from .google_sheets import SheetsConfigError, SheetsSyncError, sync_application
from .job_tracker import (
    JobTrackerError,
    build_confirmed_job,
    build_tailored_resume,
    preview_job_posting,
)
from .matching import score_jobs
from .parser import extract_keywords, infer_candidate_profile
from .resume_ingest import ResumeParseError, extract_resume_text
from .repository import (
    delete_response_hub_entry,
    delete_response_hub_event,
    fetch_dashboard_data,
    fetch_gmail_connection,
    fetch_job,
    fetch_response_hub_entries,
    fetch_tracked_jobs_for_status_matching,
    mark_job_applied,
    apply_gmail_status_update,
    record_sync_event,
    replace_keywords,
    update_response_hub_status,
    upsert_response_hub_entry,
    upsert_response_hub_event,
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

    tracked_jobs = fetch_tracked_jobs_for_status_matching()
    status_updates: list[dict] = []
    matched_count = 0
    unmatched_count = 0
    synced_job_ids: set[int] = set()

    for message in messages:
        proposal = match_email_to_job(message, tracked_jobs)
        if not proposal:
            unmatched_count += 1
            continue

        matched_count += 1
        current_job = next((job for job in tracked_jobs if int(job["id"]) == proposal.job_id), None)
        if not current_job:
            unmatched_count += 1
            continue

        if proposal.job_id not in synced_job_ids:
            matched_job = fetch_job(proposal.job_id)
            if matched_job:
                try:
                    sheet_title = sync_application(matched_job)
                except SheetsConfigError as exc:
                    record_sync_event("google_sheets", proposal.job_id, "config_error", str(exc))
                except SheetsSyncError as exc:
                    record_sync_event("google_sheets", proposal.job_id, "sync_error", str(exc))
                else:
                    record_sync_event("google_sheets", proposal.job_id, "success", f"Synced to {sheet_title}.")
                synced_job_ids.add(proposal.job_id)

        old_status = str(current_job.get("status") or "Applied")
        if not should_advance_status(old_status, proposal.new_status):
            continue

        event = apply_gmail_status_update(
            job_id=proposal.job_id,
            old_status=old_status,
            new_status=proposal.new_status,
            email_id=proposal.email_id,
            email_subject=proposal.email_subject,
            matched_from=proposal.matched_from,
            email_snippet=proposal.email_snippet,
        )
        if not event:
            continue

        updated_job = fetch_job(proposal.job_id)
        if updated_job:
            try:
                sheet_title = sync_application(updated_job)
            except SheetsConfigError as exc:
                record_sync_event("google_sheets", proposal.job_id, "config_error", str(exc))
            except SheetsSyncError as exc:
                record_sync_event("google_sheets", proposal.job_id, "sync_error", str(exc))
            else:
                record_sync_event("google_sheets", proposal.job_id, "success", f"Synced to {sheet_title}.")

        current_job["status"] = proposal.new_status
        status_updates.append(event)

    updated_count = len(status_updates)
    message = (
        f"Checked {len(messages)} Gmail message(s). "
        f"Matched {matched_count}, updated {updated_count}, unmatched {unmatched_count}."
    )

    return jsonify(
        {
            "ok": True,
            "message": message,
            "data": {
                "emails": messages,
                "status_updates": status_updates,
                "matched_count": matched_count,
                "updated_count": updated_count,
                "unmatched_count": unmatched_count,
            },
        }
    )


@api_bp.post("/tracker/intake")
def tracker_intake():
    payload = request.form if request.form else (request.get_json(silent=True) or {})
    stage = str(payload.get("stage", "preview")).strip().lower() or "preview"
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
        review = preview_job_posting(job_url)
    except JobTrackerError as exc:
        return jsonify({"ok": False, "message": str(exc)}), 400

    parsed_resume_text = ""
    parsed_filename = filename
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

    if stage == "preview":
        if parsed_resume_text:
            tailored = build_tailored_resume(review.parsed_job, parsed_resume_text)

        message = "Job details parsed. Review and confirm before saving."
        if not review.requires_confirmation:
            message = "Job details look strong. Confirm to save and sync this application."

        return jsonify(
            {
                "ok": True,
                "message": message,
                "data": {
                    **review.to_response(),
                    "tailored_resume": tailored,
                },
            }
        )

    if stage != "confirm":
        return jsonify({"ok": False, "message": "Unsupported tracker stage."}), 400

    confirmed_job = build_confirmed_job(
        job_url=job_url,
        title=str(payload.get("title", "")).strip() or review.parsed_job.title,
        company=str(payload.get("company", "")).strip() or review.parsed_job.company,
        location=str(payload.get("location", "")).strip() or review.parsed_job.location,
        posted_at=str(payload.get("posted_at", "")).strip() or review.parsed_job.posted_at,
        source=str(payload.get("source", "")).strip() or review.parsed_job.source,
        source_type=str(payload.get("source_type", "")).strip() or review.parsed_job.source_type,
        description=str(payload.get("description", "")).strip() or review.parsed_job.description,
        description_snippet=str(payload.get("description_snippet", "")).strip()
        or review.parsed_job.description_snippet,
    )

    if parsed_resume_text:
        save_resume(filename=parsed_filename, raw_text=parsed_resume_text)
        tailored = build_tailored_resume(confirmed_job, parsed_resume_text)

    job_record = upsert_manual_job(confirmed_job.to_record(), status="Applied", notes=notes)

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
                **review.to_response(),
            },
        }
    )


@api_bp.post("/response-hub/actions")
def create_response_hub_action():
    payload = request.get_json(silent=True) or {}
    response_record = {
        "id": str(payload.get("id", "")).strip(),
        "company": str(payload.get("company", "")).strip(),
        "role": str(payload.get("role", "")).strip(),
        "recruiterName": str(payload.get("recruiterName", "")).strip(),
        "contactChannel": str(payload.get("contactChannel", "LinkedIn")).strip() or "LinkedIn",
        "contactHandle": str(payload.get("contactHandle", "")).strip(),
        "status": str(payload.get("status", "")).strip(),
        "lastUpdated": str(payload.get("lastUpdated", "")).strip(),
        "notes": str(payload.get("notes", "")).strip(),
    }

    if not response_record["id"] or not response_record["company"] or not response_record["role"] or not response_record["status"]:
        return jsonify({"ok": False, "message": "Company Action needs an id, company, role, and status."}), 400

    upsert_response_hub_entry(response_record)

    event_payload = payload.get("calendarEvent")
    if isinstance(event_payload, dict) and str(event_payload.get("startsAt", "")).strip():
        calendar_event = {
            "id": str(event_payload.get("id", "")).strip(),
            "responseId": response_record["id"],
            "company": response_record["company"],
            "role": response_record["role"],
            "recruiterName": response_record["recruiterName"],
            "type": str(event_payload.get("type", "")).strip(),
            "startsAt": str(event_payload.get("startsAt", "")).strip(),
            "location": str(event_payload.get("location", "")).strip(),
            "notes": str(event_payload.get("notes", "")).strip(),
        }
        if calendar_event["id"] and calendar_event["type"]:
            upsert_response_hub_event(calendar_event)

    return jsonify(
        {
            "ok": True,
            "message": "Company action saved.",
            "data": fetch_dashboard_data(),
        }
    )


@api_bp.patch("/response-hub/responses/<string:response_id>")
def update_response_action(response_id: str):
    payload = request.get_json(silent=True) or {}
    status = str(payload.get("status", "")).strip()
    if not status:
        return jsonify({"ok": False, "message": "Choose a status to update this company action."}), 400

    existing_ids = {item["id"] for item in fetch_response_hub_entries()}
    if response_id not in existing_ids:
        return jsonify({"ok": False, "message": "Company action not found."}), 404

    update_response_hub_status(response_id, status)
    return jsonify(
        {
            "ok": True,
            "message": "Company action updated.",
            "data": fetch_dashboard_data(),
        }
    )


@api_bp.delete("/response-hub/responses/<string:response_id>")
def delete_response_action(response_id: str):
    delete_response_hub_entry(response_id)
    return jsonify(
        {
            "ok": True,
            "message": "Company action deleted.",
            "data": fetch_dashboard_data(),
        }
    )


@api_bp.delete("/response-hub/events/<string:event_id>")
def delete_response_event(event_id: str):
    delete_response_hub_event(event_id)
    return jsonify(
        {
            "ok": True,
            "message": "Scheduled event deleted.",
            "data": fetch_dashboard_data(),
        }
    )
