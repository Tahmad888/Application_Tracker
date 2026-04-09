# Job Search Assistant MVP

This repository now contains the first implementation slice for the job automation project:

- resume upload or paste
- ATS-style keyword extraction
- keyword-driven job matching against seeded Minneapolis listings
- dashboard review flow
- mark-as-applied tracking in SQLite

## Stack

- Python 3.13
- Flask
- SQLite
- Jinja2

## Run Locally

The project now has two layers:

- Python service in the repo root
- Next.js frontend in [`web/`](/Users/talhaahmad/Documents/New%20project/web)

1. Create a virtual environment if you want isolation.
2. Install dependencies:

```bash
pip3 install -r requirements.txt
```

3. Start the Python service:

```bash
python3 -c "from app import create_app; app = create_app(); app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)"
```

4. Start the Next.js frontend:

```bash
cd web
npm run dev
```

5. Open `http://127.0.0.1:3000`

## Current Scope

The frontend has moved to Next.js, while the backend logic is still Python.

- Live now:
  - local resume parsing
  - ATS keyword scoring
  - generated search queries
  - sample seeded job matching
  - applied-job tracking
  - Google Sheets sync
  - Next.js dashboard
- Planned next:
  - real job source connectors
  - daily scheduler
  - Gmail monitoring

## Google Sheets Setup

The app is now wired to sync applied jobs to Google Sheets when configuration is present.

Default local values currently point at:

- service account file:
  `/Users/talhaahmad/Downloads/jobfinder-492510-b574bbd775c5.json`
- spreadsheet ID:
  `1ur047SwAGSqcsDMOdvnDm53zPdjxm36WnV54IRScQXI`
- spreadsheet tab:
  resolved automatically from `gid=0` unless you set `GOOGLE_SHEETS_TAB_NAME`

Before syncing will work, share the spreadsheet with this service account email:

- `jobfinder@jobfinder-492510.iam.gserviceaccount.com`

If you want to override the defaults, set:

```bash
export GOOGLE_SERVICE_ACCOUNT_FILE="/path/to/service-account.json"
export GOOGLE_SHEETS_SPREADSHEET_ID="your-spreadsheet-id"
export GOOGLE_SHEETS_TAB_NAME="Applications"
export GOOGLE_SHEETS_TAB_GID="0"
```

## Gmail OAuth Setup

The app now supports Gmail OAuth from the dashboard.

Local OAuth settings are loaded from `instance/local_settings.py` when present. The expected redirect URI is:

- `http://127.0.0.1:5000/oauth/google/callback`

After the app is running:

1. Open `http://127.0.0.1:5000`
2. Click `Connect Gmail`
3. Sign in with the Gmail account you added as a Google OAuth test user
4. Return to the dashboard and use `Check Gmail Now`

The current setup expects the Gmail API to be enabled in the same Google Cloud project as your OAuth client.

## Notes

- The seeded job listings are development fixtures, not live listings.
- The parser works best with plain text resumes.
- The Next.js app expects the Python service at `http://127.0.0.1:5000` by default.
