from __future__ import annotations

import os
from pathlib import Path

from flask import Flask, request

from .api import api_bp
from .db import close_db, init_db
from .routes import bp


def create_app(test_config: dict | None = None) -> Flask:
    app = Flask(__name__, instance_relative_config=True)
    app.config.from_mapping(
        SECRET_KEY="dev",
        DATABASE=str(Path(app.instance_path) / "job_assistant.db"),
        SAMPLE_JOB_FILE=str(Path(app.root_path) / "data" / "sample_jobs.json"),
        GOOGLE_SHEETS_ENABLED=os.environ.get("GOOGLE_SHEETS_ENABLED", "1") == "1",
        GOOGLE_SERVICE_ACCOUNT_FILE=os.environ.get(
            "GOOGLE_SERVICE_ACCOUNT_FILE",
            "/Users/talhaahmad/Downloads/jobfinder-492510-b574bbd775c5.json",
        ),
        GOOGLE_SHEETS_SPREADSHEET_ID=os.environ.get(
            "GOOGLE_SHEETS_SPREADSHEET_ID",
            "1ur047SwAGSqcsDMOdvnDm53zPdjxm36WnV54IRScQXI",
        ),
        GOOGLE_SHEETS_TAB_NAME=os.environ.get("GOOGLE_SHEETS_TAB_NAME", ""),
        GOOGLE_SHEETS_TAB_GID=os.environ.get("GOOGLE_SHEETS_TAB_GID", "0"),
        GMAIL_ENABLED=os.environ.get("GMAIL_ENABLED", "1") == "1",
        GOOGLE_OAUTH_CLIENT_ID=os.environ.get("GOOGLE_OAUTH_CLIENT_ID", ""),
        GOOGLE_OAUTH_CLIENT_SECRET=os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET", ""),
        GOOGLE_OAUTH_REDIRECT_URI=os.environ.get(
            "GOOGLE_OAUTH_REDIRECT_URI",
            "http://127.0.0.1:5000/oauth/google/callback",
        ),
        FRONTEND_URL=os.environ.get("FRONTEND_URL", "http://127.0.0.1:3000"),
        GMAIL_TARGET_EMAIL=os.environ.get("GMAIL_TARGET_EMAIL", ""),
        GMAIL_SCOPES=(
            "https://www.googleapis.com/auth/gmail.readonly",
        ),
    )

    app.config.from_pyfile("local_settings.py", silent=True)

    if test_config:
        app.config.update(test_config)

    Path(app.instance_path).mkdir(parents=True, exist_ok=True)

    with app.app_context():
        init_db()

    @app.after_request
    def add_cors_headers(response):
        request_origin = request.headers.get("Origin", "")
        allowed_origins = {
            os.environ.get("ALLOWED_WEB_ORIGIN", "http://127.0.0.1:3000"),
            "http://localhost:3000",
        }
        if request_origin in allowed_origins:
            response.headers["Access-Control-Allow-Origin"] = request_origin
        response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type")
        response.headers.setdefault("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS")
        return response

    app.teardown_appcontext(close_db)
    app.register_blueprint(bp)
    app.register_blueprint(api_bp)

    return app
