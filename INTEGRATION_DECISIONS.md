# Integration Decisions

This project already has the local MVP for:

- resume parsing
- ATS keyword extraction
- seeded job matching
- dashboard review
- applied-state tracking

The remaining work depends on a few external integration choices. This document shows the exact decisions to make, what credentials are needed, and where each integration should plug into the current app.

## 1. Job Source Integration

### Decision to make

Choose how live jobs will be fetched.

### Recommended default

Use company career pages and stable ATS platforms first:

- Greenhouse
- Lever
- Workday company pages
- employer RSS or careers pages

This is the safest and most maintainable route for a real product.

### Higher-risk option

If you want LinkedIn, Indeed, or Glassdoor, decide whether you have:

- an approved API or feed
- a compliant third-party data source
- permission to scrape

Without one of those, those sources should not be treated as reliable implementation targets.

### What you need to provide

- target sources
- API keys if applicable
- allowed domains or companies
- freshness rule, for example last 24 hours or last 72 hours

### Where it plugs in

- [app/matching.py](/Users/talhaahmad/Documents/New%20project/app/matching.py)
- [app/routes.py](/Users/talhaahmad/Documents/New%20project/app/routes.py)
- [app/repository.py](/Users/talhaahmad/Documents/New%20project/app/repository.py)

The seeded JSON file at [app/data/sample_jobs.json](/Users/talhaahmad/Documents/New%20project/app/data/sample_jobs.json) is the placeholder that will be replaced by a real fetch step.

### Interface we should preserve

Each fetched job should normalize to:

- `external_id`
- `title`
- `company`
- `location`
- `posted_at`
- `source`
- `source_type`
- `job_url`
- `description`
- `description_snippet`
- `seeded_at`

## 2. Scheduler

### Decision to make

Choose where the daily run happens.

### Options

- Local cron on this machine
- Codex automation
- Hosted cron on a server or platform

### Recommended default

If this is a personal single-user workflow, use Codex automation or local cron.

If this needs to run reliably when your laptop is closed, use hosted scheduling.

### What you need to provide

- run time
- timezone
- delivery method
- whether only new jobs should be shown

### Current trigger target

The scheduled job should run the same flow the resume upload currently kicks off:

1. load saved ATS profile
2. fetch new jobs
3. normalize and score them
4. store them in `jobs`
5. notify through dashboard or email

### Where it plugs in

- [app/routes.py](/Users/talhaahmad/Documents/New%20project/app/routes.py)
- [app/repository.py](/Users/talhaahmad/Documents/New%20project/app/repository.py)

This should move into a dedicated service module later, but these are the current seams.

## 3. Google Sheets Sync

### Decision to make

Choose the auth model.

### Options

- Google service account
- Google OAuth user consent

### Recommended default

Use a service account if:

- one user owns the sheet
- this is a personal workflow
- you are okay sharing the sheet with the service account email

Use OAuth if:

- each user should connect their own sheet
- this will become a multi-user app

### What you need to provide

- sheet ID
- tab name
- auth method
- credentials JSON or OAuth client credentials

### Suggested columns

- `job_id`
- `position`
- `company`
- `location`
- `date_found`
- `date_applied`
- `source`
- `job_url`
- `status`
- `notes`

### Where it plugs in

The event hook belongs on the apply action:

- [app/routes.py](/Users/talhaahmad/Documents/New%20project/app/routes.py)
- [app/repository.py](/Users/talhaahmad/Documents/New%20project/app/repository.py)

Specifically, after `mark_job_applied(job_id)` succeeds, we can call a Sheets sync function.

## 4. Gmail Monitoring

### Decision to make

Choose whether Gmail is:

- single-user personal mailbox integration
- per-user OAuth integration

### Recommended default

Use Gmail API with OAuth for a single user first.

### What you need to provide

- Google OAuth client credentials
- the Gmail account to connect
- polling interval
- status rules, for example:
  - interview
  - rejection
  - assessment
  - follow-up

### Matching strategy

We should match incoming emails against tracked jobs using:

- company name
- role title
- sender domain
- thread subject

### Where it plugs in

This should update the `applications` state and later the Google Sheet row for the same job.

Relevant current files:

- [app/repository.py](/Users/talhaahmad/Documents/New%20project/app/repository.py)
- [app/db.py](/Users/talhaahmad/Documents/New%20project/app/db.py)

## 5. Delivery Channel

### Decision to make

Choose how the daily digest should be delivered.

### Options

- dashboard only
- email summary
- both

### Recommended default

Start with dashboard only, then add email once the search quality is stable.

### What you need to provide

- preferred channel
- if email is enabled, recipient address

## 6. Storage Decision

### Decision to make

Choose whether this stays local-first or becomes a hosted app.

### Current default

SQLite is fine for the current single-user local MVP.

### Upgrade path

Move to PostgreSQL or Supabase if you want:

- multiple devices
- hosted scheduling
- multi-user auth
- durable shared state

### Where it plugs in

- [app/db.py](/Users/talhaahmad/Documents/New%20project/app/db.py)
- [app/repository.py](/Users/talhaahmad/Documents/New%20project/app/repository.py)

## Recommended Choices If You Want To Move Fast

If the goal is to connect everything with the fewest decisions, use:

- company-career and ATS-hosted job sources first
- local or Codex scheduled daily run
- dashboard delivery first
- Google Sheets service account
- Gmail OAuth for one mailbox
- SQLite until the workflow is stable

## What I Need From You To Wire The Next Round

If you want me to connect the next integration, send:

- the job source choice
- the scheduler choice and run time
- the Google Sheets auth method and sheet ID
- the Gmail auth method

Once you have those, the next implementation pass can wire real connectors instead of placeholders.
