from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from flask import current_app, g

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS resumes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    filename TEXT NOT NULL,
    raw_text TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS keywords (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    keyword TEXT NOT NULL,
    score REAL NOT NULL,
    FOREIGN KEY (resume_id) REFERENCES resumes (id)
);

CREATE TABLE IF NOT EXISTS search_queries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    resume_id INTEGER NOT NULL,
    query TEXT NOT NULL,
    FOREIGN KEY (resume_id) REFERENCES resumes (id)
);

CREATE TABLE IF NOT EXISTS jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    external_id TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    company TEXT NOT NULL,
    location TEXT NOT NULL,
    posted_at TEXT NOT NULL,
    source TEXT NOT NULL,
    source_type TEXT NOT NULL DEFAULT 'sample',
    job_url TEXT NOT NULL,
    description TEXT NOT NULL,
    description_snippet TEXT NOT NULL,
    match_score REAL NOT NULL DEFAULT 0,
    archetype TEXT NOT NULL DEFAULT '',
    archetype_label TEXT NOT NULL DEFAULT '',
    fit_label TEXT NOT NULL DEFAULT '',
    evaluation_summary TEXT NOT NULL DEFAULT '',
    score_breakdown TEXT NOT NULL DEFAULT '{}',
    strengths TEXT NOT NULL DEFAULT '[]',
    concerns TEXT NOT NULL DEFAULT '[]',
    matched_keywords TEXT NOT NULL DEFAULT '[]',
    applied INTEGER NOT NULL DEFAULT 0,
    seeded_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS applications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL UNIQUE,
    applied_at TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (job_id) REFERENCES jobs (id)
);

CREATE TABLE IF NOT EXISTS sync_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    target TEXT NOT NULL,
    record_id INTEGER NOT NULL,
    status TEXT NOT NULL,
    message TEXT NOT NULL,
    synced_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS gmail_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL DEFAULT '',
    token_uri TEXT NOT NULL,
    scopes TEXT NOT NULL,
    expiry TEXT NOT NULL DEFAULT '',
    connected_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS application_status_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    old_status TEXT NOT NULL,
    new_status TEXT NOT NULL,
    source TEXT NOT NULL,
    email_id TEXT NOT NULL DEFAULT '',
    email_subject TEXT NOT NULL DEFAULT '',
    matched_from TEXT NOT NULL DEFAULT '',
    email_snippet TEXT NOT NULL DEFAULT '',
    observed_at TEXT NOT NULL,
    is_seen INTEGER NOT NULL DEFAULT 0,
    UNIQUE(job_id, email_id, new_status),
    FOREIGN KEY (job_id) REFERENCES jobs (id)
);

CREATE TABLE IF NOT EXISTS response_hub_entries (
    id TEXT PRIMARY KEY,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    recruiter_name TEXT NOT NULL DEFAULT '',
    contact_channel TEXT NOT NULL DEFAULT 'LinkedIn',
    contact_handle TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL,
    last_updated TEXT NOT NULL,
    notes TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS response_hub_events (
    id TEXT PRIMARY KEY,
    response_id TEXT NOT NULL UNIQUE,
    company TEXT NOT NULL,
    role TEXT NOT NULL,
    recruiter_name TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    location TEXT NOT NULL DEFAULT '',
    notes TEXT NOT NULL DEFAULT '',
    FOREIGN KEY (response_id) REFERENCES response_hub_entries (id) ON DELETE CASCADE
);
"""


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(
            current_app.config["DATABASE"],
            detect_types=sqlite3.PARSE_DECLTYPES,
        )
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


def close_db(_error: Exception | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db() -> None:
    db = get_db()
    db.executescript(SCHEMA_SQL)
    ensure_job_columns(db)
    db.commit()


def load_sample_jobs() -> list[dict]:
    sample_file = Path(current_app.config["SAMPLE_JOB_FILE"])
    with sample_file.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def ensure_job_columns(db: sqlite3.Connection) -> None:
    existing_columns = {
        row["name"]
        for row in db.execute("PRAGMA table_info(jobs)").fetchall()
    }
    expected_columns = {
        "archetype": "TEXT NOT NULL DEFAULT ''",
        "archetype_label": "TEXT NOT NULL DEFAULT ''",
        "fit_label": "TEXT NOT NULL DEFAULT ''",
        "evaluation_summary": "TEXT NOT NULL DEFAULT ''",
        "score_breakdown": "TEXT NOT NULL DEFAULT '{}'",
        "strengths": "TEXT NOT NULL DEFAULT '[]'",
        "concerns": "TEXT NOT NULL DEFAULT '[]'",
    }

    for column_name, definition in expected_columns.items():
        if column_name not in existing_columns:
            db.execute(f"ALTER TABLE jobs ADD COLUMN {column_name} {definition}")
