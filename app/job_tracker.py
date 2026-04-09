from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date
from hashlib import sha1
from html import unescape
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen

from .parser import TECH_KEYWORDS, extract_keywords, infer_candidate_profile


class JobTrackerError(RuntimeError):
    pass


META_TAG_PATTERN = re.compile(
    r"<meta[^>]+(?:property|name)=['\"](?P<name>[^'\"]+)['\"][^>]+content=['\"](?P<content>.*?)['\"]",
    re.IGNORECASE | re.DOTALL,
)
TITLE_PATTERN = re.compile(r"<title>(.*?)</title>", re.IGNORECASE | re.DOTALL)
H1_PATTERN = re.compile(r"<h1[^>]*>(.*?)</h1>", re.IGNORECASE | re.DOTALL)
HEADING_PATTERN = re.compile(r"<h[1-3][^>]*>(.*?)</h[1-3]>", re.IGNORECASE | re.DOTALL)
JSON_LD_PATTERN = re.compile(
    r"<script[^>]+type=['\"]application/ld\+json['\"][^>]*>(.*?)</script>",
    re.IGNORECASE | re.DOTALL,
)
QUOTED_STRING_PATTERN = re.compile(r'["\']([^"\']{4,140})["\']')
STRUCTURED_TITLE_PATTERN = re.compile(
    r'(?:"jobTitle"|"postingTitle"|"positionTitle"|"title"|"name")\s*:\s*"([^"]{3,160})"',
    re.IGNORECASE,
)
TAG_PATTERN = re.compile(r"<[^>]+>")
WHITESPACE_PATTERN = re.compile(r"\s+")
ALPHANUMERIC_TOKEN_PATTERN = re.compile(r"[a-z0-9]+")
GENERIC_TITLE_TOKENS = {
    "career",
    "careers",
    "jobs",
    "job",
    "openings",
    "opening",
    "opportunities",
    "search results",
    "apply",
    "application",
    "home",
    "overview",
}
ROLE_HINT_TOKENS = {
    "analyst",
    "engineer",
    "technician",
    "specialist",
    "manager",
    "developer",
    "consultant",
    "coordinator",
    "intern",
    "administrator",
    "architect",
    "associate",
    "representative",
    "operator",
    "designer",
    "director",
    "officer",
    "lead",
    "business",
    "systems",
    "service",
    "field",
    "network",
    "operations",
    "support",
}
UPPERCASE_ROLE_TOKENS = {"it", "qa", "ui", "ux", "hr", "bi", "ai", "ml"}
JUNK_TITLE_PATTERNS = (
    "{",
    "}",
    "[",
    "]",
    "<",
    ">",
    "function(",
    "=>",
)
LOW_SIGNAL_PHRASES = {
    "sign in",
    "log in",
    "login",
    "apply now",
    "continue",
    "click here",
    "learn more",
    " in enterprise ",
    " in the field ",
}
RESUME_SECTION_HINTS = {
    "summary": {"summary", "profile", "about"},
    "experience": {"experience", "employment", "work history"},
    "projects": {"projects", "academic projects", "capstone", "portfolio"},
    "skills": {"skills", "technical skills", "core competencies"},
    "education": {"education", "certifications"},
}
PROJECT_SIGNAL_WORDS = {"project", "capstone", "built", "created", "developed", "designed", "implemented", "automated"}
DEMAND_LIBRARY = [
    {
        "label": "Technical support and troubleshooting",
        "kind": "experience",
        "keywords": {"technical support", "support", "troubleshooting", "diagnose", "resolve issues"},
        "project_template": "Add a short project or lab bullet showing how you diagnosed and resolved a technical issue end to end.",
    },
    {
        "label": "Ticketing or incident management",
        "kind": "skill",
        "keywords": {"ticketing", "incident", "service desk", "help desk", "ticket resolution"},
        "project_template": "Show any workflow where you tracked issues, prioritized requests, or documented resolutions in a structured queue.",
    },
    {
        "label": "Networking and field service work",
        "kind": "experience",
        "keywords": {"network", "telecom", "fiber", "router", "switch", "field service", "installation"},
        "project_template": "Add a project, lab, or technician bullet that shows hands-on setup, installation, or network troubleshooting.",
    },
    {
        "label": "SQL and data analysis",
        "kind": "skill",
        "keywords": {"sql", "query", "reporting", "analysis", "dashboard"},
        "project_template": "Keep one project bullet that shows SQL, reporting, or analysis output with a concrete result.",
    },
    {
        "label": "Documentation and process clarity",
        "kind": "experience",
        "keywords": {"documentation", "document", "process", "knowledge base", "standard operating procedure"},
        "project_template": "Add one bullet proving you documented a process, issue resolution, or repeatable workflow for others.",
    },
    {
        "label": "Customer or stakeholder communication",
        "kind": "experience",
        "keywords": {"customer", "client", "stakeholder", "communication", "cross-functional"},
        "project_template": "Include a bullet that shows you explained technical work clearly to users, teammates, or customers.",
    },
    {
        "label": "Jira or issue tracking tools",
        "kind": "skill",
        "keywords": {"jira", "ticketing", "bug", "issue tracking"},
        "project_template": "If you used Jira or another tracker in class, work, or projects, name it directly instead of implying it.",
    },
    {
        "label": "Automation or scripting",
        "kind": "project",
        "keywords": {"python", "script", "automation", "tooling", "powershell"},
        "project_template": "Add a project bullet for a script or automation you built, even if it was small or academic.",
    },
]


