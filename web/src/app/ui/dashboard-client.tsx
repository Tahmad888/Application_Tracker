"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";

type Keyword = {
  category: string;
  keyword: string;
  score: number;
};

type CandidateProfile = {
  archetype: string;
  archetype_label: string;
  primary_titles: string[];
  top_technologies: string[];
  certifications: string[];
  years_experience: number | null;
  preferred_seniority: string;
  early_career: boolean;
  summary: string;
};

type GmailConnection = {
  email: string;
};

type EmailMessage = {
  id: string;
  from: string;
  subject: string;
  date: string;
  snippet: string;
};

type TrackerStats = {
  applied_ytd: number;
  applied_today: number;
};

type TailoredResume = {
  profile_summary: string;
  target_summary: string;
  prioritized_skills: string[];
  alignment_notes: string[];
  tailored_text: string;
};

type Job = {
  id: number;
  title: string;
  company: string;
  location: string;
  job_url: string;
  posted_at: string;
  source: string;
  source_type: string;
  match_score: number;
  archetype_label: string;
  fit_label: string;
  evaluation_summary: string;
  score_breakdown: Record<string, number>;
  strengths: string[];
  concerns: string[];
  applied: number;
  matched_keywords: string[];
  description_snippet?: string;
  application?: {
    applied_at?: string;
    status?: string;
    notes?: string;
  } | null;
};

type DashboardData = {
  resume: { filename: string } | null;
  profile: CandidateProfile | null;
  keywords: Keyword[];
  queries: string[];
  jobs: Job[];
  tracker_stats: TrackerStats;
  gmail_connection: GmailConnection | null;
};

type DashboardClientProps = {
  authLevel: string | null;
  authMessage: string | null;
};

type ViewMode = "home" | "job-search" | "job-tracker";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const SCORE_LABELS: Record<string, string> = {
  title_fit: "Title",
  skill_fit: "Skills",
  archetype_fit: "Lane",
  seniority_fit: "Seniority",
  location_fit: "Location",
  freshness_fit: "Freshness",
};

