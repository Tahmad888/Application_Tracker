"use client";

import { FormEvent, useEffect, useRef, useState, useTransition } from "react";
import { Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(ArcElement, Tooltip, Legend);

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

type StatusNotification = {
  id: number;
  job_id: number;
  title: string;
  company: string;
  old_status: string;
  new_status: string;
  source: string;
  email_id: string;
  email_subject: string;
  matched_from: string;
  email_snippet: string;
  observed_at: string;
  is_seen: number;
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
  matched_strengths?: string[];
  missing_requirements?: string[];
  project_suggestions?: string[];
  experience_suggestions?: string[];
  tailored_text: string;
};

type TrackedJobDraft = {
  external_id: string;
  title: string;
  company: string;
  location: string;
  posted_at: string;
  source: string;
  source_type: string;
  job_url: string;
  description: string;
  description_snippet: string;
  seeded_at: string;
};

type TrackerPreview = {
  parsed_job: TrackedJobDraft;
  confidence_score: number;
  confidence_level: string;
  parse_warnings: string[];
  requires_confirmation: boolean;
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
  status_notifications: StatusNotification[];
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

function JobTypePieChart({ jobs }: { jobs: { title: string }[] }) {
  const categorize = (title: string): string => {
    const t = title.toLowerCase();
    if (t.includes("security") || t.includes("cyber")) return "Security";
    if (t.includes("support") || t.includes("helpdesk") || t.includes("help desk")) return "Tech Support";
    if (t.includes("it ") || t.includes("information tech") || t.includes("systems")) return "IT";
    if (t.includes("implementation") || t.includes("specialist")) return "Specialist";
    return "Other";
  };

  const counts: Record<string, number> = {};
  jobs.forEach((job) => {
    const cat = categorize(job.title);
    counts[cat] = (counts[cat] ?? 0) + 1;
  });

  const labels = Object.keys(counts);
  const values = Object.values(counts);
  const total = values.reduce((a, b) => a + b, 0);
  const COLORS = ["#3D6B5E", "#6A9E92", "#A8C4BE", "#D4E4E1"];

  return (
    <div style={{ background: "var(--ink-2)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", boxShadow: "none" }}>
      <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14 }}>Job type mix</p>
      <div style={{ position: "relative", width: "100%", height: 140 }}>
        {total > 0 ? (
          <Doughnut
            data={{
              labels,
              datasets: [{
                data: values,
                backgroundColor: COLORS.slice(0, labels.length),
                borderWidth: 0,
                hoverOffset: 4,
              }],
            }}
            options={{
              responsive: true,
              maintainAspectRatio: false,
              cutout: "70%",
              plugins: {
                legend: { display: false },
                tooltip: {
                  callbacks: {
                    label: (context) => ` ${context.label}: ${context.parsed}`,
                  },
                },
              },
            }}
          />
        ) : (
          <div style={{ height: "100%", borderRadius: "50%", border: "10px solid var(--panel-line)" }} />
        )}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 22, color: "var(--text-primary)" }}>{total}</div>
          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>total</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
        {labels.length ? labels.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 11 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 7, color: "var(--text-secondary)" }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: COLORS[i], flexShrink: 0, display: "inline-block" }} />
              {label}
            </span>
            <span style={{ color: "var(--text-muted)" }}>{Math.round((values[i] / total) * 100)}%</span>
          </div>
        )) : (
          <span style={{ color: "var(--text-muted)", fontSize: 11 }}>No applications logged yet.</span>
        )}
      </div>
    </div>
  );
}

