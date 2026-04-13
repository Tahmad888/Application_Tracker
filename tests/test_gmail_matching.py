import unittest

from app.gmail_matching import classify_email_status, match_email_to_job, should_advance_status


class GmailMatchingTests(unittest.TestCase):
    def test_classify_received_email(self):
        status = classify_email_status(
            {
                "subject": "Thank you for applying to Paycom",
                "snippet": "We have received your application for the role.",
            }
        )
        self.assertEqual(status, "Received")

    def test_classify_under_review_email_as_in_review(self):
        status = classify_email_status(
            {
                "subject": "Application Received",
                "snippet": "We have received your resume and are reviewing it at this time.",
            }
        )
        self.assertEqual(status, "In Review")

    def test_classify_interview_email(self):
        status = classify_email_status(
            {
                "subject": "Interview availability for IT Business Analyst Intern",
                "snippet": "Please share your availability to schedule an interview.",
            }
        )
        self.assertEqual(status, "Interview")

    def test_should_not_downgrade_later_stage(self):
        self.assertFalse(should_advance_status("Interview", "Received"))
        self.assertFalse(should_advance_status("Offer", "Rejected"))

    def test_match_email_to_job_uses_company_and_title(self):
        result = match_email_to_job(
            {
                "id": "msg-1",
                "from": "Paycom Recruiting <careers@paycom.com>",
                "subject": "Thank you for applying to IT Business Analyst Intern",
                "snippet": "We have received your application.",
            },
            [
                {"id": 4, "title": "IT Business Analyst Intern", "company": "Paycom", "status": "Applied"},
                {"id": 9, "title": "Security Analyst", "company": "Entrust", "status": "Applied"},
            ],
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.job_id, 4)
        self.assertEqual(result.new_status, "Received")

    def test_match_email_to_job_returns_none_for_weak_match(self):
        result = match_email_to_job(
            {
                "id": "msg-2",
                "from": "notifications@greenhouse.io",
                "subject": "Application update",
                "snippet": "Thanks for your interest.",
            },
            [
                {"id": 1, "title": "IT Support Specialist", "company": "Paycom", "status": "Applied"},
                {"id": 2, "title": "Security Engineer", "company": "Entrust", "status": "Applied"},
            ],
        )

        self.assertIsNone(result)

    def test_match_email_to_job_can_use_unique_strong_title_when_sender_is_generic(self):
        result = match_email_to_job(
            {
                "id": "msg-3",
                "from": "notifications@applytojob.com",
                "subject": "Application Received",
                "snippet": "Thank you for your interest in Help Desk Technician. We have received your resume and are reviewing it at this time.",
            },
            [
                {"id": 1, "title": "Help Desk Technician", "company": "MRA Recruiting Services", "status": "Applied"},
                {"id": 2, "title": "Security Engineer", "company": "Entrust", "status": "Applied"},
            ],
        )

        self.assertIsNotNone(result)
        assert result is not None
        self.assertEqual(result.job_id, 1)
        self.assertEqual(result.new_status, "In Review")


if __name__ == "__main__":
    unittest.main()
