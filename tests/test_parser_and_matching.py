import unittest

from app.matching import score_jobs
from app.parser import extract_keywords, infer_candidate_profile


class ParserAndMatchingTests(unittest.TestCase):
    def test_extract_keywords_finds_titles_and_tools(self):
        resume = """
        SUMMARY
        Data Analyst with 5 years of experience building dashboards and reports.

        SKILLS
        Python, SQL, Tableau, Excel

        EXPERIENCE
        Built KPI dashboards and improved reporting accuracy.
        """

        keywords, queries = extract_keywords(resume)

        self.assertTrue(any(item.keyword == "data analyst" for item in keywords))
        self.assertTrue(any(item.keyword == "python" for item in keywords))
        self.assertTrue(any("Minneapolis MN" in query for query in queries))

        profile = infer_candidate_profile(resume, keywords, queries)
        self.assertEqual(profile.archetype, "data_analytics")
        self.assertEqual(profile.years_experience, 5)
        self.assertIn("python", profile.top_technologies)
        self.assertFalse(profile.early_career)

    def test_score_jobs_prefers_overlap(self):
        jobs = [
            {
                "external_id": "one",
                "title": "Data Analyst",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-06",
                "source": "Company Careers",
                "source_type": "sample seed",
                "job_url": "https://example.com/one",
                "description": "Python SQL Tableau dashboards",
                "description_snippet": "Python SQL Tableau dashboards",
                "seeded_at": "2026-04-06T08:00:00Z",
            },
            {
                "external_id": "two",
                "title": "Project Manager",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-06",
                "source": "Company Careers",
                "source_type": "sample seed",
                "job_url": "https://example.com/two",
                "description": "Stakeholder management",
                "description_snippet": "Stakeholder management",
                "seeded_at": "2026-04-06T08:00:00Z",
            },
        ]

        keywords, _queries = extract_keywords(
            """
            Data Analyst
            Skills
            Python
            SQL
            Tableau
            """
        )

        profile = infer_candidate_profile(
            """
            Data Analyst
            Skills
            Python
            SQL
            Tableau
            """,
            keywords,
            [],
        )

        matches = score_jobs(jobs, keywords, profile=profile)

        self.assertEqual(matches[0].external_id, "one")
        self.assertEqual(matches[0].fit_label, "Strong fit")
        self.assertIn("skill_fit", matches[0].score_breakdown)
        self.assertTrue(matches[0].strengths)

    def test_early_career_profile_prefers_entry_level_roles(self):
        jobs = [
            {
                "external_id": "entry-role",
                "title": "IT Support Specialist",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-08",
                "source": "Company Careers",
                "source_type": "sample seed",
                "job_url": "https://example.com/entry-role",
                "description": "Entry-level technical support, PC setup, troubleshooting, and help desk work.",
                "description_snippet": "Entry-level technical support, PC setup, troubleshooting, and help desk work.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
            {
                "external_id": "senior-role",
                "title": "Operations Manager",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-08",
                "source": "Company Careers",
                "source_type": "sample seed",
                "job_url": "https://example.com/senior-role",
                "description": "Lead teams, manage budgets, drive executive reporting, and own operational strategy.",
                "description_snippet": "Lead teams, manage budgets, drive executive reporting, and own operational strategy.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
        ]

        resume = """
        SUMMARY
        Recent graduate with internship and PC technician experience.

        SKILLS
        Python, SQL, Excel, troubleshooting, help desk

        EXPERIENCE
        PC Technician
        Supported device setup and user troubleshooting.
        """

        keywords, queries = extract_keywords(resume)
        profile = infer_candidate_profile(resume, keywords, queries)
        matches = score_jobs(jobs, keywords, profile=profile)

        self.assertTrue(profile.early_career)
        self.assertEqual(profile.preferred_seniority, "entry_level")
        self.assertEqual([match.external_id for match in matches], ["entry-role"])

    def test_early_career_filters_out_stale_and_overqualified_roles(self):
        jobs = [
            {
                "external_id": "good-role",
                "title": "Technical Support Analyst",
                "company": "Example Co",
                "location": "Remote - Midwest",
                "posted_at": "2026-04-08",
                "source": "LinkedIn",
                "source_type": "sample seed",
                "job_url": "https://example.com/good-role",
                "description": "Entry-level technical support, troubleshooting, Jira, documentation, and SQL. Open to 0-2 years of experience.",
                "description_snippet": "Entry-level technical support.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
            {
                "external_id": "too-senior",
                "title": "Business Analyst",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-08",
                "source": "Company Careers",
                "source_type": "sample seed",
                "job_url": "https://example.com/too-senior",
                "description": "Requires 4+ years of experience with executive reporting and stakeholder management.",
                "description_snippet": "Requires 4+ years of experience.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
            {
                "external_id": "too-old",
                "title": "IT Support Specialist",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-03-15",
                "source": "Indeed",
                "source_type": "sample seed",
                "job_url": "https://example.com/too-old",
                "description": "Help desk and troubleshooting role open to 0-2 years of experience.",
                "description_snippet": "Help desk role.",
                "seeded_at": "2026-03-15T08:00:00Z",
            },
        ]

        resume = """
        SUMMARY
        Recent graduate with PC technician and help desk experience.

        SKILLS
        troubleshooting, help desk, jira, sql, documentation
        """

        keywords, queries = extract_keywords(resume)
        profile = infer_candidate_profile(resume, keywords, queries)
        matches = score_jobs(jobs, keywords, profile=profile)

        self.assertEqual([match.external_id for match in matches], ["good-role"])
        self.assertIn("linkedin.com/jobs/search", matches[0].job_url)

    def test_skill_fit_varies_with_overlap(self):
        jobs = [
            {
                "external_id": "strong-overlap",
                "title": "IT Support Specialist",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-08",
                "source": "LinkedIn",
                "source_type": "sample seed",
                "job_url": "https://example.com/strong-overlap",
                "description": "Troubleshooting, help desk, desktop support, jira, documentation, and SQL.",
                "description_snippet": "Support role.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
            {
                "external_id": "weak-overlap",
                "title": "Operations Coordinator",
                "company": "Example Co",
                "location": "Minneapolis, MN",
                "posted_at": "2026-04-08",
                "source": "Indeed",
                "source_type": "sample seed",
                "job_url": "https://example.com/weak-overlap",
                "description": "Scheduling, meetings, vendor communication, and budget support.",
                "description_snippet": "Coordinator role.",
                "seeded_at": "2026-04-08T08:00:00Z",
            },
        ]

        resume = """
        SUMMARY
        Recent graduate with PC technician and help desk experience.

        SKILLS
        troubleshooting, help desk, jira, sql, documentation
        """

        keywords, queries = extract_keywords(resume)
        profile = infer_candidate_profile(resume, keywords, queries)
        matches = score_jobs(jobs, keywords, profile=profile)

        self.assertGreater(
            matches[0].score_breakdown["skill_fit"],
            matches[1].score_breakdown["skill_fit"],
        )


if __name__ == "__main__":
    unittest.main()
