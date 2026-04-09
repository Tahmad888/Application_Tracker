import unittest

from app.google_sheets import build_application_row


class GoogleSheetsTests(unittest.TestCase):
    def test_build_application_row_uses_expected_order(self):
        row = build_application_row(
            {
                "id": 7,
                "title": "Data Analyst",
                "company": "North Loop Health",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-06",
                "source": "Company Careers",
                "job_url": "https://example.com/jobs/7",
                "application": {
                    "applied_at": "2026-04-06T10:00:00Z",
                    "status": "Applied",
                    "notes": "",
                },
            }
        )

        self.assertEqual(
            row,
            [
                "7",
                "Data Analyst",
                "North Loop Health",
                "Minneapolis, MN",
                "2026-04-06",
                "2026-04-06T10:00:00Z",
                "Company Careers",
                "https://example.com/jobs/7",
                "Applied",
                "",
            ],
        )


if __name__ == "__main__":
    unittest.main()
