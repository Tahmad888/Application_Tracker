from __future__ import annotations

import json
from datetime import datetime
from typing import Any

from .db import get_db
from .matching import JobMatch, resolve_job_url
from .parser import KeywordScore, infer_candidate_profile


def save_resume(filename: str, raw_text: str) -> int:
    db = get_db()
    cursor = db.execute(
        """
        INSERT INTO resumes (filename, raw_text, uploaded_at)
        VALUES (?, ?, ?)
        """,
        (filename, raw_text, utc_now()),
    )
    db.commit()
    return int(cursor.lastrowid)


def replace_keywords(resume_id: int, keywords: list[KeywordScore], queries: list[str]) -> None:
    db = get_db()
    db.execute("DELETE FROM keywords WHERE resume_id = ?", (resume_id,))
    db.execute("DELETE FROM search_queries WHERE resume_id = ?", (resume_id,))

    db.executemany(
        """
        INSERT INTO keywords (resume_id, category, keyword, score)
        VALUES (?, ?, ?, ?)
        """,
        [(resume_id, item.category, item.keyword, item.score) for item in keywords],
    )
    db.executemany(
        """
        INSERT INTO search_queries (resume_id, query)
        VALUES (?, ?)
        """,
        [(resume_id, query) for query in queries],
    )
    db.commit()


def upsert_jobs(matches: list[JobMatch]) -> None:
    db = get_db()
    active_external_ids = [match.external_id for match in matches]

    if active_external_ids:
        placeholders = ", ".join("?" for _ in active_external_ids)
        db.execute(
            f"""
            DELETE FROM jobs
            WHERE applied = 0 AND external_id NOT IN ({placeholders})
            """,
            active_external_ids,
        )
    else:
        db.execute("DELETE FROM jobs WHERE applied = 0")

    for match in matches:
        record = match.to_record()
        db.execute(
            """
            INSERT INTO jobs (
                external_id, title, company, location, posted_at, source, source_type,
                job_url, description, description_snippet, match_score, archetype,
                archetype_label, fit_label, evaluation_summary, score_breakdown,
                strengths, concerns, matched_keywords, seeded_at
            )
            VALUES (
                :external_id, :title, :company, :location, :posted_at, :source,
                :source_type, :job_url, :description, :description_snippet, :match_score,
                :archetype, :archetype_label, :fit_label, :evaluation_summary,
                :score_breakdown, :strengths, :concerns, :matched_keywords, :seeded_at
            )
            ON CONFLICT(external_id) DO UPDATE SET
                title = excluded.title,
                company = excluded.company,
                location = excluded.location,
                posted_at = excluded.posted_at,
                source = excluded.source,
                source_type = excluded.source_type,
                job_url = excluded.job_url,
                description = excluded.description,
                description_snippet = excluded.description_snippet,
                match_score = excluded.match_score,
                archetype = excluded.archetype,
                archetype_label = excluded.archetype_label,
                fit_label = excluded.fit_label,
                evaluation_summary = excluded.evaluation_summary,
                score_breakdown = excluded.score_breakdown,
                strengths = excluded.strengths,
                concerns = excluded.concerns,
                matched_keywords = excluded.matched_keywords,
                seeded_at = excluded.seeded_at
            """,
            record,
        )
    db.commit()


def mark_job_applied(job_id: int) -> None:
    db = get_db()
    db.execute("UPDATE jobs SET applied = 1 WHERE id = ?", (job_id,))
    db.execute(
        """
        INSERT INTO applications (job_id, applied_at, status)
        VALUES (?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            applied_at = excluded.applied_at,
            status = excluded.status
        """,
        (job_id, utc_now(), "Applied"),
    )
    db.commit()