@dataclass(frozen=True)
class JobDemand:
    label: str
    kind: str
    matched_keywords: list[str]
    project_template: str


@dataclass(frozen=True)
class ResumeEvidence:
    matched_strengths: list[str]
    missing_requirements: list[str]
    project_suggestions: list[str]
    experience_suggestions: list[str]


@dataclass(frozen=True)
class TrackedJobDraft:
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
    seeded_at: str

    def to_record(self) -> dict[str, Any]:
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
            "seeded_at": self.seeded_at,
        }


def fetch_job_posting(job_url: str) -> TrackedJobDraft:
    normalized = normalize_url(job_url)
    html = download_html(normalized)
    draft = parse_job_posting_html(normalized, html)

    if should_attempt_rendered_fallback(draft, html):
        rendered_html = download_rendered_html(normalized)
        if rendered_html:
            rendered_draft = parse_job_posting_html(normalized, rendered_html)
            if score_title_candidate(rendered_draft.title) > score_title_candidate(draft.title):
                return rendered_draft

    return draft


def normalize_url(job_url: str) -> str:
    cleaned = job_url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise JobTrackerError("Paste a full job link starting with http:// or https://.")
    return cleaned


def download_html(job_url: str) -> str:
    request = Request(
        job_url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
            )
        },
    )
    try:
        with urlopen(request, timeout=10) as response:
            charset = response.headers.get_content_charset() or "utf-8"
            return response.read().decode(charset, errors="ignore")
    except Exception as exc:
        raise JobTrackerError(
            "The job link could not be read right now. Try the direct posting URL instead of a redirect."
        ) from exc


def download_rendered_html(job_url: str) -> str:
    try:
        from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
        from playwright.sync_api import sync_playwright
    except ImportError:
        return ""

    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(headless=True)
            page = browser.new_page()
            try:
                page.goto(job_url, wait_until="domcontentloaded", timeout=15000)
                page.wait_for_timeout(1500)
                html = page.content()
            except PlaywrightTimeoutError:
                html = page.content()
            finally:
                browser.close()
        return html
    except Exception:
        return ""


