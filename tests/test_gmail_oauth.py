import unittest

from app import create_app
from app.gmail_oauth import get_google_client_config


class GmailOAuthTests(unittest.TestCase):
    def test_google_client_config_uses_app_settings(self):
        app = create_app(
            {
                "TESTING": True,
                "DATABASE": "/tmp/job_assistant_gmail_test.db",
                "GOOGLE_OAUTH_CLIENT_ID": "client-id",
                "GOOGLE_OAUTH_CLIENT_SECRET": "client-secret",
                "GOOGLE_OAUTH_REDIRECT_URI": "http://127.0.0.1:5000/oauth/google/callback",
            }
        )

        with app.app_context():
            config = get_google_client_config()

        self.assertEqual(config["web"]["client_id"], "client-id")
        self.assertEqual(config["web"]["client_secret"], "client-secret")
        self.assertEqual(
            config["web"]["redirect_uris"],
            ["http://127.0.0.1:5000/oauth/google/callback"],
        )


if __name__ == "__main__":
    unittest.main()