def upsert_manual_job(job: dict[str, Any], *, status: str = "Applied", notes: str = "") -> dict[str, Any]:
    db = get_db()
    db.execute(
        """
        INSERT INTO jobs (
            external_id, title, company, location, posted_at, source, source_type,
            job_url, description, description_snippet, match_score, archetype,
            archetype_label, fit_label, evaluation_summary, score_breakdown,
            strengths, concerns, matched_keywords, applied, seeded_at
        )
        VALUES (
            :external_id, :title, :company, :location, :posted_at, :source, :source_type,
            :job_url, :description, :description_snippet, 0, '', '', 'Tracked',
            'Manual job tracker entry.', '{}', '[]', '[]', '[]', 1, :seeded_at
        )
        ON CONFLICT(external_id) DO UPDATE SET
            title = excluded.title,
            company = excluded.company,
            location = excluded.location,
            posted_at = excluded.posted_at,
            source = excluded.source,
            source_type = excluded.source_type,
            job_url = excluded.job_url,
            description = excluded.description,
            description_snippet = excluded.description_snippet,
            applied = 1,
            seeded_at = excluded.seeded_at
        """,
        job,
    )

    stored = db.execute(
        "SELECT id FROM jobs WHERE external_id = ?",
        (job["external_id"],),
    ).fetchone()
    if not stored:
        db.commit()
        raise RuntimeError("Tracked job could not be saved.")

    job_id = int(stored["id"])
    db.execute(
        """
        INSERT INTO applications (job_id, applied_at, status, notes)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(job_id) DO UPDATE SET
            applied_at = excluded.applied_at,
            status = excluded.status,
            notes = excluded.notes
        """,
        (job_id, utc_now(), status, notes),
    )
    db.commit()
    return fetch_job(job_id) or {}


