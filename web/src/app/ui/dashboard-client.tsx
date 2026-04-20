"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useTransition } from "react";
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
  response_hub: {
    responses: ResponseRecord[];
    calendar_events: CalendarEventRecord[];
  };
};

type DashboardClientProps = {
  authLevel: string | null;
  authMessage: string | null;
};

type ResponseStatus =
  | "Awaiting Reply"
  | "Offer Awaiting Response"
  | "Recruiter Call Scheduled"
  | "Interview Scheduled"
  | "Interviewing"
  | "Closed";
type ContactChannel = "LinkedIn" | "Gmail" | "Phone" | "Other";
type CalendarEventType = "Interview" | "Recruiter Call";

type ResponseRecord = {
  id: string;
  company: string;
  role: string;
  recruiterName: string;
  contactChannel: ContactChannel;
  contactHandle: string;
  status: ResponseStatus;
  lastUpdated: string;
  notes: string;
};

type CalendarEventRecord = {
  id: string;
  responseId?: string;
  company: string;
  role: string;
  recruiterName: string;
  type: CalendarEventType;
  startsAt: string;
  location: string;
  notes: string;
};

type ViewMode = "home" | "job-search" | "job-tracker" | "ops-dashboard";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:5000";
const SCORE_LABELS: Record<string, string> = {
  title_fit: "Title",
  skill_fit: "Skills",
  archetype_fit: "Lane",
  seniority_fit: "Seniority",
  location_fit: "Location",
  freshness_fit: "Freshness",
};

const LEGACY_RESPONSE_HUB_STORAGE_KEY = "career-command-center-response-hub";
const RESPONSE_STATUS_OPTIONS: Array<{ value: ResponseStatus; label: string }> = [
  { value: "Awaiting Reply", label: "Awaiting Reply" },
  { value: "Offer Awaiting Response", label: "Job Offer Awaiting Response" },
  { value: "Recruiter Call Scheduled", label: "Recruiter Call Scheduled" },
  { value: "Interview Scheduled", label: "Interview Scheduled" },
  { value: "Interviewing", label: "Active Interview Process" },
  { value: "Closed", label: "Closed" },
];

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function eventTypeForStatus(status: ResponseStatus): CalendarEventType | null {
  if (status === "Recruiter Call Scheduled") return "Recruiter Call";
  if (status === "Interview Scheduled") return "Interview";
  return null;
}

function differenceInDays(dateLike: string) {
  if (!dateLike) return 0;
  const target = new Date(dateLike);
  if (Number.isNaN(target.getTime())) return 0;
  const now = new Date();
  return Math.floor((now.getTime() - target.getTime()) / (1000 * 60 * 60 * 24));
}

