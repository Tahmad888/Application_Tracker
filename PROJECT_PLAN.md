# Job Search Automation Project Plan

## Goal

Build a job search assistant that:

1. Parses a user's resume and extracts ATS-relevant keywords
2. Finds recent matching jobs in Minneapolis, MN
3. Delivers a daily digest of new jobs
4. Lets the user review and mark jobs as applied in a dashboard
5. Syncs applied jobs to Google Sheets
6. Monitors Gmail for status updates and reflects them in the tracker

## Recommended Build Order

### Phase 1: Core Search Pipeline

#### Task 1: Resume Parser Agent
- Input: resume file or pasted resume text
- Output: normalized ATS profile
- Extract:
  - skills
  - job titles
  - industries
  - tools and technologies
  - certifications
  - years of experience phrases
  - domain-specific keywords
- Store results in a structured format such as:
  - `candidate_profile`
  - `keyword_scores`
  - `search_queries`

#### Task 2: Job Finder Agent
- Input: ATS profile from Task 1
- Output: normalized job listings
- Requirements:
  - Minneapolis, MN focused
  - recency filter, preferably 24 to 72 hours
  - authentic sources only
  - deduplication across sources
- Fields to normalize:
  - id
  - title
  - company
  - location
  - posted_at
  - source
  - job_url
  - description_snippet
  - matched_keywords
  - match_score

### Phase 2: Delivery and Review

#### Task 3: Daily Job Digest
- Trigger the job finder on a schedule
- Save only newly discovered jobs
- Deliver results through:
  - dashboard inbox
  - optional email summary
- Include:
  - top matches
  - why each job matched
  - posting freshness

#### Task 4: Interactive Dashboard
- Views:
  - today's new jobs
  - all saved jobs
  - applied jobs
  - job detail panel
- Actions:
  - mark as applied
  - dismiss
  - open original posting
  - filter by source, keyword, date, score

### Phase 3: External Sync and Status Updates

#### Task 5: Google Sheets Sync
- Trigger when user marks a job as applied
- Append or update a row in a connected Google Sheet
- Suggested columns:
  - job_id
  - position
  - company
  - location
  - date_found
  - date_applied
  - source
  - job_url
  - status
  - notes

#### Task 6: Gmail Monitor Agent
- Poll Gmail periodically
- Detect job-related messages such as:
  - interview requests
  - rejections
  - assessments
  - recruiter follow-ups
- Match emails to an existing tracked application
- Update Google Sheet and internal job state

## Suggested System Design

### Services
- `resume-parser-service`
- `job-search-service`
- `scheduler-service`
- `dashboard-web-app`
- `sheets-sync-service`
- `gmail-monitor-service`

### Shared Data Model
- `users`
- `candidate_profiles`
- `jobs`
- `job_matches`
- `applications`
- `email_events`
- `sync_logs`

### Practical Architecture
- Frontend:
  - Next.js or React dashboard
- Backend:
  - Node.js with API routes or Express
- Database:
  - PostgreSQL or Supabase
- Scheduler:
  - cron job, background worker, or platform scheduler
- Integrations:
  - Google Sheets API
  - Gmail API

## MVP Recommendation

Build this in three milestones instead of all six tasks at once.

### MVP 1
- Resume upload and ATS keyword extraction
- Job search using saved keywords
- Dashboard list of jobs

### MVP 2
- Daily scheduled digest
- Mark as applied
- Google Sheets sync

### MVP 3
- Gmail monitoring
- Automatic status updates
- Improved deduping and matching logic

## Key Risks

### Job Source Access
- LinkedIn, Indeed, and Glassdoor can limit scraping or block automated access
- Best approach is to use official APIs where possible, approved feeds, or company career pages

### Gmail Matching Accuracy
- Matching an email to the right application can be fuzzy
- Use company name, role title, sender, and thread subject heuristics

### ATS Scoring Quality
- Resume parsing should not only extract keywords, but also rank them
- Add weighting by recency, repetition, section importance, and title relevance

### Deduplication
- The same job may appear on multiple sources
- Use URL normalization, title and company similarity, and posting date heuristics

## Recommended First Implementation Slice

If building immediately, start with:

1. Resume upload endpoint
2. Resume parsing and keyword extraction
3. Job search pipeline for one or two sources
4. Jobs table in a database
5. Basic dashboard showing matched jobs

This creates the foundation the scheduler, Sheets sync, and Gmail monitor will depend on.

## Acceptance Criteria By Task

### Task 1
- User uploads a resume
- System extracts structured ATS keywords
- User can review or edit extracted keywords

### Task 2
- System returns recent Minneapolis jobs
- Jobs are deduplicated and ranked by fit

### Task 3
- System runs daily without manual action
- User sees only newly found matching jobs

### Task 4
- User can review jobs and mark them as applied

### Task 5
- Marking a job as applied writes or updates the corresponding row in Google Sheets

### Task 6
- Relevant Gmail messages update the application status automatically or with review confirmation
