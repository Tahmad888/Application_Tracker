from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from difflib import SequenceMatcher
from urllib.parse import quote_plus

from .parser import ARCHETYPES, CandidateProfile, KeywordScore

ENTRY_LEVEL_TOKENS = {
    "junior",
    "entry level",
    "entry-level",
    "associate",
    "coordinator",
    "specialist",
    "technician",
    "support",
    "analyst i",
    "new grad",
}

SENIOR_TOKENS = {
    "senior",
    "sr ",
    "lead",
    "principal",
    "manager",
    "director",
    "head",
    "staff",
}

REMOTE_TOKENS = {
    "remote",
    "work from home",
    "telecommute",
    "distributed",
}

REGIONAL_LOCATION_TOKENS = {
    "mn",
    "minnesota",
    "wi",
    "wisconsin",
    "ia",
    "iowa",
    "nd",
    "north dakota",
    "sd",
    "south dakota",
}

MAX_ENTRY_LEVEL_REQUIRED_YEARS = 2
MAX_POSTING_AGE_DAYS = 14

YEARS_REQUIRED_PATTERNS = [
    re.compile(r"\b(\d{1,2})\s*\+\s*years?\b"),
    re.compile(r"\b(\d{1,2})\s*-\s*(\d{1,2})\s*years?\b"),
    re.compile(r"\b(\d{1,2})\s*to\s*(\d{1,2})\s*years?\b"),
    re.compile(r"\bminimum of\s+(\d{1,2})\s+years?\b"),
    re.compile(r"\bat least\s+(\d{1,2})\s+years?\b"),
    re.compile(r"\brequires?\s+(\d{1,2})\s+years?\b"),
]


@dataclass(frozen=True)
class JobMatch:
    external_id: str
    title: str
    company: str
    location: str
    posted_at: str
    source: str
    source_type: str
    job_url: str
    description: str
    description_snippet: str
    match_score: float
    archetype: str
    archetype_label: str
    fit_label: str
    evaluation_summary: str
    score_breakdown: dict[str, float]
    strengths: list[str]
    concerns: list[str]
    matched_keywords: list[str]
    seeded_at: str

    def to_record(self) -> dict:
        return {
            "external_id": self.external_id,
            "title": self.title,
            "company": self.company,
            "location": self.location,
            "posted_at": self.posted_at,
            "source": self.source,
            "source_type": self.source_type,
            "job_url": self.job_url,
            "description": self.description,
            "description_snippet": self.description_snippet,
            "match_score": self.match_score,
            "archetype": self.archetype,
            "archetype_label": self.archetype_label,
            "fit_label": self.fit_label,
            "evaluation_summary": self.evaluation_summary,
            "score_breakdown": json.dumps(self.score_breakdown),
            "strengths": json.dumps(self.strengths),
            "concerns": json.dumps(self.concerns),
            "matched_keywords": json.dumps(self.matched_keywords),
            "seeded_at": self.seeded_at,
        }


def score_jobs(
    sample_jobs: list[dict],
    keywords: list[KeywordScore],
    profile: CandidateProfile | None = None,
) -> list[JobMatch]:
    weighted_keywords = {
        keyword.keyword.lower(): keyword.score
        for keyword in keywords
    }

    matches: list[JobMatch] = []
    for job in sample_jobs:
        if should_discard_job(job, profile):
            continue

        evaluation = evaluate_job(job=job, weighted_keywords=weighted_keywords, profile=profile)
        if evaluation["total_score"] < 34:
            continue

        matches.append(
            JobMatch(
                external_id=job["external_id"],
                title=job["title"],
                company=job["company"],
                location=job["location"],
                posted_at=job["posted_at"],
                source=job["source"],
                source_type=job["source_type"],
                job_url=resolve_job_url(job),
                description=job["description"],
                description_snippet=job["description_snippet"],
                match_score=evaluation["total_score"],
                archetype=evaluation["archetype"],
                archetype_label=evaluation["archetype_label"],
                fit_label=evaluation["fit_label"],
                evaluation_summary=evaluation["summary"],
                score_breakdown=evaluation["breakdown"],
                strengths=evaluation["strengths"],
                concerns=evaluation["concerns"],
                matched_keywords=evaluation["matched_keywords"],
                seeded_at=job["seeded_at"],
            )
        )

    return sorted(matches, key=lambda match: match.match_score, reverse=True)