def parse_job_posting_html(job_url: str, html: str) -> TrackedJobDraft:
    meta = extract_meta_tags(html)
    jsonld = extract_jsonld_objects(html)
    domain = urlparse(job_url).netloc.lower()
    url_title = infer_title_from_url(job_url)
    title_tag = extract_title_tag(html)
    h1_title = extract_h1(html)
    heading_titles = extract_heading_candidates(html)
    structured_titles = extract_structured_title_candidates(html)
    quoted_titles = extract_quoted_string_candidates(html)

    raw_title = (
        find_jsonld_value(jsonld, ["title"])
        or meta.get("og:title")
        or meta.get("twitter:title")
        or next((candidate for candidate in structured_titles if candidate), "")
        or next((candidate for candidate in quoted_titles if candidate), "")
        or next((candidate for candidate in heading_titles if candidate), "")
        or title_tag
        or h1_title
        or url_title
    )
    title = choose_best_title(
        candidates=[
            find_jsonld_value(jsonld, ["title"]),
            meta.get("og:title", ""),
            meta.get("twitter:title", ""),
            *structured_titles,
            *quoted_titles,
            *heading_titles,
            h1_title,
            title_tag,
            url_title,
        ]
    ) or raw_title

    company = (
        find_jsonld_value(jsonld, ["hiringOrganization", "name"])
        or meta.get("og:site_name")
        or infer_company_from_title_candidates(
            [
                meta.get("og:title", ""),
                meta.get("twitter:title", ""),
                title_tag,
                h1_title,
            ]
        )
        or infer_company_from_domain(domain)
    )
    location = (
        find_location_from_jsonld(jsonld)
        or meta.get("job:location")
        or meta.get("og:locality")
        or "Location not listed"
    )
    description = (
        find_jsonld_value(jsonld, ["description"])
        or meta.get("description")
        or extract_body_text(html)
    )
    posted_at = (
        normalize_date(find_jsonld_value(jsonld, ["datePosted"]))
        or normalize_date(find_jsonld_value(jsonld, ["datePublished"]))
        or date.today().isoformat()
    )

    clean_title = clean_text(title) or "Untitled Job"
    clean_company = clean_text(company) or "Unknown Company"
    clean_location = clean_text(location) or "Location not listed"
    clean_description = clean_text(description) or f"Tracked from {job_url}"
    description_snippet = clean_description[:220].rstrip() + ("..." if len(clean_description) > 220 else "")

    return TrackedJobDraft(
        external_id=f"tracked-{sha1(job_url.encode('utf-8')).hexdigest()[:16]}",
        title=clean_title,
        company=clean_company,
        location=clean_location,
        posted_at=posted_at,
        source=infer_source_name(domain),
        source_type="manual tracker",
        job_url=job_url,
        description=clean_description,
        description_snippet=description_snippet,
        seeded_at=f"{date.today().isoformat()}T08:00:00Z",
    )


