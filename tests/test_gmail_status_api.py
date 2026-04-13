import os
import tempfile
import unittest
from unittest.mock import patch

from app import create_app
from app.db import get_db
from app.repository import fetch_dashboard_data, upsert_manual_job


class GmailStatusApiTests(unittest.TestCase):
    def setUp(self):
        self.database_file = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
        self.database_file.close()
        self.app = create_app(
            {
                "TESTING": True,
                "DATABASE": self.database_file.name,
                "GOOGLE_SHEETS_ENABLED": False,
            }
        )
        self.client = self.app.test_client()
        with self.app.app_context():
            upsert_manual_job(
                {
                    "external_id": "tracked-paycom-1",
                    "title": "IT Business Analyst Intern",
                    "company": "Paycom",
                    "location": "Remote",
                    "posted_at": "2026-04-10",
                    "source": "Manual Tracker",
                    "source_type": "manual tracker",
                    "job_url": "https://example.com/paycom-role",
                    "description": "Support internal IT systems and business analysis work.",
                    "description_snippet": "Support internal IT systems and business analysis work.",
                    "seeded_at": "2026-04-10T08:00:00Z",
                },
                status="Applied",
            )
            db = get_db()
            db.execute(
                """
                INSERT INTO gmail_connections (
                    email, access_token, refresh_token, token_uri, scopes, expiry, connected_at, updated_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    "tester@example.com",
                    "token",
                    "refresh",
                    "https://oauth2.googleapis.com/token",
                    '["https://www.googleapis.com/auth/gmail.readonly"]',
                    "",
                    "2026-04-11T00:00:00Z",
                    "2026-04-11T00:00:00Z",
                ),
            )
            db.commit()

    def tearDown(self):
        try:
            os.unlink(self.database_file.name)
        except FileNotFoundError:
            pass

    def test_gmail_check_updates_status_and_creates_notification(self):
        with patch(
            "app.api.list_recent_job_emails",
            return_value=[
                {
                    "id": "gmail-1",
                    "from": "Paycom Recruiting <careers@paycom.com>",
                    "subject": "Thank you for applying to IT Business Analyst Intern",
                    "date": "Fri, 11 Apr 2026 09:00:00 -0500",
                    "snippet": "We have received your application and our team will review it.",
                }
            ],
        ), patch("app.api.sync_application", return_value="Applications"):
            response = self.client.post("/api/gmail/check")

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(payload["data"]["updated_count"], 1)

        with self.app.app_context():
            dashboard = fetch_dashboard_data()
            db = get_db()
            application = db.execute("SELECT status FROM applications LIMIT 1").fetchone()
            event_count = db.execute("SELECT COUNT(*) AS count FROM application_status_events").fetchone()["count"]

        self.assertEqual(application["status"], "In Review")
        self.assertEqual(event_count, 1)
        self.assertEqual(dashboard["status_notifications"][0]["new_status"], "In Review")

    def test_repeated_gmail_check_does_not_duplicate_notification(self):
        email_payload = [
            {
                "id": "gmail-2",
                "from": "Paycom Recruiting <careers@paycom.com>",
                "subject": "Thank you for applying to IT Business Analyst Intern",
                "date": "Fri, 11 Apr 2026 09:00:00 -0500",
                "snippet": "We have received your application and our team will review it.",
            }
        ]

        with patch("app.api.list_recent_job_emails", return_value=email_payload), patch(
            "app.api.sync_application",
            return_value="Applications",
        ) as sync_mock:
            first = self.client.post("/api/gmail/check")
            second = self.client.post("/api/gmail/check")

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.get_json()["data"]["updated_count"], 0)
        self.assertGreaterEqual(sync_mock.call_count, 2)

        with self.app.app_context():
            db = get_db()
            event_count = db.execute("SELECT COUNT(*) AS count FROM application_status_events").fetchone()["count"]

        self.assertEqual(event_count, 1)


if __name__ == "__main__":
    unittest.main()