def evaluate_job(
    *,
    job: dict,
    weighted_keywords: dict[str, float],
    profile: CandidateProfile | None,
) -> dict:
    haystack = " ".join(
        [
            job["title"],
            job["company"],
            job["location"],
            job["description"],
        ]
    ).lower()
    matched_keywords = [
        keyword
        for keyword in weighted_keywords
        if keyword in haystack
    ][:10]

    job_archetype = infer_job_archetype(job)
    title_fit = score_title_fit(job, profile)
    skill_fit = score_skill_fit(weighted_keywords, matched_keywords, profile)
    archetype_fit = score_archetype_fit(job_archetype, profile)
    seniority_fit = score_seniority_fit(job, profile)
    location_fit = score_location_fit(job)
    freshness_fit = score_freshness(job)

    weighted_total = (
        title_fit * 0.27
        + skill_fit * 0.28
        + archetype_fit * 0.18
        + seniority_fit * 0.12
        + location_fit * 0.10
        + freshness_fit * 0.05
    )
    total_score = round(weighted_total * 20, 1)
    fit_label = describe_fit(total_score)
    strengths, concerns = describe_reasons(
        breakdown={
            "title_fit": title_fit,
            "skill_fit": skill_fit,
            "archetype_fit": archetype_fit,
            "seniority_fit": seniority_fit,
            "location_fit": location_fit,
            "freshness_fit": freshness_fit,
        },
        matched_keywords=matched_keywords,
        job=job,
        profile=profile,
    )

    breakdown = {
        "title_fit": round(title_fit, 1),
        "skill_fit": round(skill_fit, 1),
        "archetype_fit": round(archetype_fit, 1),
        "seniority_fit": round(seniority_fit, 1),
        "location_fit": round(location_fit, 1),
        "freshness_fit": round(freshness_fit, 1),
    }

    archetype_label = ARCHETYPES.get(job_archetype, {}).get("label", "Generalist")
    summary = build_evaluation_summary(
        fit_label=fit_label,
        archetype_label=archetype_label,
        job=job,
        matched_keywords=matched_keywords,
        concerns=concerns,
    )

    return {
        "total_score": total_score,
        "fit_label": fit_label,
        "archetype": job_archetype,
        "archetype_label": archetype_label,
        "matched_keywords": matched_keywords,
        "summary": summary,
        "strengths": strengths,
        "concerns": concerns,
        "breakdown": breakdown,
    }


def infer_job_archetype(job: dict) -> str:
    lowered = f"{job['title']} {job['description']}".lower()
    scores = {}
    for archetype, config in ARCHETYPES.items():
        score = 0
        for title in config["titles"]:
            if title in lowered:
                score += 4
        for tech in config["technologies"]:
            if tech in lowered:
                score += 1
        scores[archetype] = score

    best = max(scores.items(), key=lambda item: item[1], default=("generalist", 0))
    return best[0] if best[1] > 0 else "generalist"


def score_title_fit(job: dict, profile: CandidateProfile | None) -> float:
    if not profile:
        return 2.5

    job_title = job["title"].lower()
    if profile.early_career and any(token in job_title for token in SENIOR_TOKENS):
        return 0.8

    best_similarity = 0.0
    for title in profile.primary_titles:
        similarity = SequenceMatcher(None, title.lower(), job_title).ratio()
        if title.lower() in job_title or job_title in title.lower():
            similarity = max(similarity, 0.95)
        best_similarity = max(best_similarity, similarity)

    if profile.early_career and any(token in job_title for token in ENTRY_LEVEL_TOKENS):
        best_similarity = max(best_similarity, 0.82)

    if best_similarity >= 0.9:
        return 5.0
    if best_similarity >= 0.75:
        return 4.3
    if best_similarity >= 0.58:
        return 3.5
    if profile.archetype == infer_job_archetype(job):
        return 3.8
    return 1.8