def build_tailored_resume(job: TrackedJobDraft, resume_text: str) -> dict[str, Any]:
    keywords, queries = extract_keywords(resume_text)
    profile = infer_candidate_profile(resume_text, keywords, queries)
    lowered_description = f"{job.title} {job.description}".lower()
    demands = extract_job_demands(job)
    evidence = analyze_resume_against_job(resume_text, demands)

    prioritized_skills = [
        skill
        for skill in profile.top_technologies
        if skill in lowered_description
    ]
    matched_skill_labels = [
        demand.label
        for demand in demands
        if demand.kind == "skill" and demand.label in evidence.matched_strengths
    ]
    adjacent_skills = [
        skill
        for skill in sorted(TECH_KEYWORDS)
        if skill in lowered_description and skill not in prioritized_skills
    ][:4]
    all_skills = dedupe_preserve_order(prioritized_skills + matched_skill_labels + adjacent_skills)[:7]

    matched_ratio = len(evidence.matched_strengths) / max(len(demands), 1)
    if matched_ratio >= 0.7:
        fit_phrase = "already lines up well"
    elif matched_ratio >= 0.45:
        fit_phrase = "has a workable fit with a few meaningful gaps"
    else:
        fit_phrase = "needs stronger proof points before it will feel tightly matched"

    biggest_gap = evidence.missing_requirements[0] if evidence.missing_requirements else "no major gap stood out"

    summary = (
        f"For {job.title} at {job.company}, your resume {fit_phrase}. "
        f"Strongest alignment shows up around {', '.join(evidence.matched_strengths[:3]) or 'your closest technical evidence'}, "
        f"while the biggest gap is {biggest_gap.lower()}."
    )

    alignment_notes = build_alignment_notes(job, evidence, all_skills)
    experience_suggestions = evidence.experience_suggestions[:4]
    project_suggestions = evidence.project_suggestions[:4]
    missing_requirements = evidence.missing_requirements[:5]
    matched_strengths = evidence.matched_strengths[:5]

    tailored_text = "\n".join(
        [
            "TARGET ROLE",
            f"{job.title} at {job.company}",
            "",
            "FIT SNAPSHOT",
            summary,
            "",
            "TAILORED SUMMARY",
            build_resume_summary(job, profile, matched_strengths, missing_requirements),
            "",
            "PRIORITIZED SKILLS",
            ", ".join(all_skills) if all_skills else "technical support, troubleshooting, analysis",
            "",
            "MATCHED STRENGTHS TO EMPHASIZE",
            *([f"- {item}" for item in matched_strengths] or ["- Reorder your strongest evidence for this role to the top of the resume."]),
            "",
            "GAPS TO COVER",
            *([f"- {item}" for item in missing_requirements] or ["- No major requirement gaps were detected from the visible posting text."]),
            "",
            "EXPERIENCE SUGGESTIONS",
            *([f"- {item}" for item in experience_suggestions] or ["- Tighten existing bullets so they sound closer to the job's wording."]),
            "",
            "PROJECT SUGGESTIONS",
            *([f"- {item}" for item in project_suggestions] or ["- Add one relevant project or lab if the posting asks for tools you have not proven yet."]),
            "",
            "CUSTOMIZATION NOTES",
            *[f"- {note}" for note in alignment_notes],
        ]
    )

    return {
        "profile_summary": profile.summary,
        "target_summary": summary,
        "prioritized_skills": all_skills,
        "alignment_notes": alignment_notes,
        "matched_strengths": matched_strengths,
        "missing_requirements": missing_requirements,
        "project_suggestions": project_suggestions,
        "experience_suggestions": experience_suggestions,
        "tailored_text": tailored_text,
    }


def extract_meta_tags(html: str) -> dict[str, str]:
    tags: dict[str, str] = {}
    for match in META_TAG_PATTERN.finditer(html):
        name = match.group("name").strip().lower()
        content = clean_text(match.group("content"))
        if name and content:
            tags[name] = content
    return tags


def extract_title_tag(html: str) -> str:
    match = TITLE_PATTERN.search(html)
    return clean_text(match.group(1)) if match else ""


def extract_h1(html: str) -> str:
    match = H1_PATTERN.search(html)
    return clean_text(match.group(1)) if match else ""


def extract_heading_candidates(html: str) -> list[str]:
    return [clean_text(match.group(1)) for match in HEADING_PATTERN.finditer(html)]


def extract_structured_title_candidates(html: str) -> list[str]:
    return [clean_text(match.group(1)) for match in STRUCTURED_TITLE_PATTERN.finditer(html)]


def extract_quoted_string_candidates(html: str) -> list[str]:
    candidates: list[str] = []
    for match in QUOTED_STRING_PATTERN.finditer(html):
        cleaned = clean_text(match.group(1))
        if cleaned:
            candidates.append(cleaned)
    return dedupe_preserve_order(candidates[:250])