def record_sync_event(target: str, record_id: int, status: str, message: str) -> None:
    db = get_db()
    db.execute(
        """
        INSERT INTO sync_logs (target, record_id, status, message, synced_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (target, record_id, status, message, utc_now()),
    )
    db.commit()


def upsert_gmail_connection(email: str, token_record: dict[str, str]) -> None:
    db = get_db()
    now = utc_now()
    db.execute(
        """
        INSERT INTO gmail_connections (
            email, access_token, refresh_token, token_uri, scopes, expiry, connected_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            access_token = excluded.access_token,
            refresh_token = CASE
                WHEN excluded.refresh_token != '' THEN excluded.refresh_token
                ELSE gmail_connections.refresh_token
            END,
            token_uri = excluded.token_uri,
            scopes = excluded.scopes,
            expiry = excluded.expiry,
            updated_at = excluded.updated_at
        """,
        (
            email,
            token_record["access_token"],
            token_record["refresh_token"],
            token_record["token_uri"],
            token_record["scopes"],
            token_record["expiry"],
            now,
            now,
        ),
    )
    db.commit()


def fetch_gmail_connection() -> dict[str, Any] | None:
    db = get_db()
    connection = db.execute(
        """
        SELECT *
        FROM gmail_connections
        ORDER BY updated_at DESC
        LIMIT 1
        """
    ).fetchone()
    return dict(connection) if connection else None


def fetch_tracked_jobs_for_status_matching() -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            jobs.id,
            jobs.title,
            jobs.company,
            jobs.location,
            jobs.job_url,
            jobs.posted_at,
            applications.applied_at,
            applications.status,
            applications.notes
        FROM jobs
        JOIN applications ON applications.job_id = jobs.id
        WHERE jobs.applied = 1
        ORDER BY applications.applied_at DESC
        """
    ).fetchall()
    return [dict(row) for row in rows]


def apply_gmail_status_update(
    *,
    job_id: int,
    old_status: str,
    new_status: str,
    email_id: str,
    email_subject: str,
    matched_from: str,
    email_snippet: str,
) -> dict[str, Any]:
    db = get_db()
    db.execute(
        """
        UPDATE applications
        SET status = ?
        WHERE job_id = ?
        """,
        (new_status, job_id),
    )
    db.execute(
        """
        INSERT OR IGNORE INTO application_status_events (
            job_id, old_status, new_status, source, email_id, email_subject,
            matched_from, email_snippet, observed_at, is_seen
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            job_id,
            old_status,
            new_status,
            "gmail",
            email_id,
            email_subject,
            matched_from,
            email_snippet,
            utc_now(),
        ),
    )
    db.commit()
    row = db.execute(
        """
        SELECT
            application_status_events.id,
            application_status_events.job_id,
            application_status_events.old_status,
            application_status_events.new_status,
            application_status_events.source,
            application_status_events.email_id,
            application_status_events.email_subject,
            application_status_events.matched_from,
            application_status_events.email_snippet,
            application_status_events.observed_at,
            application_status_events.is_seen,
            jobs.title,
            jobs.company
        FROM application_status_events
        JOIN jobs ON jobs.id = application_status_events.job_id
        WHERE application_status_events.job_id = ?
          AND application_status_events.email_id = ?
          AND application_status_events.new_status = ?
        ORDER BY application_status_events.id DESC
        LIMIT 1
        """,
        (job_id, email_id, new_status),
    ).fetchone()
    return dict(row) if row else {}


def fetch_status_notifications(limit: int = 6) -> list[dict[str, Any]]:
    db = get_db()
    rows = db.execute(
        """
        SELECT
            application_status_events.id,
            application_status_events.job_id,
            application_status_events.old_status,
            application_status_events.new_status,
            application_status_events.source,
            application_status_events.email_id,
            application_status_events.email_subject,
            application_status_events.matched_from,
            application_status_events.email_snippet,
            application_status_events.observed_at,
            application_status_events.is_seen,
            jobs.title,
            jobs.company
        FROM application_status_events
        JOIN jobs ON jobs.id = application_status_events.job_id
        ORDER BY application_status_events.observed_at DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()
    return [dict(row) for row in rows]


def fetch_dashboard_data() -> dict[str, Any]:
    db = get_db()
    latest_resume = db.execute(
        "SELECT * FROM resumes ORDER BY uploaded_at DESC LIMIT 1"
    ).fetchone()

    keywords = []
    queries = []
    profile = None
    if latest_resume:
        keywords = db.execute(
            """
            SELECT category, keyword, score
            FROM keywords
            WHERE resume_id = ?
            ORDER BY score DESC, keyword ASC
            LIMIT 20
            """,
            (latest_resume["id"],),
        ).fetchall()
        queries = db.execute(
            """
            SELECT query
            FROM search_queries
            WHERE resume_id = ?
            ORDER BY id ASC
            """,
            (latest_resume["id"],),
        ).fetchall()
        profile = infer_candidate_profile(
            dict(latest_resume)["raw_text"],
            [
                KeywordScore(
                    category=item["category"],
                    keyword=item["keyword"],
                    score=item["score"],
                )
                for item in keywords
            ],
            [item["query"] for item in queries],
        )

    jobs = db.execute(
        """
        SELECT *
        FROM jobs
        ORDER BY applied ASC, match_score DESC, posted_at DESC
        """
    ).fetchall()

    applications = db.execute(
        """
        SELECT applications.job_id, applications.applied_at, applications.status, applications.notes
        FROM applications
        """
    ).fetchall()

    application_map = {item["job_id"]: dict(item) for item in applications}

    hydrated_jobs = []
    for job in jobs:
        item = dict(job)
        item["job_url"] = resolve_job_url(item)
        item["matched_keywords"] = json.loads(item["matched_keywords"])
        item["score_breakdown"] = json.loads(item["score_breakdown"])
        item["strengths"] = json.loads(item["strengths"])
        item["concerns"] = json.loads(item["concerns"])
        item["application"] = application_map.get(item["id"])
        hydrated_jobs.append(item)

    today_prefix = datetime.utcnow().date().isoformat()
    current_year = datetime.utcnow().year
    tracker_stats = {
        "applied_ytd": sum(
            1
            for item in application_map.values()
            if str(item.get("applied_at", "")).startswith(str(current_year))
        ),
        "applied_today": sum(
            1
            for item in application_map.values()
            if str(item.get("applied_at", "")).startswith(today_prefix)
        ),
    }

    return {
        "resume": dict(latest_resume) if latest_resume else None,
        "profile": (
            {
                "archetype": profile.archetype,
                "archetype_label": profile.archetype_label,
                "primary_titles": profile.primary_titles,
                "top_technologies": profile.top_technologies,
                "certifications": profile.certifications,
                "years_experience": profile.years_experience,
                "preferred_seniority": profile.preferred_seniority,
                "early_career": profile.early_career,
                "summary": profile.summary,
            }
            if profile
            else None
        ),
        "keywords": [dict(item) for item in keywords],
        "queries": [item["query"] for item in queries],
        "jobs": hydrated_jobs,
        "tracker_stats": tracker_stats,
        "gmail_connection": fetch_gmail_connection(),
        "status_notifications": fetch_status_notifications(),
    }


def fetch_job(job_id: int) -> dict[str, Any] | None:
    db = get_db()
    job = db.execute("SELECT * FROM jobs WHERE id = ?", (job_id,)).fetchone()
    if not job:
        return None
    item = dict(job)
    item["job_url"] = resolve_job_url(item)
    item["matched_keywords"] = json.loads(item["matched_keywords"])
    item["score_breakdown"] = json.loads(item["score_breakdown"])
    item["strengths"] = json.loads(item["strengths"])
    item["concerns"] = json.loads(item["concerns"])
    item["application"] = db.execute(
        "SELECT applied_at, status, notes FROM applications WHERE job_id = ?",
        (job_id,),
    ).fetchone()
    if item["application"]:
        item["application"] = dict(item["application"])
    return item


def utc_now() -> str:
    return datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