function formatShortDate(dateLike: string) {
  if (!dateLike) return "Date not set";
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return dateLike;
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function formatShortDateTime(dateLike: string) {
  if (!dateLike) return "Time not set";
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return dateLike;
  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatWeekdayTime(dateLike: string) {
  if (!dateLike) return "Time not set";
  const parsed = new Date(dateLike);
  if (Number.isNaN(parsed.getTime())) return dateLike;
  return parsed.toLocaleString(undefined, {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
  });
}

function getTimePartsUntil(dateLike: string, nowTimestamp: number) {
  const target = new Date(dateLike);
  if (Number.isNaN(target.getTime())) {
    return { days: 0, hours: 0, minutes: 0 };
  }
  const diff = Math.max(target.getTime() - nowTimestamp, 0);
  const totalMinutes = Math.floor(diff / (1000 * 60));
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;
  return { days, hours, minutes };
}

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
  const COLORS = ["#5A8DE1", "#53A874", "#C78533", "#A16BDB", "#D3DAE8"];

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #DFE6F2",
        borderRadius: 14,
        padding: "1.1rem 1.25rem",
        boxShadow: "0 1px 0 rgba(26,26,26,0.02)",
      }}
    >
      <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>Applications by type</p>
      <div style={{ position: "relative", width: "100%", height: 192 }}>
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
          <div style={{ height: "100%", borderRadius: "50%", border: "10px solid #E7EDF8" }} />
        )}
        <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", textAlign: "center", pointerEvents: "none" }}>
          <div style={{ fontSize: 27, color: "var(--text-primary)", fontWeight: 500 }}>{total}</div>
          <div style={{ fontSize: 12, color: "var(--text-muted)" }}>total</div>
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 7, marginTop: 12 }}>
        {labels.length ? labels.map((label, i) => (
          <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 13 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, color: "#5B6474" }}>
              <span style={{ width: 10, height: 10, borderRadius: 2, background: COLORS[i], flexShrink: 0, display: "inline-block" }} />
              {label}
            </span>
            <span style={{ color: "#6A7488", fontWeight: 500, fontSize: 13 }}>{Math.round((values[i] / total) * 100)}%</span>
          </div>
        )) : (
          <span style={{ color: "var(--text-muted)", fontSize: 13 }}>No applications logged yet.</span>
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
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #DFE6F2",
        borderRadius: 14,
        padding: "1.1rem 1.25rem",
        boxShadow: "0 1px 0 rgba(26,26,26,0.02)",
      }}
    >
      <p style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--text-muted)", marginBottom: 16 }}>This week&apos;s activity</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {days.map((day, i) => (
          <div key={day} style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "#6A7488" }}>
              <span>{day}</span><span>{counts[i]}</span>
            </div>
            <div style={{ background: "#E7EEF9", borderRadius: 4, height: 8, width: "100%" }}>
              <div style={{ borderRadius: 4, height: 8, width: `${Math.round((counts[i] / max) * 100)}%`, background: "#5A8DE1" }} />
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
  const legacyMigrationAttemptedRef = useRef(false);
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
  const [responses, setResponses] = useState<ResponseRecord[]>([]);
  const [calendarEvents, setCalendarEvents] = useState<CalendarEventRecord[]>([]);
  const [responseDraft, setResponseDraft] = useState({
    company: "",
    role: "",
    recruiterName: "",
    contactChannel: "LinkedIn" as ContactChannel,
    contactHandle: "",
    status: "Awaiting Reply" as ResponseStatus,
    lastUpdated: new Date().toISOString().slice(0, 10),
    startsAt: "",
    location: "",
    notes: "",
  });
  const [message, setMessage] = useState<string | null>(
    authLevel === "error" ? null : authMessage,
  );
  const [error, setError] = useState<string | null>(
    authLevel === "error" ? authMessage : null,
  );
  const [emails, setEmails] = useState<EmailMessage[]>([]);
  const [statusUpdates, setStatusUpdates] = useState<StatusNotification[]>([]);
  const [currentTimestamp, setCurrentTimestamp] = useState(() => Date.now());
  const [isPending, startTransition] = useTransition();

  const syncDashboardState = (payload: DashboardData) => {
    setData(payload);
    setResponses(payload.response_hub?.responses ?? []);
    setCalendarEvents(payload.response_hub?.calendar_events ?? []);
    setStatusUpdates(payload.status_notifications ?? []);
  };

  const loadDashboard = useCallback(async () => {
    const response = await fetch(`${API_BASE}/api/dashboard`, { cache: "no-store" });
    if (!response.ok) {
      setError("Could not load dashboard data from the Python service.");
      return;
    }
    const payload = (await response.json()) as DashboardData;
    syncDashboardState(payload);
  }, []);

  const migrateLegacyResponseHub = useCallback(async (legacyData: {
    responses?: ResponseRecord[];
    calendarEvents?: CalendarEventRecord[];
  }) => {
    const legacyResponses = legacyData.responses ?? [];
    const legacyEvents = legacyData.calendarEvents ?? [];
    if (!legacyResponses.length) return;

    for (const responseItem of legacyResponses) {
      const matchedEvent = legacyEvents.find(
        (event) =>
          event.company === responseItem.company &&
          event.role === responseItem.role &&
          event.recruiterName === responseItem.recruiterName,
      );

      await fetch(`${API_BASE}/api/response-hub/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: responseItem.id,
          company: responseItem.company,
          role: responseItem.role,
          recruiterName: responseItem.recruiterName,
          contactChannel: responseItem.contactChannel,
          contactHandle: responseItem.contactHandle,
          status: responseItem.status,
          lastUpdated: responseItem.lastUpdated,
          notes: responseItem.notes,
          calendarEvent: matchedEvent
            ? {
                id: matchedEvent.id,
                type: matchedEvent.type,
                startsAt: matchedEvent.startsAt,
                location: matchedEvent.location,
                notes: matchedEvent.notes,
              }
            : null,
        }),
      });
    }

    window.localStorage.removeItem(LEGACY_RESPONSE_HUB_STORAGE_KEY);
    await loadDashboard();
    setMessage("Recovered older Response Hub data from browser storage and saved it into the app database.");
  }, [loadDashboard]);

  useEffect(() => {
    startTransition(() => {
      void loadDashboard();
    });
  }, [loadDashboard, startTransition]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setCurrentTimestamp(Date.now());
    }, 60_000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (!data || legacyMigrationAttemptedRef.current) return;
    legacyMigrationAttemptedRef.current = true;
    if ((data.response_hub?.responses?.length ?? 0) > 0 || (data.response_hub?.calendar_events?.length ?? 0) > 0) {
      return;
    }

    try {
      const raw = window.localStorage.getItem(LEGACY_RESPONSE_HUB_STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as {
        responses?: ResponseRecord[];
        calendarEvents?: CalendarEventRecord[];
      };
      if (!(parsed.responses ?? []).length) return;
      startTransition(() => {
        void migrateLegacyResponseHub(parsed);
      });
    } catch {
      // Ignore malformed legacy client-only storage and continue with DB-backed state.
    }
  }, [data, migrateLegacyResponseHub, startTransition]);

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
    syncDashboardState(payload.data);
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
    syncDashboardState(payload.data.dashboard);
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
  const sortedResponses = [...responses].sort((left, right) => {
    const rank = (status: ResponseStatus) => {
      switch (status) {
        case "Offer Awaiting Response":
          return 0;
        case "Recruiter Call Scheduled":
          return 1;
        case "Interview Scheduled":
          return 2;
        case "Interviewing":
          return 3;
        case "Awaiting Reply":
          return 4;
        case "Closed":
          return 5;
      }
    };
    const ranked = rank(left.status) - rank(right.status);
    if (ranked !== 0) return ranked;
    return right.lastUpdated.localeCompare(left.lastUpdated);
  });
  const sortedCalendarEvents = [...calendarEvents].sort((left, right) => left.startsAt.localeCompare(right.startsAt));

  const calendarDays = Array.from({ length: 7 }, (_, index) => {
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    base.setDate(base.getDate() + index);
    const dayKey = base.toISOString().slice(0, 10);
    return {
      dayKey,
      label: base.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }),
      isToday: index === 0,
      events: sortedCalendarEvents.filter((event) => event.startsAt.slice(0, 10) === dayKey),
    };
  });

  const respondedOpportunities = responses.filter((item) => item.status !== "Awaiting Reply" && item.status !== "Closed");
  const offerAwaitingResponseCount = responses.filter((item) => item.status === "Offer Awaiting Response").length;
  const scheduledCount = responses.filter((item) => item.status === "Interview Scheduled" || item.status === "Recruiter Call Scheduled").length;
  const waitingReplyCount = responses.filter((item) => item.status === "Awaiting Reply").length;
  const interviewingCount = responses.filter((item) => item.status === "Interviewing").length;
  const groupedResponses = {
    offerAwaitingResponse: sortedResponses.filter((item) => item.status === "Offer Awaiting Response"),
    scheduled: sortedResponses.filter((item) => item.status === "Interview Scheduled" || item.status === "Recruiter Call Scheduled"),
    interviewing: sortedResponses.filter((item) => item.status === "Interviewing"),
    waiting: sortedResponses.filter((item) => item.status === "Awaiting Reply"),
  };
  const upcomingCalendarEvents = sortedCalendarEvents.filter((item) => {
    const parsed = new Date(item.startsAt);
    return !Number.isNaN(parsed.getTime()) && parsed.getTime() >= currentTimestamp;
  });
  const nextCalendarEvent = upcomingCalendarEvents[0] ?? null;
  const nextCalendarCountdown = nextCalendarEvent
    ? getTimePartsUntil(nextCalendarEvent.startsAt, currentTimestamp)
    : { days: 0, hours: 0, minutes: 0 };
  const homeUpcomingEvents = upcomingCalendarEvents.slice(0, 4);
  const responseRate = sortedAppliedJobs.length
    ? Math.round((respondedOpportunities.length / sortedAppliedJobs.length) * 100)
    : 0;
  const activeProcessesCount = offerAwaitingResponseCount + scheduledCount + interviewingCount;
  const greetingLine = new Date().toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const recentAppliedCards = sortedAppliedJobs.slice(0, 4);
  const schedulingStatusSelected = eventTypeForStatus(responseDraft.status) !== null;

  function handleResponseStatusChange(status: ResponseStatus) {
    setResponseDraft((current) => ({
      ...current,
      status,
      startsAt: eventTypeForStatus(status) ? current.startsAt : "",
      location: eventTypeForStatus(status) ? current.location : "",
    }));
  }

  async function updateResponseStatus(id: string, status: ResponseStatus) {
    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/response-hub/responses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: DashboardData;
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not update that company action.");
      return;
    }

    setMessage(payload.message);
    syncDashboardState(payload.data);
  }

  async function deleteCalendarEvent(id: string) {
    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/response-hub/events/${id}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: DashboardData;
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not delete that scheduled event.");
      return;
    }

    setMessage(payload.message);
    syncDashboardState(payload.data);
  }

  async function deleteResponse(id: string) {
    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/response-hub/responses/${id}`, {
      method: "DELETE",
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: DashboardData;
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not delete that company action.");
      return;
    }

    setMessage(payload.message);
    syncDashboardState(payload.data);
  }

  async function addResponse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!responseDraft.company.trim() || !responseDraft.role.trim()) return;

    const eventType = eventTypeForStatus(responseDraft.status);
    const shouldCreateEvent = Boolean(responseDraft.startsAt) && Boolean(eventType);
    const responseId = createLocalId();

    setMessage(null);
    setError(null);

    const response = await fetch(`${API_BASE}/api/response-hub/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: responseId,
        company: responseDraft.company.trim(),
        role: responseDraft.role.trim(),
        recruiterName: responseDraft.recruiterName.trim(),
        contactChannel: responseDraft.contactChannel,
        contactHandle: responseDraft.contactHandle.trim(),
        status: responseDraft.status,
        lastUpdated: responseDraft.lastUpdated,
        notes: responseDraft.notes.trim(),
        calendarEvent: shouldCreateEvent
          ? {
              id: createLocalId(),
              type: eventType,
              startsAt: responseDraft.startsAt,
              location: responseDraft.location.trim(),
              notes: responseDraft.notes.trim(),
            }
          : null,
      }),
    });
    const payload = (await response.json()) as {
      ok: boolean;
      message: string;
      data?: DashboardData;
    };

    if (!response.ok || !payload.ok || !payload.data) {
      setError(payload.message || "Could not save that company action.");
      return;
    }

    setMessage(payload.message);
    syncDashboardState(payload.data);
    setResponseDraft({
      company: "",
      role: "",
      recruiterName: "",
      contactChannel: "LinkedIn",
      contactHandle: "",
      status: "Awaiting Reply",
      lastUpdated: new Date().toISOString().slice(0, 10),
      startsAt: "",
      location: "",
      notes: "",
    });
  }

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
      font-size: clamp(38px, 4.2vw, 56px);
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
      font-size: 16px;
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
      font-size: 14.5px;
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
      font-size: 11px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 12px;
    }

    .stat-value {
      font-family: 'Playfair Display', serif;
      font-size: 31px;
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1;
    }

    .stat-desc {
      margin-top: 8px;
      font-size: 13px;
      color: var(--text-muted);
    }

    .home-shell {
      display: grid;
      gap: 14px;
      padding: 0 28px 20px;
    }

    .home-hero {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 20px;
      padding: 0 0 4px;
    }

    .home-hero-title {
      font-size: 20px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 4px;
    }

    .home-hero-sub {
      font-size: 15px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .home-live-pill {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 7px 14px;
      border-radius: 999px;
      border: 1px solid rgba(123, 170, 84, 0.18);
      background: rgba(123, 170, 84, 0.12);
      color: #6F9D3F;
      font-size: 13px;
      font-weight: 500;
      white-space: nowrap;
    }

    .home-stats-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(0, 1fr));
      gap: 12px;
    }

    .home-main-grid {
      display: grid;
      grid-template-columns: minmax(0, 1fr) minmax(360px, 0.92fr);
      gap: 14px;
      align-items: start;
    }

    .home-left-stack,
    .home-right-stack {
      display: grid;
      gap: 12px;
      min-width: 0;
    }

    .spotlight-card {
      background: #EAF3FF;
      border: 1px solid #CFE0F8;
      box-shadow: 0 1px 0 rgba(90, 141, 225, 0.06);
    }

    .spotlight-kicker {
      font-size: 10px;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #5d7d74;
      margin-bottom: 12px;
      font-family: 'DM Mono', monospace;
    }

    .spotlight-title {
      font-size: 18px;
      font-weight: 500;
      color: #3B64A8;
      line-height: 1.4;
      margin-bottom: 4px;
    }

    .spotlight-meta {
      font-size: 14px;
      color: #5876A4;
      line-height: 1.5;
    }

    .countdown-grid {
      display: grid;
      grid-template-columns: repeat(3, minmax(88px, 128px));
      justify-content: start;
      gap: 10px;
      margin-top: 16px;
    }

    .countdown-box {
      background: #FFFFFF;
      border: 1px solid #D7E4F7;
      border-radius: 10px;
      padding: 14px 10px;
      text-align: center;
    }

    .countdown-value {
      font-size: 20px;
      font-weight: 500;
      color: #315FA9;
      line-height: 1;
    }

    .countdown-label {
      margin-top: 6px;
      font-size: 12px;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #5F7BAB;
    }

    .event-list {
      display: grid;
    }

    .event-row {
      display: grid;
      grid-template-columns: auto minmax(0, 1fr) auto;
      gap: 12px;
      align-items: start;
      padding: 14px 0;
      border-bottom: 0.5px solid #EEEEEE;
    }

    .event-row:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .event-row:first-child {
      padding-top: 0;
    }

    .event-dot {
      width: 8px;
      height: 8px;
      border-radius: 999px;
      margin-top: 7px;
      flex-shrink: 0;
    }

    .event-dot.interview {
      background: #4F83D8;
    }

    .event-dot.call {
      background: #53A874;
    }

    .event-role {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
      line-height: 1.4;
    }

    .event-detail {
      font-size: 13px;
      color: var(--text-secondary);
      margin-top: 2px;
      line-height: 1.45;
    }

    .event-time {
      font-size: 13px;
      color: #6A7488;
      white-space: nowrap;
      padding-top: 1px;
    }

    .home-chart-card {
      display: grid;
      width: 100%;
      min-width: 0;
      justify-self: stretch;
    }

    .home-chart-card > div {
      width: 100%;
      min-width: 0;
    }

    .home-chart-card canvas {
      max-height: 238px !important;
    }

    .recent-applied-row {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 0;
      border-top: 0.5px solid #EEEEEE;
    }

    .recent-application-card {
      padding: 14px 16px 12px;
      border-right: 0.5px solid #EEEEEE;
      min-height: 118px;
      display: grid;
      align-content: start;
      gap: 8px;
      background: #FFFFFF;
    }

    .recent-application-card:last-child {
      border-right: none;
    }

    .status-pill {
      display: inline-flex;
      align-items: center;
      padding: 4px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 500;
      width: fit-content;
    }

    .status-pill.applied {
      background: rgba(199, 133, 51, 0.14);
      color: #AE6F1F;
    }

    .status-pill.received {
      background: rgba(123, 170, 84, 0.16);
      color: #6E9441;
    }

    .status-pill.review,
    .status-pill.interview {
      background: rgba(90, 141, 225, 0.14);
      color: #4674C1;
    }

    .home-stats-grid .stat-card:nth-child(1) {
      background: #F8F3E8;
      border-color: #ECDDBA;
    }

    .home-stats-grid .stat-card:nth-child(2) {
      background: #EEF4FF;
      border-color: #D5E0F8;
    }

    .home-stats-grid .stat-card:nth-child(3) {
      background: #EEF6F1;
      border-color: #D6E6DD;
    }

    .home-shell .card {
      box-shadow: 0 1px 0 rgba(26, 26, 26, 0.02);
    }

    .home-emphasis-card {
      border: 1px solid #E5E8EE;
      border-radius: 14px;
      background: #FFFFFF;
      padding: 1.15rem 1.25rem;
    }

    @media (max-width: 1100px) {
      .home-main-grid {
        grid-template-columns: 1fr;
      }

      .recent-applied-row {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    @media (max-width: 760px) {
      .home-hero {
        flex-direction: column;
      }

      .home-stats-grid,
      .countdown-grid,
      .recent-applied-row {
        grid-template-columns: 1fr;
      }

      .recent-application-card {
        border-right: none;
        border-bottom: 0.5px solid #EEEEEE;
      }

      .recent-application-card:last-child {
        border-bottom: none;
      }
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
      font-size: 26px;
      font-weight: 500;
      color: var(--text-primary);
      margin-bottom: 12px;
      line-height: 1.3;
    }

    .card-body {
      font-size: 14.5px;
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
      font-size: 14.5px;
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
      font-size: 14px;
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
      font-size: 14px;
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
      font-size: 11px;
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
      font-size: 15px;
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

    .ops-tabs {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
      margin-bottom: 20px;
    }

    .ops-tab {
      border: 0.5px solid var(--border);
      background: #ffffff;
      color: var(--text-secondary);
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.18s ease;
    }

    .ops-tab.active {
      border-color: var(--gold);
      background: rgba(61, 107, 94, 0.06);
      color: var(--gold);
    }

    .ops-grid {
      display: grid;
      gap: 20px;
    }

    .ops-layout {
      display: grid;
      grid-template-columns: minmax(280px, 0.75fr) minmax(0, 1.25fr);
      gap: 20px;
      align-items: start;
    }

    @media (max-width: 1100px) {
      .ops-layout {
        grid-template-columns: 1fr;
      }
    }

    .ops-form {
      display: grid;
      gap: 12px;
    }

    .ops-list {
      display: grid;
      gap: 12px;
    }

    .ops-list-scroll {
      max-height: 470px;
      overflow-y: auto;
      padding-right: 6px;
      align-content: start;
    }

    .ops-list-scroll::-webkit-scrollbar {
      width: 8px;
    }

    .ops-list-scroll::-webkit-scrollbar-thumb {
      background: rgba(61, 107, 94, 0.18);
      border-radius: 999px;
    }

    .ops-list-scroll::-webkit-scrollbar-track {
      background: rgba(61, 107, 94, 0.05);
      border-radius: 999px;
    }

    .ops-item {
      border: 0.5px solid #EEEEEE;
      border-radius: 10px;
      padding: 14px 16px;
      background: #ffffff;
      display: grid;
      gap: 8px;
    }

    .ops-item-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 12px;
    }

    .ops-item-title {
      font-size: 15px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .ops-item-meta {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.5;
    }

    .ops-item-notes {
      font-size: 13px;
      color: var(--text-secondary);
      line-height: 1.6;
    }

    .ops-chip {
      display: inline-flex;
      align-items: center;
      padding: 4px 9px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 500;
      border: 0.5px solid var(--border);
      background: #ffffff;
      color: var(--text-secondary);
      white-space: nowrap;
    }

    .ops-chip.sage {
      border-color: rgba(61, 107, 94, 0.24);
      color: var(--gold);
      background: rgba(61, 107, 94, 0.06);
    }

    .ops-chip.warn {
      border-color: rgba(140, 90, 90, 0.18);
      color: #8C5A5A;
      background: rgba(140, 90, 90, 0.06);
    }

    .ops-chip.done {
      border-color: rgba(61, 107, 94, 0.18);
      color: #2f8a72;
      background: rgba(47, 138, 114, 0.06);
    }

    .ops-kpi-grid {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-bottom: 20px;
    }

    @media (max-width: 980px) {
      .ops-kpi-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .ops-kpi {
      border: 0.5px solid var(--border);
      border-radius: 10px;
      padding: 14px 16px;
      background: #ffffff;
      display: grid;
      gap: 6px;
    }

    .ops-kpi strong {
      font-size: 28px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .ops-board {
      display: grid;
      grid-template-columns: repeat(6, minmax(180px, 1fr));
      gap: 14px;
      overflow-x: auto;
      padding-bottom: 4px;
    }

    .ops-column {
      border: 0.5px solid var(--border);
      border-radius: 10px;
      background: #ffffff;
      padding: 12px;
      min-height: 260px;
      display: grid;
      gap: 10px;
      align-content: start;
    }

    .ops-column-header {
      font-size: 12px;
      font-weight: 500;
      color: var(--text-primary);
      border-bottom: 0.5px solid #EEEEEE;
      padding-bottom: 8px;
    }

    .ops-stage-card {
      border: 0.5px solid #EEEEEE;
      border-radius: 10px;
      padding: 12px;
      background: #ffffff;
      display: grid;
      gap: 8px;
      cursor: grab;
    }

    .ops-stage-card:active {
      cursor: grabbing;
    }

    .ops-actions {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
    }

    .mini-select {
      border: 0.5px solid var(--border);
      border-radius: 8px;
      padding: 8px 10px;
      font-size: 13px;
      color: var(--text-primary);
      background: #ffffff;
    }

    .task-row {
      display: flex;
      align-items: flex-start;
      justify-content: space-between;
      gap: 14px;
      border: 0.5px solid #EEEEEE;
      border-radius: 10px;
      padding: 14px 16px;
      background: #ffffff;
    }

    .task-row.overdue {
      border-color: rgba(140, 90, 90, 0.24);
    }

    .task-row.soon {
      border-color: rgba(61, 107, 94, 0.24);
    }

    .task-check {
      width: 18px;
      height: 18px;
      accent-color: var(--gold);
      margin-top: 2px;
    }

    .week-grid {
      display: grid;
      grid-template-columns: repeat(7, minmax(0, 1fr));
      gap: 12px;
    }

    @media (max-width: 980px) {
      .week-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
    }

    .week-day {
      border: 0.5px solid var(--border);
      border-radius: 10px;
      background: #ffffff;
      padding: 12px;
      display: grid;
      gap: 10px;
      min-height: 180px;
      align-content: start;
    }

    .week-day.today {
      border-color: var(--gold);
      background: rgba(61, 107, 94, 0.04);
    }

    .week-day-label {
      font-size: 13px;
      font-weight: 500;
      color: var(--text-primary);
      border-bottom: 0.5px solid #EEEEEE;
      padding-bottom: 8px;
    }

    .event-pill {
      border-radius: 8px;
      padding: 9px 10px;
      font-size: 12px;
      line-height: 1.5;
      border-left: 3px solid var(--gold);
      background: #FCFCFA;
      color: var(--text-secondary);
    }

    .event-pill.interview {
      border-left-color: #6A9E92;
    }

    .event-pill.assessment {
      border-left-color: #C09A4B;
    }

    .event-pill.followup {
      border-left-color: var(--gold);
    }

    .focus-grid {
      display: grid;
      gap: 10px;
    }

    .focus-item {
      border: 0.5px solid #EEEEEE;
      border-radius: 10px;
      padding: 12px 14px;
      background: #ffffff;
      display: grid;
      gap: 5px;
    }

    .focus-item strong {
      font-size: 14px;
      font-weight: 500;
      color: var(--text-primary);
    }

    .focus-item span {
      font-size: 12px;
      color: var(--text-secondary);
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

  const iconOps = (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 8h10M7 12h6M7 16h8"/>
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
          <button
            className={`nav-btn ${mode === "ops-dashboard" ? "active" : ""}`}
            onClick={() => setMode("ops-dashboard")}
          >
            {iconOps}
            <span className="nav-tooltip">Response Hub</span>
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
              <div className="home-shell">
                <div className="home-hero">
                  <div>
                    <div className="home-hero-title">Good evening, Talha</div>
                    <div className="home-hero-sub">
                      {greetingLine} · {data?.tracker_stats.applied_ytd ?? 0} applications tracked
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "flex-end" }}>
                    <span className="home-live-pill">{data ? "Live" : "Offline"}</span>
                    <button className="btn-primary" onClick={() => setMode("job-tracker")}>
                      Open Job Tracker {iconArrow}
                    </button>
                  </div>
                </div>

                <div className="home-stats-grid">
                  <div className="stat-card">
                    <p className="stat-label">Applied YTD</p>
                    <p className="stat-value">{data?.tracker_stats.applied_ytd ?? 0}</p>
                    <p className="stat-desc">{(data?.tracker_stats.applied_today ?? 0) > 0 ? `+${data?.tracker_stats.applied_today ?? 0} today` : "No new applications today"}</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">Response Rate</p>
                    <p className="stat-value">{responseRate}%</p>
                    <p className="stat-desc">{respondedOpportunities.length} replies received</p>
                  </div>
                  <div className="stat-card">
                    <p className="stat-label">In Review</p>
                    <p className="stat-value">{activeProcessesCount}</p>
                    <p className="stat-desc">active processes</p>
                  </div>
                </div>

                <div className="home-main-grid">
                  <div className="home-left-stack">
                    <div className="card spotlight-card">
                      <p className="spotlight-kicker">Next call</p>
                      {nextCalendarEvent ? (
                        <>
                          <div className="spotlight-title">
                            {nextCalendarEvent.role} — {nextCalendarEvent.company}
                          </div>
                          <div className="spotlight-meta">
                            {nextCalendarEvent.location || nextCalendarEvent.type} · {formatShortDateTime(nextCalendarEvent.startsAt)}
                          </div>
                          <div className="countdown-grid">
                            <div className="countdown-box">
                              <div className="countdown-value">{String(nextCalendarCountdown.days).padStart(2, "0")}</div>
                              <div className="countdown-label">Days</div>
                            </div>
                            <div className="countdown-box">
                              <div className="countdown-value">{String(nextCalendarCountdown.hours).padStart(2, "0")}</div>
                              <div className="countdown-label">Hrs</div>
                            </div>
                            <div className="countdown-box">
                              <div className="countdown-value">{String(nextCalendarCountdown.minutes).padStart(2, "0")}</div>
                              <div className="countdown-label">Min</div>
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="spotlight-title">No interview or call is scheduled yet</div>
                          <div className="spotlight-meta">
                            Use the Response Hub calendar to log the next recruiter call or interview so it stays visible here.
                          </div>
                          <div className="btn-row" style={{ marginTop: 18 }}>
                            <button className="btn-ghost" onClick={() => setMode("ops-dashboard")}>
                              Open Response Hub {iconArrow}
                            </button>
                          </div>
                        </>
                      )}
                    </div>

                    <div className="card home-emphasis-card">
                      <p className="card-title" style={{ fontSize: 22, marginBottom: 16 }}>Upcoming events</p>
                      <div className="event-list">
                        {homeUpcomingEvents.length > 0 ? (
                          homeUpcomingEvents.map((event) => (
                            <div className="event-row" key={event.id}>
                              <span className={`event-dot ${event.type === "Interview" ? "interview" : "call"}`} />
                              <div>
                                <div className="event-role">
                                  {event.type === "Interview" ? "Interview" : "Phone screen"} — {event.company}
                                </div>
                                <div className="event-detail">
                                  {event.role}
                                  {event.location ? ` · ${event.location}` : ""}
                                </div>
                              </div>
                              <div className="event-time">{formatWeekdayTime(event.startsAt)}</div>
                            </div>
                          ))
                        ) : (
                          <p className="empty-state">No upcoming recruiter calls or interviews yet.</p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="home-right-stack">
                    <div className="home-chart-card">
                      <JobTypePieChart jobs={recentJobs} />
                    </div>
                    <div className="home-chart-card">
                      <WeeklyActivityChart jobs={recentJobs} />
                    </div>
                  </div>
                </div>

                <div className="card home-emphasis-card">
                  <div className="section-header" style={{ marginBottom: 10 }}>
                    <div>
                      <p className="card-title" style={{ fontSize: 22, marginBottom: 0 }}>Recently applied</p>
                    </div>
                    <div className="btn-row">
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
                      <button className="btn-ghost" onClick={() => setMode("ops-dashboard")}>
                        Open Response Hub {iconArrow}
                      </button>
                    </div>
                  </div>
                  {recentAppliedCards.length > 0 ? (
                    <div className="recent-applied-row">
                      {recentAppliedCards.map((job) => {
                        const status = job.application?.status ?? "Applied";
                        const statusClass =
                          status === "Received"
                            ? "received"
                            : status === "In Review" || status === "Interview" || status === "Recruiter Screen" || status === "Final Round"
                              ? "review"
                              : status === "Assessment"
                                ? "interview"
                                : "applied";

                        return (
                          <div className="recent-application-card" key={job.id}>
                            <span className={`status-pill ${statusClass}`}>{status}</span>
                            <div>
                              <strong style={{ display: "block", fontSize: 14, lineHeight: 1.45 }}>{job.company}</strong>
                              <p style={{ fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5, marginTop: 4 }}>
                                {job.title}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="empty-state">No tracked applications yet.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ── OPS DASHBOARD ── */}
          {mode === "ops-dashboard" && (
            <div className="section-fade">
              <div className="section-header">
                <div>
                  <p className="header-eyebrow">Response Hub</p>
                  <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: 34, fontWeight: 500, lineHeight: 1.2 }}>
                    See who replied, what they need, and when you need to show up
                  </h1>
                  <p className="header-sub" style={{ marginTop: 10 }}>
                    Keep recruiter responses visible, track the primary contact channel, and place interviews or calls on a weekly calendar so nothing gets missed.
                  </p>
                </div>
                <button className="btn-ghost" onClick={() => setMode("home")}>
                  {iconBack} Back
                </button>
              </div>

              <div className="ops-kpi-grid">
                <div className="ops-kpi">
                  <p className="card-eyebrow" style={{ marginBottom: 0 }}>Companies Replied</p>
                  <strong>{respondedOpportunities.length}</strong>
                  <span className="ops-item-meta">moved beyond Applied</span>
                </div>
                <div className="ops-kpi">
                  <p className="card-eyebrow" style={{ marginBottom: 0 }}>Offer Awaiting Reply</p>
                  <strong>{offerAwaitingResponseCount}</strong>
                  <span className="ops-item-meta">offers that still need your answer</span>
                </div>
                <div className="ops-kpi">
                  <p className="card-eyebrow" style={{ marginBottom: 0 }}>Scheduled</p>
                  <strong>{scheduledCount}</strong>
                  <span className="ops-item-meta">interview times already confirmed</span>
                </div>
                <div className="ops-kpi">
                  <p className="card-eyebrow" style={{ marginBottom: 0 }}>Still Waiting</p>
                  <strong>{waitingReplyCount}</strong>
                  <span className="ops-item-meta">recruiters yet to reply</span>
                </div>
                <div className="ops-kpi">
                  <p className="card-eyebrow" style={{ marginBottom: 0 }}>In Process</p>
                  <strong>{interviewingCount}</strong>
                  <span className="ops-item-meta">active conversations moving forward</span>
                </div>
              </div>

              {!data ? (
                <div className="card">
                  <p className="empty-state">Loading response hub…</p>
                </div>
              ) : (
                <div className="ops-grid">
                  <div className="card">
                    <p className="card-eyebrow">Quick Log</p>
                    <h2 className="card-title">Company Action</h2>
                    <p className="card-body" style={{ marginBottom: 16 }}>
                      Log the recruiter status here, and if they already gave you a time, add it below so the calendar and scheduled count update together.
                    </p>
                    <form className="ops-form" onSubmit={addResponse}>
                      <input className="field-input" placeholder="Company" value={responseDraft.company} onChange={(event) => setResponseDraft({ ...responseDraft, company: event.target.value })} />
                      <input className="field-input" placeholder="Role" value={responseDraft.role} onChange={(event) => setResponseDraft({ ...responseDraft, role: event.target.value })} />
                      <input className="field-input" placeholder="Recruiter / primary contact" value={responseDraft.recruiterName} onChange={(event) => setResponseDraft({ ...responseDraft, recruiterName: event.target.value })} />
                      <select className="field-input" value={responseDraft.contactChannel} onChange={(event) => setResponseDraft({ ...responseDraft, contactChannel: event.target.value as ContactChannel })}>
                        <option>LinkedIn</option>
                        <option>Gmail</option>
                        <option>Phone</option>
                        <option>Other</option>
                      </select>
                      <input className="field-input" placeholder="Primary contact detail / handle" value={responseDraft.contactHandle} onChange={(event) => setResponseDraft({ ...responseDraft, contactHandle: event.target.value })} />
                      <select className="field-input" value={responseDraft.status} onChange={(event) => handleResponseStatusChange(event.target.value as ResponseStatus)}>
                        {RESPONSE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                      </select>
                      <p className="ops-item-meta" style={{ marginTop: -4 }}>
                        Choose <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>Active Interview Process</strong> when the company has already replied and you are moving through interviews. Choose <strong style={{ color: "var(--text-primary)", fontWeight: 500 }}>Job Offer Awaiting Response</strong> when an offer is on the table and you still need to respond.
                      </p>
                      <input className="field-input" type="date" value={responseDraft.lastUpdated} onChange={(event) => setResponseDraft({ ...responseDraft, lastUpdated: event.target.value })} />
                      {schedulingStatusSelected ? (
                        <>
                          <input className="field-input" type="datetime-local" value={responseDraft.startsAt} onChange={(event) => setResponseDraft({ ...responseDraft, startsAt: event.target.value })} />
                          <input className="field-input" placeholder="Zoom / phone / location" value={responseDraft.location} onChange={(event) => setResponseDraft({ ...responseDraft, location: event.target.value })} />
                        </>
                      ) : null}
                      <textarea className="field-textarea" placeholder="Notes: what they asked for, what you sent, what is scheduled, or where the conversation stands" value={responseDraft.notes} onChange={(event) => setResponseDraft({ ...responseDraft, notes: event.target.value })} />
                      <button className="btn-primary" type="submit">Save Action</button>
                    </form>
                  </div>

                  <div className="card">
                    <p className="card-eyebrow">Calendar View</p>
                    <h2 className="card-title">Upcoming interviews and recruiter calls</h2>
                    <div className="week-grid">
                      {calendarDays.map((day) => (
                        <div className={`week-day ${day.isToday ? "today" : ""}`} key={day.dayKey}>
                          <div className="week-day-label">{day.label}</div>
                          {day.events.length > 0 ? day.events.map((event) => (
                            <div className={`event-pill ${event.type === "Interview" ? "interview" : "followup"}`} key={event.id}>
                              <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                                <strong style={{ display: "block", color: "var(--text-primary)", fontSize: 11, fontWeight: 500 }}>
                                  {event.company} · {event.role}
                                </strong>
                                <button
                                  type="button"
                                  className="mini-select"
                                  style={{ padding: "4px 8px", fontSize: 10 }}
                                  onClick={() => deleteCalendarEvent(event.id)}
                                >
                                  Delete
                                </button>
                              </div>
                              <span>{event.type} · {formatShortDateTime(event.startsAt)}</span>
                              {event.recruiterName ? <span>{event.recruiterName}</span> : null}
                              {event.location ? <span>{event.location}</span> : null}
                            </div>
                          )) : (
                            <span className="ops-item-meta">No events</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="ops-layout">
                    <div className="card">
                      <p className="card-eyebrow">Response Tracker</p>
                      <h2 className="card-title">Job offer awaiting further response</h2>
                      <div className="ops-list ops-list-scroll">
                        {groupedResponses.offerAwaitingResponse.length > 0 ? groupedResponses.offerAwaitingResponse.map((item) => (
                          <div className="ops-item" key={item.id}>
                            <div className="ops-item-row">
                              <div>
                                <div className="ops-item-title">{item.company} · {item.role}</div>
                                <div className="ops-item-meta">{item.recruiterName || "Recruiter not logged"} · {item.contactChannel}{item.contactHandle ? ` · ${item.contactHandle}` : ""}</div>
                              </div>
                              <span className="ops-chip warn">{item.status}</span>
                            </div>
                            {item.notes ? <div className="ops-item-notes">{item.notes}</div> : null}
                            <div className="ops-actions">
                              <span className="ops-item-meta">Updated {formatShortDate(item.lastUpdated)}</span>
                              <select
                                className="mini-select"
                                value={item.status}
                                onChange={(event) => updateResponseStatus(item.id, event.target.value as ResponseStatus)}
                              >
                                {RESPONSE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                              </select>
                              <button
                                type="button"
                                className="mini-select"
                                onClick={() => deleteResponse(item.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )) : <p className="empty-state">No logged offers are waiting on your response right now.</p>}
                      </div>
                    </div>

                    <div className="card">
                      <p className="card-eyebrow">Response Tracker</p>
                      <h2 className="card-title">Interviews and calls already scheduled</h2>
                      <div className="ops-list ops-list-scroll">
                        {groupedResponses.scheduled.length > 0 ? (
                          groupedResponses.scheduled.map((item) => (
                            <div className="ops-item" key={item.id}>
                              <div className="ops-item-row">
                                <div>
                                  <div className="ops-item-title">{item.company} · {item.role}</div>
                                  <div className="ops-item-meta">{item.recruiterName || "Recruiter not logged"} · {item.contactChannel}{item.contactHandle ? ` · ${item.contactHandle}` : ""}</div>
                                </div>
                                <span className="ops-chip sage">{item.status}</span>
                              </div>
                              {item.notes ? <div className="ops-item-notes">{item.notes}</div> : null}
                              <div className="ops-actions">
                                <span className="ops-item-meta">Updated {formatShortDate(item.lastUpdated)}</span>
                                <select
                                  className="mini-select"
                                  value={item.status}
                                  onChange={(event) => updateResponseStatus(item.id, event.target.value as ResponseStatus)}
                                >
                                  {RESPONSE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                                </select>
                                <button
                                  type="button"
                                  className="mini-select"
                                  onClick={() => deleteResponse(item.id)}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ))
                        ) : <p className="empty-state">No interview or recruiter call has been marked as scheduled yet.</p>}
                      </div>
                    </div>
                  </div>

                  <div className="ops-layout">
                    <div className="card">
                      <p className="card-eyebrow">Response Tracker</p>
                      <h2 className="card-title">Active interview process</h2>
                      <div className="ops-list ops-list-scroll">
                        {groupedResponses.interviewing.length > 0 ? groupedResponses.interviewing.map((item) => (
                          <div className="ops-item" key={item.id}>
                            <div className="ops-item-row">
                              <div>
                                <div className="ops-item-title">{item.company} · {item.role}</div>
                                <div className="ops-item-meta">{item.recruiterName || "Recruiter not logged"} · {item.contactChannel}{item.contactHandle ? ` · ${item.contactHandle}` : ""}</div>
                              </div>
                              <span className="ops-chip sage">{item.status}</span>
                            </div>
                            {item.notes ? <div className="ops-item-notes">{item.notes}</div> : null}
                            <div className="ops-actions">
                              <span className="ops-item-meta">Updated {formatShortDate(item.lastUpdated)}</span>
                              <select
                                className="mini-select"
                                value={item.status}
                                onChange={(event) => updateResponseStatus(item.id, event.target.value as ResponseStatus)}
                              >
                                {RESPONSE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                              </select>
                              <button
                                type="button"
                                className="mini-select"
                                onClick={() => deleteResponse(item.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )) : <p className="empty-state">No opportunities are currently in the live interview process.</p>}
                      </div>
                    </div>

                    <div className="card">
                      <p className="card-eyebrow">Response Tracker</p>
                      <h2 className="card-title">Waiting on recruiter reply</h2>
                      <div className="ops-list ops-list-scroll">
                        {groupedResponses.waiting.length > 0 ? groupedResponses.waiting.map((item) => (
                          <div className="ops-item" key={item.id}>
                            <div className="ops-item-row">
                              <div>
                                <div className="ops-item-title">{item.company} · {item.role}</div>
                                <div className="ops-item-meta">{item.recruiterName || "Recruiter not logged"} · {item.contactChannel}{item.contactHandle ? ` · ${item.contactHandle}` : ""}</div>
                              </div>
                              <span className={`ops-chip ${differenceInDays(item.lastUpdated) >= 3 ? "warn" : ""}`}>{item.status}</span>
                            </div>
                            {item.notes ? <div className="ops-item-notes">{item.notes}</div> : null}
                            <div className="ops-actions">
                              <span className="ops-item-meta">Last updated {formatShortDate(item.lastUpdated)}</span>
                              <select
                                className="mini-select"
                                value={item.status}
                                onChange={(event) => updateResponseStatus(item.id, event.target.value as ResponseStatus)}
                              >
                                {RESPONSE_STATUS_OPTIONS.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                              </select>
                              <button
                                type="button"
                                className="mini-select"
                                onClick={() => deleteResponse(item.id)}
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )) : <p className="empty-state">No recruiter conversations are sitting in a wait state.</p>}
                      </div>
                    </div>
                  </div>
                </div>
              )}
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
