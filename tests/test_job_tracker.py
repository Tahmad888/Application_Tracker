import unittest

from app.job_tracker import (
    build_tailored_resume,
    choose_best_title,
    parse_job_posting_html,
    should_attempt_rendered_fallback,
)


class JobTrackerTests(unittest.TestCase):
    def test_parse_job_posting_html_extracts_key_fields(self):
        html = """
        <html>
          <head>
            <title>Junior IT Support Specialist</title>
            <meta name="description" content="Provide troubleshooting, help desk, and documentation support." />
            <script type="application/ld+json">
              {
                "@context": "https://schema.org",
                "@type": "JobPosting",
                "title": "Junior IT Support Specialist",
                "description": "Provide troubleshooting, help desk, and documentation support.",
                "datePosted": "2026-04-08",
                "hiringOrganization": {"@type": "Organization", "name": "North Loop Health"},
                "jobLocation": {
                  "@type": "Place",
                  "address": {
                    "@type": "PostalAddress",
                    "addressLocality": "Minneapolis",
                    "addressRegion": "MN"
                  }
                }
              }
            </script>
          </head>
          <body><h1>Junior IT Support Specialist</h1></body>
        </html>
        """

        job = parse_job_posting_html("https://careers.example.com/jobs/junior-it-support-specialist", html)

        self.assertEqual(job.title, "Junior IT Support Specialist")
        self.assertEqual(job.company, "North Loop Health")
        self.assertEqual(job.location, "Minneapolis, MN")
        self.assertEqual(job.posted_at, "2026-04-08")
        self.assertIn("troubleshooting", job.description.lower())

    def test_build_tailored_resume_returns_prioritized_resume_text(self):
        html = """
        <html>
          <head>
            <title>Technical Support Analyst</title>
            <meta name="description" content="SQL, troubleshooting, Jira, and documentation support for customers." />
          </head>
          <body><h1>Technical Support Analyst</h1></body>
        </html>
        """
        job = parse_job_posting_html("https://jobs.example.com/technical-support-analyst", html)
        tailored = build_tailored_resume(
            job,
            """
            SUMMARY
            Recent graduate with PC technician experience.

            SKILLS
            troubleshooting, sql, jira, documentation, help desk
            """,
        )

        self.assertIn("Technical Support Analyst", tailored["tailored_text"])
        self.assertTrue(tailored["prioritized_skills"])
        self.assertIn("sql", [skill.lower() for skill in tailored["prioritized_skills"]])
        self.assertTrue(tailored["matched_strengths"])
        self.assertIn("documentation", tailored["tailored_text"].lower())

    def test_build_tailored_resume_surfaces_missing_requirements(self):
        html = """
        <html>
          <head>
            <title>Field Service Technician Network</title>
            <meta name="description" content="Install telecom equipment, troubleshoot network issues, and document service work in the field." />
          </head>
        </html>
        """
        job = parse_job_posting_html(
            "https://external-telecom-teldta.icims.com/jobs/28966/field-service-technician-network/job",
            html,
        )
        tailored = build_tailored_resume(
            job,
            """
            SUMMARY
            Recent graduate with customer service and documentation experience.

            SKILLS
            documentation, customer support, excel
            """,
        )

        self.assertTrue(tailored["missing_requirements"])
        self.assertTrue(tailored["project_suggestions"])
        self.assertIn("networking and field service work", " ".join(tailored["missing_requirements"]).lower())

    def test_icims_style_url_prefers_job_slug_over_generic_page_title(self):
        html = """
        <html>
          <head>
            <title>Careers | TDS</title>
            <meta property="og:title" content="Careers | TDS" />
            <meta name="description" content="Install and maintain telecom network services in the field." />
          </head>
          <body>
            <h1>Careers | TDS</h1>
          </body>
        </html>
        """

        job = parse_job_posting_html(
            "https://external-telecom-teldta.icims.com/jobs/28966/field-service-technician-network/job",
            html,
        )

        self.assertEqual(job.title, "Field Service Technician Network")
        self.assertEqual(job.company, "TDS")
        self.assertEqual(job.source, "iCIMS")

    def test_company_plus_careers_title_is_still_treated_as_generic(self):
        html = """
        <html>
          <head>
            <title>TDS Careers</title>
            <meta property="og:title" content="TDS Careers" />
            <meta name="description" content="Business analyst opening in enterprise IT." />
          </head>
          <body>
            <h1>TDS Careers</h1>
          </body>
        </html>
        """

        job = parse_job_posting_html(
            "https://external-telecom-teldta.icims.com/jobs/29065/analyst-it-business/job",
            html,
        )

        self.assertEqual(job.title, "Analyst IT Business")
        self.assertEqual(job.company, "TDS")

    def test_actalent_style_shell_title_uses_better_heading_candidate(self):
        html = """
        <html>
          <head>
            <title>S</title>
            <meta property="og:title" content="Apply" />
            <script>
              window.__JOB__ = {"jobTitle":"Field Service Technician - Network"};
            </script>
          </head>
          <body>
            <h2>Field Service Technician - Network</h2>
          </body>
        </html>
        """

        job = parse_job_posting_html(
            "https://apply.actalentservices.com/v1/s/?rx_job=JP-005944190",
            html,
        )

        self.assertEqual(job.title, "Field Service Technician - Network")
        self.assertEqual(job.company, "Actalent")
        self.assertEqual(job.source, "Actalent")

    def test_choose_best_title_prefers_real_role_over_junk_candidates(self):
        chosen = choose_best_title(
            [
                "S",
                "{o}",
                "Apply",
                "Click here",
                "Business Systems Analyst",
            ]
        )

        self.assertEqual(chosen, "Business Systems Analyst")

    def test_parse_job_posting_html_rejects_junk_and_finds_better_script_title(self):
        html = """
        <html>
          <head>
            <title>{o}</title>
            <meta property="og:title" content="Apply" />
            <script>
              window.__payload__ = {
                "x":"{o}",
                "foo":"Business Systems Analyst"
              };
            </script>
          </head>
          <body>
            <h3>Apply now</h3>
          </body>
        </html>
        """

        job = parse_job_posting_html(
            "https://apply.example.com/v1/s/?job=123",
            html,
        )

        self.assertEqual(job.title, "Business Systems Analyst")

    def test_low_confidence_draft_triggers_rendered_fallback(self):
        html = """
        <html>
          <head>
            <title>S</title>
            <script>window.__STATE__ = {};</script>
          </head>
          <body><div id="root"></div></body>
        </html>
        """

        draft = parse_job_posting_html("https://apply.example.com/v1/s/?job=123", html)

        self.assertTrue(should_attempt_rendered_fallback(draft, html))


if __name__ == "__main__":
    unittest.main()
