import os
import tempfile
import unittest

from app import create_app


class ResponseHubApiTests(unittest.TestCase):
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

    def test_response_hub_action_persists_to_dashboard(self):
        create_response = self.client.post(
            "/api/response-hub/actions",
            json={
                "id": "response-1",
                "company": "TempWorks",
                "role": "Support Analyst",
                "recruiterName": "Jamie",
                "contactChannel": "Gmail",
                "contactHandle": "jamie@example.com",
                "status": "Interview Scheduled",
                "lastUpdated": "2026-04-20",
                "notes": "Phone screen booked.",
                "calendarEvent": {
                    "id": "event-1",
                    "type": "Interview",
                    "startsAt": "2026-04-21T10:00",
                    "location": "Zoom",
                    "notes": "Phone screen booked.",
                },
            },
        )

        self.assertEqual(create_response.status_code, 200)
        payload = create_response.get_json()
        self.assertTrue(payload["ok"])
        self.assertEqual(len(payload["data"]["response_hub"]["responses"]), 1)
        self.assertEqual(len(payload["data"]["response_hub"]["calendar_events"]), 1)

        dashboard = self.client.get("/api/dashboard")
        self.assertEqual(dashboard.status_code, 200)
        dashboard_payload = dashboard.get_json()
        self.assertEqual(
            dashboard_payload["response_hub"]["responses"][0]["status"],
            "Interview Scheduled",
        )
        self.assertEqual(
            dashboard_payload["response_hub"]["calendar_events"][0]["company"],
            "TempWorks",
        )

    def test_updating_status_to_non_scheduled_removes_calendar_event(self):
        self.client.post(
            "/api/response-hub/actions",
            json={
                "id": "response-2",
                "company": "Nexus Family Healing",
                "role": "IT Technician",
                "recruiterName": "Jamie",
                "contactChannel": "Gmail",
                "contactHandle": "jamie@example.com",
                "status": "Recruiter Call Scheduled",
                "lastUpdated": "2026-04-20",
                "notes": "Call booked.",
                "calendarEvent": {
                    "id": "event-2",
                    "type": "Recruiter Call",
                    "startsAt": "2026-04-22T11:30",
                    "location": "Phone",
                    "notes": "Call booked.",
                },
            },
        )

        update_response = self.client.patch(
            "/api/response-hub/responses/response-2",
            json={"status": "Interviewing"},
        )
        self.assertEqual(update_response.status_code, 200)

        dashboard = self.client.get("/api/dashboard").get_json()
        self.assertEqual(dashboard["response_hub"]["responses"][0]["status"], "Interviewing")
        self.assertEqual(len(dashboard["response_hub"]["calendar_events"]), 0)

    def test_deleting_response_removes_entry(self):
        self.client.post(
            "/api/response-hub/actions",
            json={
                "id": "response-3",
                "company": "Apple",
                "role": "Technical Support",
                "recruiterName": "Kyle",
                "contactChannel": "Gmail",
                "contactHandle": "kyle@example.com",
                "status": "Awaiting Reply",
                "lastUpdated": "2026-04-20",
                "notes": "Waiting to hear back.",
            },
        )

        delete_response = self.client.delete("/api/response-hub/responses/response-3")
        self.assertEqual(delete_response.status_code, 200)

        dashboard = self.client.get("/api/dashboard").get_json()
        self.assertEqual(dashboard["response_hub"]["responses"], [])


if __name__ == "__main__":
    unittest.main()