def score_skill_fit(
    weighted_keywords: dict[str, float],
    matched_keywords: list[str],
    profile: CandidateProfile | None,
) -> float:
    if not profile:
        return 2.5

    core_skills = profile.top_technologies[:6]
    if not core_skills:
        return 2.2

    matched_core = [skill for skill in core_skills if skill in matched_keywords]
    overlap_ratio = len(matched_core) / max(len(core_skills), 1)
    weighted_overlap = sum(weighted_keywords.get(skill, 0) for skill in matched_core)
    total_signal = sum(weighted_keywords.get(keyword, 0) for keyword in matched_keywords)
    adjacent_signal = sum(
        weighted_keywords.get(keyword, 0)
        for keyword in matched_keywords
        if keyword not in matched_core
    )

    if not matched_keywords:
        return 0.8

    score = (
        0.7
        + overlap_ratio * 2.9
        + min(weighted_overlap / 7.0, 1.1)
        + min(total_signal / 16.0, 0.9)
        + min(adjacent_signal / 18.0, 0.5)
    )
    return max(0.6, min(5.0, round(score, 2)))


def score_archetype_fit(job_archetype: str, profile: CandidateProfile | None) -> float:
    if not profile:
        return 2.5
    if profile.archetype == job_archetype:
        return 5.0
    if {profile.archetype, job_archetype} <= {"data_analytics", "marketing_growth"}:
        return 4.0
    if {profile.archetype, job_archetype} <= {"product_project_ops", "customer_success"}:
        return 3.6
    return 2.0


def score_seniority_fit(job: dict, profile: CandidateProfile | None) -> float:
    if not profile:
        return 3.0

    title = job["title"].lower()
    description = job["description"].lower()
    combined = f"{title} {description}"

    if profile.early_career:
        if any(token in combined for token in SENIOR_TOKENS):
            return 0.5
        if any(token in combined for token in ENTRY_LEVEL_TOKENS):
            return 5.0
        if any(token in combined for token in {"1-3 years", "0-2 years", "0-3 years", "early career"}):
            return 4.8
        return 3.8

    if profile.years_experience is None:
        return 3.0

    years = profile.years_experience
    if any(token in title for token in {"senior", "lead", "principal", "manager", "head"}):
        return 4.5 if years >= 5 else 2.4
    if any(token in title for token in {"junior", "associate", "coordinator"}):
        return 2.8 if years >= 5 else 4.5
    return 4.2 if years >= 2 else 2.8


def score_location_fit(job: dict) -> float:
    location = job["location"].lower()
    if any(token in location for token in REMOTE_TOKENS):
        return 5.0
    if "minneapolis" in location:
        return 5.0
    if "saint paul" in location or "st. paul" in location:
        return 4.6
    if "mn" in location or "minnesota" in location:
        return 4.3
    if any(token in location for token in REGIONAL_LOCATION_TOKENS):
        return 4.0
    return 2.2


def score_freshness(job: dict) -> float:
    posted_at = date.fromisoformat(job["posted_at"])
    age_days = (date.today() - posted_at).days
    if age_days <= 1:
        return 5.0
    if age_days <= 3:
        return 4.2
    if age_days <= 7:
        return 3.2
    if age_days <= MAX_POSTING_AGE_DAYS:
        return 2.2
    return 0.5


def describe_fit(total_score: float) -> str:
    if total_score >= 80:
        return "Strong fit"
    if total_score >= 65:
        return "Promising fit"
    if total_score >= 48:
        return "Stretch fit"
    return "Low fit"