export default function DashboardClient({
  authLevel,
  authMessage,
}: DashboardClientProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const trackerFileInputRef = useRef<HTMLInputElement | null>(null);
  const [mode, setMode] = useState<ViewMode>("home");
  const [data, setData] = useState<DashboardData | null>(null);
  const [resumeText, setResumeText] = useState("");
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [jobUrl, setJobUrl] = useState("");
  const [trackerResumeText, setTrackerResumeText] = useState("");
  const [trackerResumeFile, setTrackerResumeFile] = useState<File | null>(null);
  const [trackerNotes, setTrackerNotes] = useState("");
  const [tailoredResume, setTailoredResume] = useState<TailoredResume | null>(null);
  const [message, setMessage] = useState<string | null>(
    authLevel === "error" ? null : authMessage,
  );
  const [error, setError] = useState<string | null>(
    authLevel === "error" ? authMessage : null,
  );
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [isPending, startTransition] = useTransition();

  const loadDashboard = async () => {
    const response = await fetch(`${API_BASE}/api/dashboard`, { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load dashboard data from the Python service.");
      return;
    }
    const payload = (await response.json()) as DashboardData;
    setData(payload);
  };

  useEffect(() => {
    startTransition(() => {
      void loadDashboard();
    });
  }, []);

  async function handleResumeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    const body = new FormData();
    body.append("resume_text", resumeText);
    if (resumeFile) body.append("resume_file", resumeFile);

    const response = await fetch(`${API_BASE}/api/resume`, { method: "POST", body });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: DashboardData;
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Resume parsing failed.");
      return;
    }

    setMessage(payload.message);
    setData(payload.data);
    setResumeText("");
    setResumeFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleApply(jobId: number) {
    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/jobs/${jobId}/apply`, { method: "POST" });
    const payload = (await response.json()) as { ok: boolean; message: string };

    if (!response.ok || !payload.ok) {
      setError(payload.message || "Could not mark the job as applied.");
      return;
    }

    setMessage(payload.message);
    await loadDashboard();
  }

  async function handleCheckGmail() {
    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/gmail/check`, { method: "POST" });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: EmailMessage[];
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Gmail check failed.");
      return;
    }

    setMessage(payload.message);
    setEmails(payload.data);
    await loadDashboard();
  }

  async function handleTrackerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setTailoredResume(null);

    const body = new FormData();
    body.append("job_url", jobUrl);
    body.append("resume_text", trackerResumeText);
    body.append("notes", trackerNotes);
    if (trackerResumeFile) body.append("resume_file", trackerResumeFile);

    const response = await fetch(`${API_BASE}/api/tracker/intake`, { method: "POST", body });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: {
        dashboard: DashboardData;
        tailored_resume?: TailoredResume | null;
      };
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not track that job link.");
      return;
    }

    setMessage(payload.message);
    setData(payload.data.dashboard);
    setTailoredResume(payload.data.tailored_resume ?? null);
    setJobUrl("");
    setTrackerResumeText("");
    setTrackerResumeFile(null);
    setTrackerNotes("");
    if (trackerFileInputRef.current) trackerFileInputRef.current.value = "";
  }

  const appliedJobs = data?.jobs.filter((job) => job.applied) ?? [];

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --ink: #0d0d0f;
      --ink-2: #1a1a1f;
      --ink-3: #252530;
      --border: rgba(255,255,255,0.07);
      --border-light: rgba(255,255,255,0.12);
      --gold: #c8a96e;
      --gold-dim: rgba(200,169,110,0.15);
      --gold-glow: rgba(200,169,110,0.08);
      --text-primary: #f0ede8;
      --text-secondary: #9090a0;
      --text-muted: #5a5a6e;
      --success: #4ecca3;
      --success-dim: rgba(78,204,163,0.12);
      --danger: #e07070;
      --danger-dim: rgba(224,112,112,0.12);
      --radius: 16px;
      --radius-sm: 10px;
      --radius-full: 999px;
    }

    body {
      background: var(--ink);
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
      font-weight: 300;
      min-height: 100vh;
    }

    .dashboard {
      min-height: 100vh;
      background:
        radial-gradient(ellipse 60% 40% at 80% 10%, rgba(200,169,110,0.04) 0%, transparent 60%),
        radial-gradient(ellipse 50% 60% at 10% 80%, rgba(78,204,163,0.03) 0%, transparent 60%),
        var(--ink);
      padding: 0;
    }

    /* ── Sidebar Nav ── */
    .layout {
      display: flex;
      min-height: 100vh;
    }

    .sidebar {
      width: 72px;
      background: var(--ink-2);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 28px 0;
      gap: 8px;
      position: fixed;
      top: 0;
      left: 0;
      height: 100vh;
      z-index: 100;
    }

    .sidebar-logo {
      width: 36px;
      height: 36px;
      background: var(--gold);
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      color: var(--ink);
      font-weight: 600;
    }

    .nav-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      border: 1px solid transparent;
      background: transparent;
      color: var(--text-muted);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: all 0.2s ease;
      font-size: 18px;
      position: relative;
    }

    .nav-btn:hover {
      background: var(--ink-3);
      color: var(--text-primary);
      border-color: var(--border-light);
    }

    .nav-btn.active {
      background: var(--gold-dim);
      color: var(--gold);
      border-color: rgba(200,169,110,0.3);
    }

    .nav-tooltip {
      position: absolute;
      left: calc(100% + 12px);
      background: var(--ink-3);
      border: 1px solid var(--border-light);
      color: var(--text-primary);
      font-size: 12px;
      font-weight: 400;
      white-space: nowrap;
      padding: 6px 10px;
      border-radius: 8px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 0.15s ease;
      font-family: 'DM Sans', sans-serif;
    }

    .nav-btn:hover .nav-tooltip {
      opacity: 1;
    }

    /* ── Main Content ── */
    .main {
      margin-left: 72px;
      flex: 1;
      padding: 40px 48px;
      max-width: 1360px;
    }

    /* ── Header ── */
    .header {
      margin-bottom: 48px;
    }

    .header-eyebrow {
      font-family: 'DM Mono', monospace;
      font-size: 11px;
      letter-spacing: 0.2em;
      color: var(--gold);
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .header-title {
      font-family: 'Playfair Display', serif;
      font-size: clamp(36px, 4vw, 52px);
      font-weight: 400;
      line-height: 1.15;
      color: var(--text-primary);
      max-width: 680px;
    }

    .header-title em {
      font-style: italic;
      color: var(--gold);
    }

    .header-sub {
      margin-top: 16px;
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.7;
      max-width: 560px;
      font-weight: 300;
    }

    /* ── Toast ── */
    .toast {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 14px 18px;
      border-radius: var(--radius-sm);
      font-size: 13.5px;
      margin-bottom: 32px;
      border: 1px solid;
    }

    .toast.success {
      background: var(--success-dim);
      border-color: rgba(78,204,163,0.25);
      color: var(--success);
    }

    .toast.error {
      background: var(--danger-dim);
      border-color: rgba(224,112,112,0.25);
      color: var(--danger);
    }

    /* ── Stat Cards ── */
    .stats-row {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
      gap: 16px;
      margin-bottom: 40px;
    }

    .stat-card {
      background: var(--ink-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 24px;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s ease;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 2px;
      background: linear-gradient(90deg, var(--gold), transparent);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .stat-card:hover { border-color: var(--border-light); }
    .stat-card:hover::before { opacity: 1; }

    .stat-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .stat-value {
      font-family: 'Playfair Display', serif;
      font-size: 48px;
      font-weight: 400;
      color: var(--text-primary);
      line-height: 1;
    }

    .stat-desc {
      margin-top: 8px;
      font-size: 12px;
      color: var(--text-muted);
    }

    /* ── Action Cards (Home) ── */
    .action-grid {
      display: grid;
      grid-template-columns: 1.4fr 1fr;
      gap: 20px;
      margin-bottom: 40px;
    }

    @media (max-width: 900px) {
      .action-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--ink-2);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 28px;
      transition: border-color 0.2s ease;
    }

    .card:hover { border-color: var(--border-light); }

    .card-eyebrow {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .card-title {
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      font-weight: 400;
      color: var(--text-primary);
      margin-bottom: 12px;
      line-height: 1.3;
    }

    .card-body {
      font-size: 13.5px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin-bottom: 24px;
    }

    /* ── Buttons ── */
    .btn-primary {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 24px;
      background: var(--gold);
      color: var(--ink);
      border: none;
      border-radius: var(--radius-full);
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-primary:hover {
      background: #d4b87a;
      transform: translateY(-1px);
      box-shadow: 0 8px 24px rgba(200,169,110,0.25);
    }

    .btn-primary:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-ghost {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 11px 20px;
      background: transparent;
      color: var(--text-secondary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-full);
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-ghost:hover {
      background: var(--ink-3);
      color: var(--text-primary);
      border-color: rgba(255,255,255,0.2);
    }

    .btn-dark {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: var(--ink-3);
      color: var(--text-primary);
      border: 1px solid var(--border-light);
      border-radius: var(--radius-full);
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-dark:hover {
      background: #2e2e3a;
      border-color: rgba(255,255,255,0.2);
    }

    .btn-row {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      align-items: center;
    }

    /* ── Section headers ── */
    .section-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      gap: 16px;
    }

    .section-title {
      font-family: 'Playfair Display', serif;
      font-size: 22px;
      font-weight: 400;
      color: var(--text-primary);
    }

    /* ── Forms ── */
    .form-grid {
      display: grid;
      gap: 20px;
    }

    .field {
      display: grid;
      gap: 8px;
    }

    .field-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .field-input,
    .field-textarea,
    .field-file {
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 300;
      outline: none;
      transition: border-color 0.2s ease;
      width: 100%;
    }

    .field-input::placeholder,
    .field-textarea::placeholder {
      color: var(--text-muted);
    }

    .field-input:focus,
    .field-textarea:focus {
      border-color: rgba(200,169,110,0.4);
    }

    .field-textarea {
      min-height: 120px;
      resize: vertical;
      line-height: 1.6;
    }

    .field-textarea.tall {
      min-height: 180px;
    }

    .field-file {
      cursor: pointer;
      color: var(--text-muted);
    }

    /* ── 2-col tracker layout ── */
    .tracker-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 1100px) {
      .tracker-grid { grid-template-columns: 1fr; }
    }

    .col-span-2 {
      grid-column: 1 / -1;
    }

    /* ── Applied jobs list ── */
    .job-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 20px 24px;
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      transition: border-color 0.2s ease;
    }

    .job-row:hover { border-color: var(--border-light); }

    .job-list {
      display: grid;
      gap: 10px;
    }

    .job-title {
      font-family: 'Playfair Display', serif;
      font-size: 17px;
      font-weight: 400;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .job-meta {
      font-size: 13px;
      color: var(--text-secondary);
    }

    .job-source {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-top: 6px;
    }

    .job-notes {
      margin-top: 12px;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    /* ── Badge ── */
    .badge {
      display: inline-flex;
      align-items: center;
      padding: 4px 12px;
      border-radius: var(--radius-full);
      font-size: 11.5px;
      font-weight: 500;
    }

    .badge-gold {
      background: var(--gold-dim);
      color: var(--gold);
      border: 1px solid rgba(200,169,110,0.25);
    }

    .badge-success {
      background: var(--success-dim);
      color: var(--success);
      border: 1px solid rgba(78,204,163,0.25);
    }

    /* ── Tailored resume panel ── */
    .tailored-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 280px;
      text-align: center;
      gap: 12px;
    }

    .tailored-icon {
      font-size: 32px;
      opacity: 0.3;
    }

    .tailored-hint {
      font-size: 13.5px;
      color: var(--text-muted);
      line-height: 1.7;
      max-width: 300px;
    }

    .tailored-section {
      display: grid;
      gap: 16px;
    }

    .tailored-block {
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 18px;
    }

    .tailored-block-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--gold);
      margin-bottom: 10px;
    }

    .tailored-block p {
      font-size: 13.5px;
      color: var(--text-secondary);
      line-height: 1.7;
    }

    .skill-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .skill-tag {
      padding: 5px 12px;
      background: var(--gold-glow);
      border: 1px solid rgba(200,169,110,0.18);
      border-radius: var(--radius-full);
      font-size: 12px;
      color: var(--gold);
      font-family: 'DM Mono', monospace;
    }

    .alignment-list {
      display: grid;
      gap: 8px;
    }

    .alignment-item {
      padding: 10px 14px;
      background: var(--ink-2);
      border-left: 2px solid var(--gold);
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .code-block {
      background: #0a0a0d;
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 20px;
      font-family: 'DM Mono', monospace;
      font-size: 12.5px;
      color: #c8c8d8;
      line-height: 1.8;
      white-space: pre-wrap;
      overflow-x: auto;
    }

    /* ── Job Search section ── */
    .search-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
    }

    @media (max-width: 1000px) {
      .search-grid { grid-template-columns: 1fr; }
    }

    .score-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(130px, 1fr));
      gap: 8px;
      margin: 16px 0;
    }

    .score-item {
      background: var(--ink-2);
      border: 1px solid var(--border);
      border-radius: 8px;
      padding: 10px 12px;
    }

    .score-item-label {
      font-family: 'DM Mono', monospace;
      font-size: 9.5px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .score-item-val {
      color: var(--gold);
      font-size: 11px;
    }

    .keyword-cloud {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }

    .keyword-chip {
      display: flex;
      flex-direction: column;
      padding: 8px 12px;
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: 8px;
      transition: border-color 0.15s ease;
    }

    .keyword-chip:hover { border-color: rgba(200,169,110,0.3); }

    .keyword-chip strong {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .keyword-chip small {
      font-family: 'DM Mono', monospace;
      font-size: 9.5px;
      color: var(--text-muted);
      margin-top: 3px;
    }

    /* ── Divider ── */
    .divider {
      height: 1px;
      background: var(--border);
      margin: 32px 0;
    }

    /* ── Scrollable job list ── */
    .job-scroll {
      display: grid;
      gap: 12px;
      max-height: 640px;
      overflow-y: auto;
      padding-right: 4px;
    }

    .job-scroll::-webkit-scrollbar { width: 4px; }
    .job-scroll::-webkit-scrollbar-track { background: transparent; }
    .job-scroll::-webkit-scrollbar-thumb { background: var(--border-light); border-radius: 4px; }

    /* ── Evaluation ── */
    .eval-text {
      font-size: 13.5px;
      color: var(--text-secondary);
      line-height: 1.7;
      margin: 12px 0 16px;
    }

    /* ── Recent applied mini-cards ── */
    .recent-card {
      padding: 14px 18px;
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
      transition: border-color 0.15s ease;
    }

    .recent-card:hover { border-color: rgba(200,169,110,0.25); }

    .recent-card strong {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      display: block;
    }

    .recent-card p {
      font-size: 12.5px;
      color: var(--text-muted);
      margin-top: 3px;
    }

    /* ── Number line under stat ── */
    .stat-accent-line {
      width: 32px;
      height: 2px;
      background: var(--gold);
      margin-top: 12px;
    }

    /* ── Empty states ── */
    .empty-state {
      font-size: 13.5px;
      color: var(--text-muted);
      padding: 20px 0;
    }

    /* ── Page transition feel ── */
    .section-fade {
      animation: fadeUp 0.35s ease both;
    }

    @keyframes fadeUp {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    /* ── Profile block ── */
    .profile-block {
      padding: 16px 18px;
      background: var(--gold-glow);
      border: 1px solid rgba(200,169,110,0.2);
      border-radius: var(--radius-sm);
      margin-bottom: 16px;
    }

    .profile-lane {
      font-family: 'Playfair Display', serif;
      font-size: 18px;
      color: var(--text-primary);
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 8px;
    }

    .profile-summary {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    /* ── Gmail email cards ── */
    .email-card {
      padding: 16px 18px;
      background: var(--ink-3);
      border: 1px solid var(--border);
      border-radius: var(--radius-sm);
    }

    .email-card strong {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
      display: block;
    }

    .email-card .from {
      font-size: 12px;
      color: var(--gold);
      margin-top: 3px;
    }

    .email-card .date {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      color: var(--text-muted);
      margin-top: 2px;
    }

    .email-card .snippet {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 8px;
      line-height: 1.5;
    }

    /* ── Connection status ── */
    .connection-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: var(--success);
      display: inline-block;
      box-shadow: 0 0 6px var(--success);
      margin-right: 6px;
    }

    .connection-info {
      display: flex;
      align-items: center;
      font-size: 13.5px;
      color: var(--text-secondary);
      margin-bottom: 16px;
    }
  `;

  const iconHome = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 01-1 1H4a1 1 0 01-1-1V9.5z"/><path d="M9 21V12h6v9"/>
    </svg>
  );

  const iconTracker = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2"/><rect x="9" y="3" width="6" height="4" rx="1"/><path d="M9 12l2 2 4-4"/>
    </svg>
  );

  const iconSearch = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
    </svg>
  );

  const iconArrow = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M12 5l7 7-7 7"/>
    </svg>
  );

  const iconBack = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 12H5M12 19l-7-7 7-7"/>
    </svg>
  );

  const iconCheck = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 6L9 17l-5-5"/>
    </svg>
  );

  const iconMail = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><path d="M2 7l10 7 10-7"/>
    </svg>
  );

  const iconDoc = (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8"/>
    </svg>
  );

  return (
    <div className="dashboard">
      <style dangerouslySetInnerHTML={{ __html: styles }} />
      <div className="layout">
        {/* Sidebar */}
        <nav className="sidebar">
          <div className="sidebar-logo">J</div>
          <button
            className={`nav-btn ${mode === "home" ? "active" : ""}`}
            onClick={() => setMode("home")}
          >
            {iconHome}
            <span className="nav-tooltip">Home</span>
          </button>
          <button
            className={`nav-btn ${mode === "job-tracker" ? "active" : ""}`}
            onClick={() => setMode("job-tracker")}
          >
            {iconTracker}
            <span className="nav-tooltip">Job Tracker</span>
          </button>
          <button
            className={`nav-btn ${mode === "job-search" ? "active" : ""}`}
            onClick={() => setMode("job-search")}
          >
            {iconSearch}
            <span className="nav-tooltip">Job Search</span>
          </button>
        </nav>

        {/* Main */}
        <main className="main">
          {/* Toasts */}
          {message && (
            <div className="toast success">
              <span>✓</span>
              {message}
            </div>
          )}
          {error && (
            <div className="toast error">
              <span>!</span>
              {error}
            </div>
          )}

          {/* ── HOME ── */}
          {mode === "home" && (
            <div className="section-fade">
              <header className="header">
                <p className="header-eyebrow">Career Command Center</p>
                <h1 className="header-title">
                  Track the jobs you <em>actually</em> applied to.
                </h1>
                <p className="header-sub">
                  Log applications, sync to Google Sheets, and tailor your resume to each role — all from one place.
                </p>
              </header>

              <div className="stats-row">
                <div className="stat-card">
                  <p className="stat-label">Applied YTD</p>
                  <p className="stat-value">{data?.tracker_stats.applied_ytd ?? 0}</p>
                  <div className="stat-accent-line" />
                  <p className="stat-desc">total applications logged</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Today</p>
                  <p className="stat-value">{data?.tracker_stats.applied_today ?? 0}</p>
                  <div className="stat-accent-line" />
                  <p className="stat-desc">applications this session</p>
                </div>
                <div className="stat-card">
                  <p className="stat-label">Status</p>
                  <p className="stat-value" style={{ fontSize: 28, paddingTop: 10 }}>
                    {data ? "Live" : "—"}
                  </p>
                  <div className="stat-accent-line" />
                  <p className="stat-desc">backend connection</p>
                </div>
              </div>

              <div className="action-grid">
                <div className="card">
                  <p className="card-eyebrow">Primary Workflow</p>
                  <h2 className="card-title">Log a job you applied to</h2>
                  <p className="card-body">
                    Paste any job link after you apply. The tracker saves the posting details, pushes the entry to your Google Sheet, and can generate a tailored resume draft if you provide your resume.
                  </p>
                  <div className="btn-row">
                    <button className="btn-primary" onClick={() => setMode("job-tracker")}>
                      Open Job Tracker {iconArrow}
                    </button>
                  </div>
                </div>

                <div className="card">
                  <p className="card-eyebrow">Recently Applied</p>
                  <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
                    {appliedJobs.slice(0, 4).map((job) => (
                      <div className="recent-card" key={job.id}>
                        <strong>{job.title}</strong>
                        <p>{job.company} · {job.location}</p>
                      </div>
                    ))}
                    {!appliedJobs.length && (
                      <p className="empty-state">No tracked applications yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 24, padding: "20px 28px" }}>
                <div>
                  <p className="card-eyebrow">Legacy Workspace</p>
                  <p style={{ fontSize: 14, color: "var(--text-secondary)", marginTop: 4 }}>
                    ATS keyword parser, seeded job matcher, and Gmail monitor
                  </p>
                </div>
                <button className="btn-ghost" onClick={() => setMode("job-search")}>
                  Open Job Search {iconArrow}
                </button>
              </div>
            </div>
          )}

          {/* ── JOB TRACKER ── */}
          {mode === "job-tracker" && (
            <div className="section-fade">
              <div className="section-header">
                <div>
                  <p className="header-eyebrow">Job Tracker</p>
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 400, lineHeight: 1.2 }}>
                    Log an applied role
                  </h1>
                </div>
                <button className="btn-ghost" onClick={() => setMode("home")}>
                  {iconBack} Back
                </button>
              </div>

              <div className="tracker-grid">
                {/* Form */}
                <div className="card">
                  <p className="card-eyebrow">New Entry</p>
                  <form className="form-grid" onSubmit={handleTrackerSubmit} style={{ marginTop: 16 }}>
                    <div className="field">
                      <label className="field-label">Job link *</label>
                      <input
                        type="url"
                        className="field-input"
                        value={jobUrl}
                        onChange={(e) => setJobUrl(e.target.value)}
                        placeholder="https://company.com/careers/job-posting"
                        required
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">Resume text</label>
                      <textarea
                        className="field-textarea"
                        value={trackerResumeText}
                        onChange={(e) => setTrackerResumeText(e.target.value)}
                        placeholder="Paste your resume to generate a tailored version for this role."
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">Resume file</label>
                      <input
                        ref={trackerFileInputRef}
                        type="file"
                        accept=".pdf,.txt"
                        className="field-file"
                        onChange={(e) => setTrackerResumeFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">Notes</label>
                      <textarea
                        className="field-textarea"
                        value={trackerNotes}
                        onChange={(e) => setTrackerNotes(e.target.value)}
                        placeholder="Optional notes for the tracker or your sheet."
                      />
                    </div>
                    <div>
                      <button className="btn-primary" type="submit" disabled={isPending}>
                        {iconDoc} Save & Tailor Resume
                      </button>
                    </div>
                  </form>
                </div>

                {/* Tailored resume panel */}
                <div className="card">
                  <p className="card-eyebrow">Tailored Output</p>
                  {tailoredResume ? (
                    <div className="tailored-section" style={{ marginTop: 16 }}>
                      <div className="tailored-block">
                        <p className="tailored-block-label">Target Summary</p>
                        <p>{tailoredResume.target_summary}</p>
                      </div>
                      <div className="skill-tags">
                        {tailoredResume.prioritized_skills.map((skill) => (
                          <span className="skill-tag" key={skill}>{skill}</span>
                        ))}
                      </div>
                      <div>
                        <p className="field-label" style={{ marginBottom: 10 }}>Customization Notes</p>
                        <div className="alignment-list">
                          {tailoredResume.alignment_notes.map((note) => (
                            <div className="alignment-item" key={note}>{note}</div>
                          ))}
                        </div>
                      </div>
                      <div>
                        <p className="field-label" style={{ marginBottom: 10 }}>Tailored Resume Text</p>
                        <pre className="code-block">{tailoredResume.tailored_text}</pre>
                      </div>
                    </div>
                  ) : (
                    <div className="tailored-empty">
                      <span className="tailored-icon">✦</span>
                      <p className="tailored-hint">
                        Paste a job link and optionally upload your resume. A tailored draft will appear here.
                      </p>
                    </div>
                  )}
                </div>

                {/* Applied jobs table */}
                <div className="card col-span-2">
                  <p className="card-eyebrow" style={{ marginBottom: 16 }}>All Applied Jobs</p>
                  <div className="job-list">
                    {appliedJobs.map((job) => (
                      <div className="job-row" key={job.id}>
                        <div style={{ flex: 1 }}>
                          <p className="job-title">{job.title}</p>
                          <p className="job-meta">{job.company} · {job.location}</p>
                          <p className="job-source">{job.source} · {job.source_type}</p>
                          {job.application?.notes && (
                            <p className="job-notes">{job.application.notes}</p>
                          )}
                        </div>
                        <a
                          href={job.job_url}
                          target="_blank"
                          rel="noreferrer"
                          className="btn-dark"
                        >
                          Open {iconArrow}
                        </a>
                      </div>
                    ))}
                    {!appliedJobs.length && (
                      <p className="empty-state">No applied jobs tracked yet.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* ── JOB SEARCH ── */}
          {mode === "job-search" && (
            <div className="section-fade">
              <div className="section-header">
                <div>
                  <p className="header-eyebrow">Legacy Workspace</p>
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 400, lineHeight: 1.2 }}>
                    Job Search & Matcher
                  </h1>
                </div>
                <button className="btn-ghost" onClick={() => setMode("home")}>
                  {iconBack} Back
                </button>
              </div>

              <div className="search-grid" style={{ marginBottom: 20 }}>
                {/* 1. Parse Resume */}
                <div className="card">
                  <p className="card-eyebrow">Step 01</p>
                  <h2 className="card-title">Parse Resume</h2>
                  <p className="card-body">Upload your resume to run the ATS parser and populate the job matcher.</p>
                  <form className="form-grid" onSubmit={handleResumeSubmit}>
                    <div className="field">
                      <label className="field-label">Resume text</label>
                      <textarea
                        className="field-textarea tall"
                        value={resumeText}
                        onChange={(e) => setResumeText(e.target.value)}
                        placeholder="Paste your experience, skills, certifications, and tools — or upload a PDF below."
                      />
                    </div>
                    <div className="field">
                      <label className="field-label">Resume file</label>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.txt"
                        className="field-file"
                        onChange={(e) => setResumeFile(e.target.files?.[0] ?? null)}
                      />
                    </div>
                    <div>
                      <button className="btn-primary" type="submit" disabled={isPending}>
                        Extract Keywords {iconArrow}
                      </button>
                    </div>
                  </form>
                </div>

                {/* 2. ATS Profile */}
                <div className="card">
                  <p className="card-eyebrow">Step 02</p>
                  <h2 className="card-title">ATS Profile</h2>
                  <p className="card-body">Weighted keywords and candidate archetype from the latest parsed resume.</p>
                  {data?.resume ? (
                    <>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                        <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{data.resume.filename}</span>
                        <span className="badge badge-gold">Parsed</span>
                      </div>
                      {data.profile && (
                        <div className="profile-block">
                          <div className="profile-lane">
                            {data.profile.archetype_label}
                            {data.profile.early_career && (
                              <span className="badge badge-success">{iconCheck} Entry-level</span>
                            )}
                          </div>
                          <p className="profile-summary">{data.profile.summary}</p>
                        </div>
                      )}
                      <div className="keyword-cloud">
                        {data.keywords.map((kw) => (
                          <div className="keyword-chip" key={`${kw.category}-${kw.keyword}`}>
                            <strong>{kw.keyword}</strong>
                            <small>{kw.category} · {kw.score.toFixed(1)}</small>
                          </div>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="empty-state">No resume parsed yet.</p>
                  )}
                </div>
              </div>

              <div className="search-grid">
                {/* 3. Gmail */}
                <div className="card">
                  <p className="card-eyebrow">Step 03</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {iconMail}
                    <h2 className="card-title" style={{ marginBottom: 0 }}>Gmail Monitor</h2>
                  </div>
                  <p className="card-body" style={{ marginTop: 8 }}>
                    Authenticate via Google OAuth, then scan recent job-related email.
                  </p>
                  {data?.gmail_connection ? (
                    <div>
                      <div className="connection-info">
                        <span className="connection-dot" />
                        {data.gmail_connection.email}
                      </div>
                      <button
                        className="btn-ghost"
                        onClick={() => startTransition(() => { void handleCheckGmail(); })}
                      >
                        {iconMail} Check Gmail Now
                      </button>
                      {emails.length > 0 && (
                        <div style={{ display: "grid", gap: 10, marginTop: 20 }}>
                          {emails.map((email) => (
                            <div className="email-card" key={email.id}>
                              <strong>{email.subject || "No subject"}</strong>
                              <p className="from">{email.from}</p>
                              <p className="date">{email.date}</p>
                              <p className="snippet">{email.snippet}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div style={{ display: "grid", gap: 12 }}>
                      <p className="empty-state">Gmail not connected.</p>
                      <a href={`${API_BASE}/gmail/connect`} className="btn-primary" style={{ width: "fit-content" }}>
                        Connect Gmail {iconArrow}
                      </a>
                    </div>
                  )}
                </div>

                {/* 4. Matched Jobs */}
                <div className="card">
                  <p className="card-eyebrow">Step 04</p>
                  <h2 className="card-title">Matched Jobs</h2>
                  <p className="card-body">Seeded matches from the keyword parser.</p>
                  {data?.jobs?.length ? (
                    <div className="job-scroll">
                      {data.jobs.map((job) => (
                        <div className="job-row" key={job.id} style={{ flexDirection: "column", alignItems: "stretch" }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                            <div>
                              <p className="job-title" style={{ fontSize: 15 }}>{job.title}</p>
                              <p className="job-meta">{job.company} · {job.location}</p>
                            </div>
                            {job.applied
                              ? <span className="badge badge-success">{iconCheck} Applied</span>
                              : <button
                                  className="btn-ghost"
                                  style={{ fontSize: 12, padding: "7px 14px" }}
                                  onClick={() => startTransition(() => { void handleApply(job.id); })}
                                >
                                  Mark Applied
                                </button>
                            }
                          </div>
                          <p className="eval-text" style={{ fontSize: 12.5, marginTop: 10 }}>{job.evaluation_summary}</p>
                          <div className="score-grid">
                            {Object.entries(job.score_breakdown).map(([key, val]) => (
                              <div className="score-item" key={key}>
                                <div className="score-item-label">
                                  <span>{SCORE_LABELS[key] ?? key}</span>
                                  <span className="score-item-val">{val.toFixed(1)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="btn-row" style={{ marginTop: 8 }}>
                            <a href={job.job_url} target="_blank" rel="noreferrer" className="btn-dark" style={{ fontSize: 12 }}>
                              View Posting {iconArrow}
                            </a>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-state">No jobs yet. Parse a resume to populate the matcher.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
