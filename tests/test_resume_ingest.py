import unittest

from app.resume_ingest import extract_resume_text


class ResumeIngestTests(unittest.TestCase):
    def test_prefers_pasted_resume_text(self):
        text, filename = extract_resume_text(
            resume_text="Data Analyst with SQL and Python",
            resume_bytes=None,
            filename="resume.pdf",
            content_type="application/pdf",
        )

        self.assertEqual(text, "Data Analyst with SQL and Python")
        self.assertEqual(filename, "resume.pdf")

    def test_decodes_plain_text_uploads(self):
        text, filename = extract_resume_text(
            resume_text="",
            resume_bytes=b"Software Engineer\nPython\nAWS",
            filename="resume.txt",
            content_type="text/plain",
        )

        self.assertEqual(text, "Software Engineer\nPython\nAWS")
        self.assertEqual(filename, "resume.txt")


if __name__ == "__main__":
    unittest.main()