def describe_reasons(
    *,
    breakdown: dict[str, float],
    matched_keywords: list[str],
    job: dict,
    profile: CandidateProfile | None,
) -> tuple[list[str], list[str]]:
    strengths: list[str] = []
    concerns: list[str] = []

    if breakdown["title_fit"] >= 4.0:
        strengths.append("Role title closely matches your recent experience.")
    elif breakdown["title_fit"] <= 2.2:
        concerns.append("Title alignment is weak compared with your recent role history.")

    if matched_keywords:
        strengths.append(f"Shared skills: {', '.join(matched_keywords[:4])}.")
    else:
        concerns.append("Very few resume keywords appear in the listing.")

    if breakdown["archetype_fit"] >= 4.0 and profile:
        strengths.append(f"The job sits in your strongest lane: {profile.archetype_label}.")
    elif breakdown["archetype_fit"] <= 2.2:
        concerns.append("This role pulls away from your strongest career lane.")

    if breakdown["seniority_fit"] <= 2.5:
        concerns.append("Seniority may be a mismatch for the experience shown in your resume.")
    elif breakdown["seniority_fit"] >= 4.2:
        strengths.append("Seniority looks well matched.")
        if profile and profile.early_career:
            strengths.append("This looks realistic for an early-career application.")

    if breakdown["location_fit"] >= 4.0:
        strengths.append("Location is a good fit for your Minneapolis or remote search.")

    if breakdown["freshness_fit"] >= 4.2:
        strengths.append("The posting is still fresh.")
    elif breakdown["freshness_fit"] <= 2.2:
        concerns.append("This posting is getting older than the freshest application window.")

    return strengths[:4], concerns[:3]


def build_evaluation_summary(
    *,
    fit_label: str,
    archetype_label: str,
    job: dict,
    matched_keywords: list[str],
    concerns: list[str],
) -> str:
    if fit_label == "Strong fit":
        return (
            f"{fit_label}: this {archetype_label.lower()} role aligns well with your background, "
            f"especially around {', '.join(matched_keywords[:3]) or 'your core skills'}."
        )
    if fit_label == "Promising fit":
        return (
            f"{fit_label}: the job lines up with several relevant strengths, but it still needs a tailored resume and targeted apply strategy."
        )
    if fit_label == "Stretch fit":
        return (
            f"{fit_label}: there is some overlap, but you'd be applying on narrative and adjacent experience more than direct fit."
        )
    leading_concern = concerns[0] if concerns else "the alignment is limited."
    return f"{fit_label}: {leading_concern}"


def should_discard_job(job: dict, profile: CandidateProfile | None) -> bool:
    if job_age_days(job) > MAX_POSTING_AGE_DAYS:
        return True

    if not profile or not profile.early_career:
        return False

    combined = f"{job['title']} {job['description']}".lower()
    if any(token in combined for token in SENIOR_TOKENS):
        return True

    required_years = extract_required_years(job)
    if required_years is not None and required_years > MAX_ENTRY_LEVEL_REQUIRED_YEARS:
        return True

    return False


def job_age_days(job: dict) -> int:
    posted_at = date.fromisoformat(job["posted_at"])
    return (date.today() - posted_at).days


def extract_required_years(job: dict) -> int | None:
    combined = f"{job['title']} {job['description']}".lower()
    candidates: list[int] = []

    for pattern in YEARS_REQUIRED_PATTERNS:
        for match in pattern.finditer(combined):
            values = [int(value) for value in match.groups() if value is not None]
            if values:
                candidates.append(min(values))

    if not candidates:
        return None
    return min(candidates)


def resolve_job_url(job: dict) -> str:
    url = job.get("job_url", "").strip()
    if url and "example.com" not in url:
        return url

    title = job.get("title", "")
    company = job.get("company", "")
    location = job.get("location", "")
    source = job.get("source", "").lower()

    title_query = quote_plus(title)
    location_query = quote_plus(location)
    full_query = quote_plus(f"{title} {company} {location}")

    if source == "linkedin":
        return f"https://www.linkedin.com/jobs/search/?keywords={title_query}&location={location_query}"
    if source == "indeed":
        return f"https://www.indeed.com/jobs?q={title_query}&l={location_query}"
    if source == "glassdoor":
        return f"https://www.glassdoor.com/Job/jobs.htm?sc.keyword={title_query}&locT=C&locId=1142551"
    if source == "company careers":
        return f"https://www.google.com/search?q={full_query}+careers"
    if source == "handshake":
        return f"https://app.joinhandshake.com/stu/postings?search={title_query}"
    return f"https://www.google.com/search?q={full_query}+jobs"
