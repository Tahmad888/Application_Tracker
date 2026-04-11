# Application Tracker

Application Tracker is a tracker-first job search workspace built to help users log jobs they already applied to, keep those applications organized, and generate more relevant resume tailoring from the actual posting.

The current product center is the **Job Tracker**:
- paste a job posting URL
- preview the parsed job details before saving
- correct low-confidence titles or companies manually
- store the application in SQLite
- sync the tracked job to Google Sheets
- optionally upload or paste a resume to generate tailored resume guidance

The project also still includes a **legacy job search workspace** behind the dashboard for resume parsing, ATS-style keyword extraction, seeded job matching, and Gmail monitoring.

## What It Does

### Main flow: Job Tracker
- accepts direct job links from company sites and job boards
- parses title, company, location, description snippet, source, and posting date
- uses a confidence gate so suspicious parses must be reviewed before they are saved
- saves confirmed applications locally
- syncs confirmed application rows to Google Sheets
- produces tailored resume feedback based on the job demand versus resume evidence

### Secondary flow: Job Search Workspace
- upload or paste a resume
- extract ATS-style keywords
- infer a candidate profile
- score seeded sample jobs
- connect Gmail and inspect recent job-related mail

## Stack

- Next.js 16 frontend in `web/`
- Python 3.13 backend in the repo root
- Flask API layer
- SQLite for local persistence
- Google Sheets API for application tracking sync
- Gmail OAuth for mailbox connection

## Run Locally

1. Install Python dependencies:

```bash
pip3 install -r requirements.txt
```

2. Start the Python backend:

```bash
python3 -c "from app import create_app; app = create_app(); app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)"
```

3. Start the Next.js frontend:

```bash
cd web
npm install
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Current Product State

### Working now
- tracker-first dashboard UI
- job link parsing with manual review for low-confidence results
- application storage in SQLite
- Google Sheets sync for confirmed tracked jobs
- tailored resume output:
  - target summary
  - prioritized skills
  - matched strengths
  - missing requirements
  - experience suggestions
  - project suggestions
- Gmail OAuth connection
- legacy ATS parser and seeded job-search workflow

### Still improving
- job-posting parsing robustness across every provider
- better live job ingestion instead of seeded sample jobs
- stronger Gmail-to-application status matching
- scheduler and digest automation

## Google Sheets Setup

The tracker can write confirmed applications to Google Sheets.

Expected environment variables:

```bash
export GOOGLE_SERVICE_ACCOUNT_FILE="/path/to/service-account.json"
export GOOGLE_SHEETS_SPREADSHEET_ID="your-spreadsheet-id"
export GOOGLE_SHEETS_TAB_NAME="Applications"
export GOOGLE_SHEETS_TAB_GID="0"
```

You must also share the destination sheet with the Google service account email from your JSON credentials.

## Gmail OAuth Setup

The app supports Gmail OAuth through the backend.

Expected redirect URI:

```text
http://127.0.0.1:5000/oauth/google/callback
```

Typical local setup:
- place OAuth values in `instance/local_settings.py` or environment variables
- enable the Gmail API in Google Cloud
- add your Gmail account as an OAuth test user if the app is still in testing mode

## Notes

- The tracker is the primary product workflow now.
- The older job finder is still available, but it is secondary to the tracker.
- Seeded job matching is development-stage behavior and should not be treated as a live search system yet.