def extract_body_text(html: str) -> str:
    body = re.sub(r"<script.*?</script>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    body = re.sub(r"<style.*?</style>", " ", body, flags=re.IGNORECASE | re.DOTALL)
    text = TAG_PATTERN.sub(" ", body)
    return clean_text(text)[:4000]


def extract_jsonld_objects(html: str) -> list[Any]:
    objects: list[Any] = []
    for match in JSON_LD_PATTERN.finditer(html):
        try:
            parsed = json.loads(unescape(match.group(1).strip()))
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, list):
            objects.extend(parsed)
        else:
            objects.append(parsed)
    return objects


def find_jsonld_value(objects: list[Any], path: list[str]) -> str:
    for obj in objects:
        value = descend_path(obj, path)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def find_location_from_jsonld(objects: list[Any]) -> str:
    for obj in objects:
        if not isinstance(obj, dict):
            continue
        location = obj.get("jobLocation")
        if isinstance(location, list):
            location = location[0] if location else {}
        address = {}
        if isinstance(location, dict):
            address = location.get("address", {}) if isinstance(location.get("address"), dict) else location

        parts = [
            str(address.get("addressLocality", "")).strip(),
            str(address.get("addressRegion", "")).strip(),
        ]
        joined = ", ".join(part for part in parts if part)
        if joined:
            return joined
    return ""


def descend_path(obj: Any, path: list[str]) -> Any:
    current = obj
    for segment in path:
        if not isinstance(current, dict):
            return None
        current = current.get(segment)
    return current


def infer_source_name(domain: str) -> str:
    if "actalentservices.com" in domain:
        return "Actalent"
    if "icims.com" in domain:
        return "iCIMS"
    if "linkedin" in domain:
        return "LinkedIn"
    if "indeed" in domain:
        return "Indeed"
    if "glassdoor" in domain:
        return "Glassdoor"
    if "handshake" in domain:
        return "Handshake"
    return infer_company_from_domain(domain)


def infer_company_from_domain(domain: str) -> str:
    if "actalentservices.com" in domain:
        return "Actalent"
    host = domain.split(":")[0]
    labels = [label for label in host.split(".") if label and label not in {"www", "jobs", "careers"}]
    if not labels:
        return "Unknown Company"
    return labels[0].replace("-", " ").title()


def infer_title_from_url(job_url: str) -> str:
    segments = [segment for segment in urlparse(job_url).path.split("/") if segment]
    candidate = ""
    if len(segments) >= 4 and segments[0] == "jobs":
        candidate = segments[2]
    elif segments:
        candidate = segments[-1]
        if candidate.lower() == "job" and len(segments) >= 2:
            candidate = segments[-2]

    candidate = candidate.replace("-", " ").replace("_", " ")
    cleaned = clean_text(candidate)
    if len(cleaned) <= 2 or cleaned.lower() in GENERIC_TITLE_TOKENS:
        return ""
    return normalize_role_case(cleaned)


def clean_text(value: str) -> str:
    stripped = TAG_PATTERN.sub(" ", unescape(value or ""))
    return WHITESPACE_PATTERN.sub(" ", stripped).strip()


def normalize_date(value: str) -> str:
    if not value:
        return ""
    return value[:10]


def should_attempt_rendered_fallback(draft: TrackedJobDraft, html: str) -> bool:
    title_score = score_title_candidate(draft.title)
    lowered_html = html.lower()
    shell_signals = (
        "application/json",
        "__next",
        "window.__",
        "hydration",
        "react-root",
        "id=\"root\"",
        "data-reactroot",
    )

    if title_score < 6:
        return True
    if draft.title.lower() in {draft.company.lower(), draft.source.lower()}:
        return True
    if len(draft.description.strip()) < 120 and any(signal in lowered_html for signal in shell_signals):
        return True
    return False


