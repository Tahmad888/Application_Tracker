import os
import tempfile
import unittest
from unittest.mock import patch

from app import create_app
from app.db import get_db
from app.job_tracker import TrackedJobDraft, TrackerParseReview


class TrackerApiTests(unittest.TestCase):
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

    def tearDown(self):
        try:
            os.unlink(self.database_file.name)
        except FileNotFoundError:
            pass

    def make_review(
        self,
        *,
        title: str,
        company: str = "Actalent",
        confidence_score: int = 28,
        confidence_level: str = "low",
        warnings: list[str] | None = None,
        location: str = "Location not listed",
    ) -> TrackerParseReview:
        return TrackerParseReview(
            parsed_job=TrackedJobDraft(
                external_id="tracked-test-job",
                title=title,
                company=company,
                location=location,
                posted_at="2026-04-10",
                source=company,
                source_type="manual tracker",
                job_url="https://example.com/jobs/test-role",
                description="Test posting for tracker review.",
                description_snippet="Test posting for tracker review.",
                seeded_at="2026-04-10T08:00:00Z",
            ),
            confidence_score=confidence_score,
            confidence_level=confidence_level,
            parse_warnings=warnings or ["The extracted job title looks weak or incomplete."],
            requires_confirmation=confidence_level != "high" or bool(warnings),
        )

    def test_preview_stage_returns_review_without_persisting(self):
        with patch("app.api.preview_job_posting", return_value=self.make_review(title="count")):
            response = self.client.post(
                "/api/tracker/intake",
                data={"stage": "preview", "job_url": "https://example.com/jobs/test-role"},
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertTrue(payload["data"]["requires_confirmation"])

        with self.app.app_context():
            db = get_db()
            job_count = db.execute("SELECT COUNT(*) AS count FROM jobs").fetchone()["count"]
            application_count = db.execute("SELECT COUNT(*) AS count FROM applications").fetchone()["count"]

        self.assertEqual(job_count, 0)
        self.assertEqual(application_count, 0)

    def test_confirm_stage_saves_corrected_values_and_uses_them_for_tailoring(self):
        with patch("app.api.preview_job_posting", return_value=self.make_review(title="count", company="Paycomonline")):
            response = self.client.post(
                "/api/tracker/intake",
                data={
                    "stage": "confirm",
                    "job_url": "https://example.com/jobs/test-role",
                    "title": "IT Business Analyst Intern",
                    "company": "Paycom",
                    "location": "Remote",
                    "description_snippet": "Support internal IT systems, document workflows, and help analyze business requests.",
                    "description": "Support internal IT systems, document workflows, and help analyze business requests.",
                    "resume_text": """
                    SUMMARY
                    Recent graduate with internship and PC technician experience.

                    SKILLS
                    documentation, analysis, troubleshooting, jira
                    """,
                },
            )

        self.assertEqual(response.status_code, 200)
        payload = response.get_json()
        self.assertTrue(payload["ok"])
        self.assertIn("IT Business Analyst Intern", payload["data"]["tailored_resume"]["tailored_text"])

        with self.app.app_context():
            db = get_db()
            stored = db.execute(
                "SELECT title, company, location FROM jobs ORDER BY id DESC LIMIT 1",
            ).fetchone()
            application_count = db.execute("SELECT COUNT(*) AS count FROM applications").fetchone()["count"]

        self.assertIsNotNone(stored)
        self.assertEqual(stored["title"], "IT Business Analyst Intern")
        self.assertEqual(stored["company"], "Paycom")
        self.assertEqual(stored["location"], "Remote")
        self.assertEqual(application_count, 1)


if __name__ == "__main__":
    unittest.main()