function WeeklyActivityChart({ jobs }: { jobs: { applied_at: string }[] }) {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const counts = new Array(7).fill(0);
  jobs.forEach((job) => {
    const d = new Date(job.applied_at);
    if (!Number.isNaN(d.getTime())) counts[d.getDay()]++;
  });
  const max = Math.max(...counts, 1);

  return (
    <div style={{ background: "var(--ink-2)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", boxShadow: "none" }}>
      <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14 }}>Weekly activity</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((day, i) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "var(--text-secondary)" }}>
              <span>{day}</span><span>{counts[i]}</span>
            </div>
            <div style={{ background: "var(--panel-line)", borderRadius: 3, height: 5, width: "100%" }}>
              <div style={{ borderRadius: 3, height: 5, width: `${Math.round((counts[i] / max) * 100)}%`, background: "var(--gold)" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

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
  const [trackerPreview, setTrackerPreview] = useState<TrackerPreview | null>(null);
  const [confirmedJob, setConfirmedJob] = useState<TrackedJobDraft | null>(null);
  const [message, setMessage] = useState<string | null>(
    authLevel === "error" ? null : authMessage,
  );
  const [error, setError] = useState<string | null>(
    authLevel === "error" ? authMessage : null,
  );
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [statusUpdates, setStatusUpdates] = useState<StatusNotification[]>([]);
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
      data?: {
        emails: EmailMessage[];
        status_updates: StatusNotification[];
        matched_count: number;
        updated_count: number;
        unmatched_count: number;
      };
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Gmail check failed.");
      return;
    }

    setMessage(payload.message);
    setEmails(payload.data.emails);
    setStatusUpdates(payload.data.status_updates);
    await loadDashboard();
  }

  async function handleTrackerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    setTailoredResume(null);

    const body = new FormData();
    body.append("stage", "preview");
    body.append("job_url", jobUrl);
    body.append("resume_text", trackerResumeText);
    body.append("notes", trackerNotes);
    if (trackerResumeFile) body.append("resume_file", trackerResumeFile);

    const response = await fetch(`${API_BASE}/api/tracker/intake`, { method: "POST", body });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: {
        parsed_job: TrackedJobDraft;
        confidence_score: number;
        confidence_level: string;
        parse_warnings: string[];
        requires_confirmation: boolean;
        tailored_resume?: TailoredResume | null;
      };
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not track that job link.");
      return;
    }

    setMessage(payload.message);
    setTrackerPreview({
      parsed_job: payload.data.parsed_job,
      confidence_score: payload.data.confidence_score,
      confidence_level: payload.data.confidence_level,
      parse_warnings: payload.data.parse_warnings,
      requires_confirmation: payload.data.requires_confirmation,
    });
    setConfirmedJob(payload.data.parsed_job);
    setTailoredResume(payload.data.tailored_resume ?? null);
  }

  async function handleTrackerConfirm() {
    if (!confirmedJob) {
      setError("Preview the job first so you can confirm the extracted details.");
      return;
    }

    setMessage(null);
    setError(null);

    const body = new FormData();
    body.append("stage", "confirm");
    body.append("job_url", jobUrl);
    body.append("resume_text", trackerResumeText);
    body.append("notes", trackerNotes);
    body.append("title", confirmedJob.title);
    body.append("company", confirmedJob.company);
    body.append("location", confirmedJob.location);
    body.append("posted_at", confirmedJob.posted_at);
    body.append("source", confirmedJob.source);
    body.append("source_type", confirmedJob.source_type);
    body.append("description", confirmedJob.description);
    body.append("description_snippet", confirmedJob.description_snippet);
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
      setError(payload.message || "Could not save that tracked job.");
      return;
    }

    setMessage(payload.message);
    setData(payload.data.dashboard);
    setTailoredResume(payload.data.tailored_resume ?? null);
    setTrackerPreview(null);
    setConfirmedJob(null);
    setJobUrl("");
    setTrackerResumeText("");
    setTrackerResumeFile(null);
    setTrackerNotes("");
    if (trackerFileInputRef.current) trackerFileInputRef.current.value = "";
  }

  const appliedJobs = data?.jobs.filter((job) => job.applied) ?? [];
  const sortedAppliedJobs = [...appliedJobs].sort((left, right) => {
    const leftDate = left.application?.applied_at || left.posted_at || "";
    const rightDate = right.application?.applied_at || right.posted_at || "";
    return rightDate.localeCompare(leftDate);
  });
  const recentJobs = sortedAppliedJobs.map((job) => ({
    title: job.title,
    company: job.company,
    location: job.location,
    applied_at: job.application?.applied_at ?? job.posted_at ?? "",
  }));
  const recentStatusNotifications = data?.status_notifications ?? [];
  const actionableStatuses = new Set([
    "In Review",
    "Recruiter Screen",
    "Assessment",
    "Interview",
    "Final Round",
    "Offer",
    "Rejected",
  ]);
  const latestNotificationByJob = new Map<number, StatusNotification>(
    recentStatusNotifications.map((item) => [item.job_id, item]),
  );
  const actionableJobs = sortedAppliedJobs.filter((job) =>
    actionableStatuses.has(job.application?.status ?? ""),
  );

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&family=DM+Mono:wght@400;500&display=swap');

    * { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --ink: #F5F4F0;
      --ink-2: #FFFFFF;
      --ink-3: #FFFFFF;
      --border: #E0DED8;
      --border-light: #E0DED8;
      --gold: #3D6B5E;
      --gold-dim: rgba(61, 107, 94, 0.10);
      --gold-glow: rgba(61, 107, 94, 0.06);
      --text-primary: #1A1A1A;
      --text-secondary: #9A9890;
      --text-muted: #9A9890;
      --success: #2f8a72;
      --success-dim: rgba(47, 138, 114, 0.12);
      --danger: #8C5A5A;
      --danger-dim: rgba(140, 90, 90, 0.10);
      --panel-line: #EEF0EE;
      --shadow-soft: none;
      --radius: 10px;
      --radius-sm: 10px;
      --radius-full: 8px;
    }

    body {
      background: var(--ink);
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
      font-weight: 400;
      min-height: 100vh;
    }

    .dashboard {
      min-height: 100vh;
      background: var(--ink);
      padding: 0;
    }

    /* ── Sidebar Nav ── */
    .layout {
      display: flex;
      min-height: 100vh;
    }

    .sidebar {
      width: 72px;
      background: #fbfaf7;
      border-right: 0.5px solid var(--border);
      box-shadow: none;
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
      color: #ffffff;
      font-weight: 500;
      box-shadow: none;
    }

    .nav-btn {
      width: 44px;
      height: 44px;
      border-radius: 12px;
      border: 0.5px solid transparent;
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
      background: rgba(61, 107, 94, 0.06);
      color: var(--text-primary);
      border-color: var(--border-light);
    }

    .nav-btn.active {
      background: var(--gold-dim);
      color: var(--gold);
      border-color: var(--gold);
    }

    .nav-tooltip {
      position: absolute;
      left: calc(100% + 12px);
      background: var(--ink-2);
      border: 0.5px solid var(--border-light);
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
      min-width: 0;
      padding: 28px clamp(18px, 2.4vw, 40px) 40px;
      background: transparent;
    }

    /* ── Header ── */
    .header {
      margin-bottom: 52px;
      max-width: 960px;
    }

    .header-eyebrow {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      color: var(--text-muted);
      text-transform: uppercase;
      margin-bottom: 12px;
    }

    .header-title {
      font-family: 'Playfair Display', serif;
      font-size: clamp(36px, 4vw, 52px);
      font-weight: 500;
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
      max-width: 680px;
      font-weight: 400;
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
      border: 0.5px solid;
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
      grid-template-columns: repeat(3, minmax(220px, 1fr));
      gap: 18px;
      margin-bottom: 40px;
    }

    @media (max-width: 980px) {
      .stats-row { grid-template-columns: 1fr; }
    }

    .stat-card {
      background: var(--ink-2);
      border: 0.5px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      position: relative;
      overflow: hidden;
      transition: border-color 0.2s ease;
      box-shadow: none;
    }

    .stat-card::before {
      content: '';
      position: absolute;
      top: 0; left: 0; right: 0;
      height: 1px;
      background: linear-gradient(90deg, var(--gold), transparent);
      opacity: 0;
      transition: opacity 0.2s ease;
    }

    .stat-card:hover { border-color: var(--border-light); }
    .stat-card:hover::before { opacity: 1; }

    .stat-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .stat-value {
      font-family: 'Playfair Display', serif;
      font-size: 28px;
      font-weight: 500;
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
      grid-template-columns: minmax(0, 1.55fr) minmax(360px, 1fr);
      align-items: stretch;
      gap: 22px;
      margin-bottom: 40px;
    }

    @media (max-width: 900px) {
      .action-grid { grid-template-columns: 1fr; }
    }

    .card {
      background: var(--ink-2);
      border: 0.5px solid var(--border);
      border-radius: var(--radius);
      padding: 1rem 1.25rem;
      transition: border-color 0.2s ease;
      min-width: 0;
      box-shadow: none;
    }

    .card:hover { border-color: var(--border-light); }

    .card-eyebrow {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .card-title {
      font-family: 'Playfair Display', serif;
      font-size: 24px;
      font-weight: 500;
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
      color: #FFFFFF;
      border: none;
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13.5px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-primary:hover {
      background: #2F5449;
      transform: none;
      box-shadow: none;
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
      color: var(--gold);
      border: 0.5px solid var(--gold);
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-ghost:hover {
      background: rgba(61, 107, 94, 0.06);
      color: var(--gold);
      border-color: var(--gold);
    }

    .btn-dark {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 10px 18px;
      background: transparent;
      color: var(--gold);
      border: 0.5px solid var(--gold);
      border-radius: 8px;
      font-family: 'DM Sans', sans-serif;
      font-size: 13px;
      font-weight: 400;
      cursor: pointer;
      transition: all 0.2s ease;
      text-decoration: none;
    }

    .btn-dark:hover {
      background: rgba(61, 107, 94, 0.06);
      border-color: var(--gold);
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
      font-weight: 500;
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
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
    }

    .field-input,
    .field-textarea,
    .field-file {
      background: var(--ink-3);
      border: 0.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 12px 16px;
      color: var(--text-primary);
      font-family: 'DM Sans', sans-serif;
      font-size: 14px;
      font-weight: 400;
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
      border-color: var(--gold);
      box-shadow: none;
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
      grid-template-columns: minmax(360px, 0.92fr) minmax(540px, 1.18fr);
      align-items: start;
      gap: 22px;
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
      border: 0.5px solid var(--border);
      border-radius: var(--radius-sm);
      transition: border-color 0.2s ease;
    }

    .job-row:hover { border-color: var(--border-light); }

    .job-list {
      display: grid;
      gap: 10px;
    }

    .job-list.scrollable {
      max-height: 560px;
      overflow-y: auto;
      padding-right: 6px;
    }

    .job-list.scrollable::-webkit-scrollbar {
      width: 8px;
    }

    .job-list.scrollable::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 999px;
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
      border: 0.5px solid rgba(61, 107, 94, 0.18);
    }

    .badge-success {
      background: var(--success-dim);
      color: var(--success);
      border: 0.5px solid rgba(47,138,114,0.22);
    }

    /* ── Tailored resume panel ── */
    .tailored-empty {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 360px;
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
      border: 0.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 18px;
    }

    .tailored-block-label {
      font-family: 'DM Mono', monospace;
      font-size: 10px;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      color: var(--text-muted);
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
      border: 0.5px solid rgba(61, 107, 94, 0.18);
      border-radius: 999px;
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
      background: #FCFCFA;
      border-left: 1.5px solid var(--gold);
      border-radius: 0 6px 6px 0;
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .code-block {
      background: #FFFFFF;
      border: 0.5px solid var(--border);
      border-radius: var(--radius-sm);
      padding: 20px;
      font-family: 'DM Mono', monospace;
      font-size: 12.5px;
      color: #5e494b;
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
      border: 0.5px solid var(--border);
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
      border: 0.5px solid var(--border);
      border-radius: 8px;
      transition: border-color 0.15s ease;
    }

    .keyword-chip:hover { border-color: var(--gold); }

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
      background: #FFFFFF;
      border: 0.5px solid #EEEEEE;
      border-radius: var(--radius-sm);
      transition: border-color 0.15s ease;
      min-height: 92px;
    }

    .recent-card:hover { border-color: var(--gold); }

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

    .recent-title-row {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .recent-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: var(--gold);
      flex-shrink: 0;
    }

    /* ── Number line under stat ── */
    .stat-accent-line {
      width: 32px;
      height: 1.5px;
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
      border: 0.5px solid rgba(61, 107, 94, 0.18);
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
      border: 0.5px solid var(--border);
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

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, padding: "0 28px 16px" }}>
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
                  <p className="stat-value" style={{ fontSize: 28, paddingTop: 10, color: data ? "var(--gold)" : "var(--text-primary)", fontWeight: 500 }}>
                    <span style={{ display: "inline-block", paddingBottom: 4, borderBottom: data ? "1.5px solid var(--gold)" : "none" }}>
                      {data ? "Live" : "—"}
                    </span>
                  </p>
                  {!data && <div className="stat-accent-line" />}
                  <p className="stat-desc">backend connection</p>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0,1fr))", gap: 10, padding: "0 28px 16px" }}>
                <JobTypePieChart jobs={recentJobs} />
                <WeeklyActivityChart jobs={recentJobs} />
                <div style={{ background: "var(--ink-2)", border: "0.5px solid var(--border)", borderRadius: 10, padding: "1rem 1.25rem", boxShadow: "none" }}>
                  <p style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 14 }}>Recently applied</p>
                  <div style={{ display: "flex", flexDirection: "column" }}>
                    {recentJobs.slice(0, 4).map((job, i) => (
                      <div key={`${job.title}-${job.company}-${i}`} style={{ padding: "10px 0", borderBottom: i < Math.min(recentJobs.length, 4) - 1 ? "0.5px solid #EEEEEE" : "none" }}>
                        <div className="recent-title-row">
                          <span className="recent-dot" />
                          <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>{job.title}</div>
                        </div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2, paddingLeft: 14 }}>{job.company}{job.location ? ` · ${job.location}` : ""}</div>
                      </div>
                    ))}
                    {!recentJobs.length && (
                      <p className="empty-state">No tracked applications yet.</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, padding: "0 28px 16px" }}>
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
                  <p className="card-eyebrow">Legacy Workspace</p>
                  <h2 className="card-title" style={{ color: "var(--text-secondary)" }}>ATS Tools</h2>
                  <p className="card-body">
                    ATS keyword parser, seeded job matcher, and Gmail monitor
                  </p>
                  <div className="btn-row">
                    <button className="btn-ghost" onClick={() => setMode("job-search")}>
                      Open Job Search {iconArrow}
                    </button>
                  </div>
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 20, padding: "0 28px 16px" }}>
                <div className="card">
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginBottom: 12 }}>
                    <p className="card-eyebrow" style={{ marginBottom: 0 }}>Recent Status Updates</p>
                    {data?.gmail_connection ? (
                      <button
                        className="btn-ghost"
                        onClick={() => startTransition(() => { void handleCheckGmail(); })}
                      >
                        {iconMail} Check Gmail Now
                      </button>
                    ) : (
                      <a href={`${API_BASE}/gmail/connect`} className="btn-ghost">
                        Connect Gmail {iconArrow}
                      </a>
                    )}
                  </div>
                  <div style={{ display: "grid", gap: 10 }}>
                    {recentStatusNotifications.length > 0 ? (
                      recentStatusNotifications.map((update) => (
                        <div
                          key={`${update.id}-${update.job_id}`}
                          style={{
                            background: "#FFFFFF",
                            borderRadius: 8,
                            padding: "12px 14px",
                            border: "0.5px solid #EEEEEE",
                            display: "grid",
                            gap: 5,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                            <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                              {update.title} · {update.company}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--gold)" }}>
                              {update.old_status} → {update.new_status}
                            </div>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                            {update.email_snippet || update.email_subject}
                          </div>
                          <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                            {update.observed_at}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="empty-state">No Gmail-driven status changes yet.</p>
                    )}
                  </div>
                </div>

                <div className="card">
                  <p className="card-eyebrow">Action Needed</p>
                  <div style={{ display: "grid", gap: 10 }}>
                    {actionableJobs.length > 0 ? (
                      actionableJobs.slice(0, 6).map((job) => {
                        const notification = latestNotificationByJob.get(job.id);
                        return (
                          <div
                            key={job.id}
                            style={{
                              background: "#FFFFFF",
                              borderRadius: 8,
                              padding: "12px 14px",
                              border: "0.5px solid #EEEEEE",
                              display: "grid",
                              gap: 6,
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                              <div style={{ fontSize: 13, color: "var(--text-primary)", fontWeight: 500 }}>
                                {job.title}
                              </div>
                              <div style={{ fontSize: 11, color: "var(--gold)" }}>
                                {job.application?.status}
                              </div>
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-secondary)" }}>
                              {job.company}{job.location ? ` · ${job.location}` : ""}
                            </div>
                            <div style={{ fontSize: 11, color: "var(--text-muted)" }}>
                              {notification?.email_snippet || notification?.email_subject || "Review the latest employer message for next steps."}
                            </div>
                            <div>
                              <a href={job.job_url} target="_blank" rel="noreferrer" className="btn-ghost">
                                Open Job {iconArrow}
                              </a>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <p className="empty-state">No active follow-up statuses right now.</p>
                    )}
                  </div>
                </div>
              </div>

              <div style={{ padding: "0 28px 20px", fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.05em", textAlign: "center" }}>
                CAREER COMMAND CENTER · v2
              </div>
            </div>
          )}

          {/* ── JOB TRACKER ── */}
          {mode === "job-tracker" && (
            <div className="section-fade">
              <div className="section-header">
                <div>
                  <p className="header-eyebrow">Job Tracker</p>
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 500, lineHeight: 1.2 }}>
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
                        onChange={(e) => {
                          setJobUrl(e.target.value);
                          setTrackerPreview(null);
                          setConfirmedJob(null);
                        }}
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
                        {iconDoc} Preview Job & Tailor Resume
                      </button>
                    </div>

                    {trackerPreview && confirmedJob && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: 16,
                          borderRadius: 14,
                          border: "0.5px solid var(--border-light)",
                          background: "var(--gold-glow)",
                          display: "grid",
                          gap: 14,
                        }}
                      >
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
                          <p className="field-label" style={{ marginBottom: 0 }}>Parsed Job Review</p>
                          <span
                            style={{
                              display: "inline-flex",
                              alignItems: "center",
                              gap: 6,
                              borderRadius: 999,
                              padding: "6px 10px",
                              fontSize: 11,
                              textTransform: "uppercase",
                              letterSpacing: "0.08em",
                              color: trackerPreview.confidence_level === "high" ? "#FFFFFF" : "var(--text-primary)",
                              background:
                                trackerPreview.confidence_level === "high"
                                  ? "var(--gold)"
                                  : trackerPreview.confidence_level === "medium"
                                    ? "rgba(61, 107, 94, 0.12)"
                                    : "rgba(140, 90, 90, 0.10)",
                              border: "0.5px solid var(--border-light)",
                            }}
                          >
                            {trackerPreview.confidence_level} confidence · {trackerPreview.confidence_score}
                          </span>
                        </div>

                        {trackerPreview.parse_warnings.length > 0 && (
                          <div
                            style={{
                              borderRadius: 12,
                              border: "0.5px solid rgba(140,90,90,0.22)",
                              background: "rgba(140,90,90,0.06)",
                              padding: 12,
                              display: "grid",
                              gap: 8,
                            }}
                          >
                            <p className="field-label" style={{ marginBottom: 0, color: "var(--danger)" }}>
                              Review Needed
                            </p>
                            <div className="alignment-list">
                              {trackerPreview.parse_warnings.map((warning) => (
                                <div className="alignment-item" key={warning}>{warning}</div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="field">
                          <label className="field-label">Job title</label>
                          <input
                            type="text"
                            className="field-input"
                            value={confirmedJob.title}
                            onChange={(e) =>
                              setConfirmedJob({ ...confirmedJob, title: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">Company</label>
                          <input
                            type="text"
                            className="field-input"
                            value={confirmedJob.company}
                            onChange={(e) =>
                              setConfirmedJob({ ...confirmedJob, company: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">Location</label>
                          <input
                            type="text"
                            className="field-input"
                            value={confirmedJob.location}
                            onChange={(e) =>
                              setConfirmedJob({ ...confirmedJob, location: e.target.value })
                            }
                          />
                        </div>
                        <div className="field">
                          <label className="field-label">Description snippet</label>
                          <textarea
                            className="field-textarea"
                            value={confirmedJob.description_snippet}
                            onChange={(e) =>
                              setConfirmedJob({
                                ...confirmedJob,
                                description_snippet: e.target.value,
                                description: e.target.value || confirmedJob.description,
                              })
                            }
                          />
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
                          <button
                            className="btn-primary"
                            type="button"
                            disabled={isPending}
                            onClick={() => {
                              startTransition(() => {
                                void handleTrackerConfirm();
                              });
                            }}
                          >
                            {iconDoc} Confirm & Save
                          </button>
                          <button
                            className="btn-ghost"
                            type="button"
                            onClick={() => {
                              setTrackerPreview(null);
                              setConfirmedJob(null);
                              setTailoredResume(null);
                            }}
                          >
                            Clear Review
                          </button>
                        </div>
                      </div>
                    )}
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
                      {!!tailoredResume.matched_strengths?.length && (
                        <div>
                          <p className="field-label" style={{ marginBottom: 10 }}>Matched Strengths</p>
                          <div className="alignment-list">
                            {tailoredResume.matched_strengths.map((item) => (
                              <div className="alignment-item" key={item}>{item}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!tailoredResume.missing_requirements?.length && (
                        <div>
                          <p className="field-label" style={{ marginBottom: 10 }}>Missing Requirements</p>
                          <div className="alignment-list">
                            {tailoredResume.missing_requirements.map((item) => (
                              <div className="alignment-item" key={item}>{item}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!tailoredResume.experience_suggestions?.length && (
                        <div>
                          <p className="field-label" style={{ marginBottom: 10 }}>Experience Suggestions</p>
                          <div className="alignment-list">
                            {tailoredResume.experience_suggestions.map((item) => (
                              <div className="alignment-item" key={item}>{item}</div>
                            ))}
                          </div>
                        </div>
                      )}
                      {!!tailoredResume.project_suggestions?.length && (
                        <div>
                          <p className="field-label" style={{ marginBottom: 10 }}>Project Suggestions</p>
                          <div className="alignment-list">
                            {tailoredResume.project_suggestions.map((item) => (
                              <div className="alignment-item" key={item}>{item}</div>
                            ))}
                          </div>
                        </div>
                      )}
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
                  <div className="job-list scrollable">
                    {sortedAppliedJobs.map((job) => (
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
                    {!sortedAppliedJobs.length && (
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
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 500, lineHeight: 1.2 }}>
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
                      {statusUpdates.length > 0 && (
                        <div style={{ marginTop: 16, display: "grid", gap: 8 }}>
                          <p className="field-label" style={{ marginBottom: 0 }}>Latest status changes</p>
                          <div className="alignment-list">
                            {statusUpdates.map((update) => (
                              <div className="alignment-item" key={`${update.id}-${update.job_id}`}>
                                {update.title}: {update.old_status} → {update.new_status}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
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