def extract_job_demands(job: TrackedJobDraft) -> list[JobDemand]:
    lowered = f"{job.title} {job.description}".lower()
    demands: list[JobDemand] = []
    for item in DEMAND_LIBRARY:
        matched = [
            keyword
            for keyword in item["keywords"]
            if keyword in lowered
        ]
        if matched:
            demands.append(
                JobDemand(
                    label=item["label"],
                    kind=item["kind"],
                    matched_keywords=matched,
                    project_template=item["project_template"],
                )
            )

    if not demands:
        demands.append(
            JobDemand(
                label="Role-specific experience",
                kind="experience",
                matched_keywords=[],
                project_template="Add a project or bullet that proves the closest work you have done to this role.",
            )
        )
    return demands


def analyze_resume_against_job(resume_text: str, demands: list[JobDemand]) -> ResumeEvidence:
    sections = split_resume_sections(resume_text)
    searchable_lines = [line for lines in sections.values() for line in lines]

    matched_strengths: list[str] = []
    missing_requirements: list[str] = []
    project_suggestions: list[str] = []
    experience_suggestions: list[str] = []

    for demand in demands:
        evidence_lines = find_resume_evidence_lines(searchable_lines, demand.matched_keywords or demand.label.split())
        if evidence_lines:
            matched_strengths.append(build_strength_label(demand, evidence_lines[0]))
            experience_suggestions.append(build_experience_suggestion(demand, evidence_lines[0]))
        else:
            missing_requirements.append(demand.label)
            project_suggestions.append(demand.project_template)
            experience_suggestions.append(build_gap_experience_suggestion(demand))

    return ResumeEvidence(
        matched_strengths=dedupe_preserve_order(matched_strengths),
        missing_requirements=dedupe_preserve_order(missing_requirements),
        project_suggestions=dedupe_preserve_order(project_suggestions),
        experience_suggestions=dedupe_preserve_order(experience_suggestions),
    )


def split_resume_sections(resume_text: str) -> dict[str, list[str]]:
    sections = {name: [] for name in RESUME_SECTION_HINTS}
    sections["other"] = []
    current = "other"
    for raw_line in resume_text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lowered = line.lower().rstrip(":")
        next_section = next(
            (
                name
                for name, hints in RESUME_SECTION_HINTS.items()
                if lowered in hints
            ),
            None,
        )
        if next_section:
            current = next_section
            continue
        sections.setdefault(current, []).append(line)
    return sections


def find_resume_evidence_lines(lines: list[str], demand_terms: list[str]) -> list[str]:
    lowered_terms = [term.lower() for term in demand_terms if term]
    matches: list[str] = []
    for line in lines:
        lowered = line.lower()
        if any(term in lowered for term in lowered_terms):
            matches.append(clean_text(line))
    return matches[:3]


def build_strength_label(demand: JobDemand, evidence_line: str) -> str:
    snippet = truncate_text(evidence_line, 88)
    return f"{demand.label}: {snippet}"


def build_experience_suggestion(demand: JobDemand, evidence_line: str) -> str:
    snippet = truncate_text(evidence_line, 82)
    return f"Rewrite or elevate this proof point for {demand.label.lower()}: {snippet}"


def build_gap_experience_suggestion(demand: JobDemand) -> str:
    return f"Add a bullet or project result that directly proves {demand.label.lower()}."


def build_alignment_notes(job: TrackedJobDraft, evidence: ResumeEvidence, prioritized_skills: list[str]) -> list[str]:
    notes = [
        f"Lead with the bullets most relevant to {job.title}, not just the most recent job.",
        f"Mirror the posting language around {', '.join(prioritized_skills[:4]) or 'the core requirements'}.",
    ]
    if evidence.missing_requirements:
        notes.append(
            f"Close the top gap first: {evidence.missing_requirements[0]}. If you have related evidence, name it more directly."
        )
    if evidence.project_suggestions:
        notes.append("If work experience is thin, use a project, lab, internship, or class deliverable to prove the missing requirement.")
    notes.append("Keep bullets outcome-based with tools, task, and result in the same line.")
    return notes[:5]


def build_resume_summary(
    job: TrackedJobDraft,
    profile,
    matched_strengths: list[str],
    missing_requirements: list[str],
) -> str:
    strongest = matched_strengths[0] if matched_strengths else profile.summary
    if missing_requirements:
        return (
            f"Early-career candidate targeting {job.title} at {job.company}. Strongest current evidence: {strongest}. "
            f"Resume should be revised to better prove {missing_requirements[0].lower()} and similar job-specific requirements."
        )
    return (
        f"Early-career candidate targeting {job.title} at {job.company}. Strongest current evidence: {strongest}. "
        "Resume mainly needs sharper ordering and more direct wording, not major repositioning."
    )


def dedupe_preserve_order(items: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for item in items:
        normalized = item.strip()
        if not normalized:
            continue
        key = normalized.lower()
        if key in seen:
            continue
        seen.add(key)
        result.append(normalized)
    return result


def truncate_text(value: str, limit: int) -> str:
    if len(value) <= limit:
        return value
    return value[: limit - 3].rstrip() + "..."


def choose_best_title(candidates: list[str]) -> str:
    best_candidate = ""
    best_score = 0

    for candidate in candidates:
        cleaned = clean_text(candidate)
        score = score_title_candidate(cleaned)
        if score > best_score:
            best_candidate = cleaned
            best_score = score

    if best_score < 4:
        return ""
    return normalize_role_case(best_candidate)


def is_specific_job_title(value: str) -> bool:
    return score_title_candidate(value) >= 4


def score_title_candidate(value: str) -> int:
    lowered = value.lower().strip()
    if not lowered:
        return -10
    if len(lowered) <= 2:
        return -10
    if lowered in GENERIC_TITLE_TOKENS:
        return -10
    if any(pattern in lowered for pattern in JUNK_TITLE_PATTERNS):
        return -8
    if any(phrase in lowered for phrase in LOW_SIGNAL_PHRASES):
        return -6

    tokens = [token for token in ALPHANUMERIC_TOKEN_PATTERN.findall(lowered) if token]
    if not tokens:
        return -10

    role_hits = sum(1 for token in tokens if token in ROLE_HINT_TOKENS)
    generic_hits = sum(1 for token in tokens if token in GENERIC_TITLE_TOKENS)

    score = 0
    if 2 <= len(tokens) <= 8:
        score += 3
    elif len(tokens) <= 12:
        score += 1
    else:
        score -= 3

    if role_hits:
        score += 4 + min(role_hits - 1, 2)
    if generic_hits:
        score -= 4 if role_hits == 0 else 1
    if len(tokens) == 1 and tokens[0] not in ROLE_HINT_TOKENS:
        score -= 6
    if lowered.endswith("."):
        score -= 2
    if "|" in lowered or " - " in lowered or " — " in lowered:
        score -= 2
    if any(token in UPPERCASE_ROLE_TOKENS for token in tokens):
        score += 1

    return score


def infer_company_from_title_candidates(candidates: list[str]) -> str:
    for candidate in candidates:
        cleaned = clean_text(candidate)
        if not cleaned:
            continue
        for separator in ("|", "-", "—"):
            if separator not in cleaned:
                continue
            left, _, right = cleaned.partition(separator)
            left_clean = left.strip()
            right_clean = right.strip()
            if left_clean.lower() in GENERIC_TITLE_TOKENS and right_clean:
                return right_clean
        tokens = cleaned.split()
        if len(tokens) >= 2:
            leading = " ".join(tokens[:-1]).strip()
            trailing = tokens[-1].strip().lower()
            if trailing in GENERIC_TITLE_TOKENS and leading:
                return leading
    return ""


def normalize_role_case(value: str) -> str:
    tokens = value.split()
    normalized: list[str] = []
    for token in tokens:
        if token.lower() in UPPERCASE_ROLE_TOKENS:
            normalized.append(token.upper())
        elif token.isupper() and len(token) <= 5:
            normalized.append(token)
        else:
            normalized.append(token.capitalize())
    return " ".join(normalized)
