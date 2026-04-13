from __future__ import annotations

import re
from dataclasses import dataclass
from email.utils import parseaddr

STATUS_ORDER = [
    "Applied",
    "Received",
    "In Review",
    "Recruiter Screen",
    "Assessment",
    "Interview",
    "Final Round",
    "Offer",
    "Rejected",
]
STATUS_RANK = {status: index for index, status in enumerate(STATUS_ORDER)}
TERMINAL_STATUSES = {"Offer", "Rejected"}
COMPANY_STOPWORDS = {
    "inc",
    "llc",
    "corp",
    "corporation",
    "company",
    "careers",
    "jobs",
    "team",
    "talent",
    "recruiting",
    "recruiter",
}
TITLE_STOPWORDS = {
    "the",
    "and",
    "with",
    "for",
    "role",
    "position",
    "job",
    "opening",
    "application",
}
TOKEN_PATTERN = re.compile(r"[a-z0-9]+")

STATUS_RULES: list[tuple[str, list[str]]] = [
    (
        "Rejected",
        [
            "moving forward with other candidates",
            "not selected",
            "unfortunately",
            "we regret to inform",
            "regret to inform",
            "no longer under consideration",
            "rejection",
        ],
    ),
    (
        "Offer",
        [
            "offer letter",
            "verbal offer",
            "we are excited to offer",
            "compensation package",
            "congratulations",
            "job offer",
        ],
    ),
    (
        "Final Round",
        [
            "final round",
            "final interview",
            "onsite interview",
            "panel interview",
            "meet the team",
        ],
    ),
    (
        "Interview",
        [
            "interview",
            "schedule a call",
            "schedule a time",
            "availability",
            "calendar link",
            "speaking with",
        ],
    ),
    (
        "Assessment",
        [
            "assessment",
            "coding challenge",
            "take-home",
            "take home",
            "hackerrank",
            "codility",
            "skills test",
        ],
    ),
    (
        "Recruiter Screen",
        [
            "phone screen",
            "recruiter screen",
            "introductory call",
            "initial call",
            "recruiter would like to connect",
            "talent acquisition",
        ],
    ),
    (
        "In Review",
        [
            "under review",
            "in review",
            "reviewing your application",
            "reviewing your resume",
            "our team will review",
            "our team is reviewing",
            "we are reviewing your application",
            "we are reviewing your resume",
            "we will review your application",
            "we will review your resume",
            "review it at this time",
            "reviewing it at this time",
        ],
    ),
    (
        "Received",
        [
            "application received",
            "received your application",
            "thank you for applying",
            "thanks for applying",
            "application has been submitted",
            "we have received your application",
        ],
    ),
]


@dataclass(frozen=True)
class GmailMatchResult:
    job_id: int
    new_status: str
    confidence: int
    matched_from: str
    email_id: str
    email_subject: str
    email_snippet: str
    sender: str


def normalize_text(value: str) -> str:
    return " ".join(TOKEN_PATTERN.findall((value or "").lower()))


def token_set(value: str, *, stopwords: set[str] | None = None) -> set[str]:
    words = {
        token
        for token in TOKEN_PATTERN.findall((value or "").lower())
        if len(token) > 2
    }
    if stopwords:
        words = {word for word in words if word not in stopwords}
    return words


def classify_email_status(message: dict[str, str]) -> str | None:
    text = normalize_text(f"{message.get('subject', '')} {message.get('snippet', '')}")
    for status, phrases in STATUS_RULES:
        if any(normalize_text(phrase) in text for phrase in phrases):
            return status
    return None


def should_advance_status(current_status: str, new_status: str) -> bool:
    current = current_status or "Applied"
    if new_status not in STATUS_RANK:
        return False
    if current == new_status:
        return False
    if current in TERMINAL_STATUSES:
        return False
    return STATUS_RANK[new_status] > STATUS_RANK.get(current, 0)


def match_email_to_job(
    message: dict[str, str],
    jobs: list[dict[str, object]],
) -> GmailMatchResult | None:
    new_status = classify_email_status(message)
    if not new_status:
        return None

    sender_name, sender_email = parseaddr(message.get("from", ""))
    sender_domain = sender_email.split("@")[-1] if "@" in sender_email else ""
    sender_display = normalize_text(sender_name)
    sender_domain_text = normalize_text(sender_domain.replace(".", " "))
    subject_text = normalize_text(message.get("subject", ""))
    snippet_text = normalize_text(message.get("snippet", ""))
    content_text = f"{subject_text} {snippet_text}".strip()
    content_tokens = set(content_text.split())

    scored: list[tuple[int, int, int, dict[str, object]]] = []
    company_scores: dict[int, int] = {}
    for job in jobs:
        company_score = score_company_match(
            str(job.get("company", "")),
            sender_display,
            sender_domain_text,
            content_text,
            content_tokens,
        )
        company_scores[int(job["id"])] = company_score

    strong_company_matches = sum(1 for score in company_scores.values() if score >= 3)
    strong_title_matches = 0
    title_scores: dict[int, int] = {}
    for job in jobs:
        title_score = score_title_match(str(job.get("title", "")), content_text)
        title_scores[int(job["id"])] = title_score
        if title_score >= 4:
            strong_title_matches += 1

    for job in jobs:
        company_score = company_scores[int(job["id"])]
        title_score = title_scores[int(job["id"])]
        if company_score < 3 and title_score < 4:
            continue
        if title_score < 1 and strong_company_matches > 1:
            continue
        if company_score < 3 and title_score >= 4 and strong_title_matches > 1:
            continue
        total = company_score + title_score
        scored.append((total, company_score, title_score, job))

    if not scored:
        return None

    scored.sort(key=lambda item: (item[0], item[1], item[2]), reverse=True)
    best_total, best_company, best_title, best_job = scored[0]
    if best_total < 5 and not (
        (best_company >= 4 and len(scored) == 1)
        or (best_title >= 4 and strong_title_matches == 1)
    ):
        return None
    if len(scored) > 1 and best_total - scored[1][0] < 2 and best_title < 2:
        return None

    matched_from = "sender + title" if best_title >= 2 else "sender"
    return GmailMatchResult(
        job_id=int(best_job["id"]),
        new_status=new_status,
        confidence=best_total,
        matched_from=matched_from,
        email_id=message.get("id", ""),
        email_subject=message.get("subject", ""),
        email_snippet=message.get("snippet", ""),
        sender=message.get("from", ""),
    )


def score_company_match(
    company: str,
    sender_display: str,
    sender_domain_text: str,
    content_text: str,
    content_tokens: set[str],
) -> int:
    company_text = normalize_text(company)
    company_tokens = token_set(company, stopwords=COMPANY_STOPWORDS)
    sender_tokens = token_set(sender_display, stopwords=COMPANY_STOPWORDS)
    domain_tokens = token_set(sender_domain_text, stopwords=COMPANY_STOPWORDS)

    score = 0
    if company_text and company_text in sender_display:
        score += 6
    overlap = len(company_tokens & sender_tokens)
    if overlap:
        score += 2 + overlap
    domain_overlap = len(company_tokens & domain_tokens)
    if domain_overlap:
        score += 3 + domain_overlap
    if company_text and company_text in content_text:
        score += 4
    content_overlap = len(company_tokens & content_tokens)
    if content_overlap:
        score += 1 + min(content_overlap, 2)
    return score


def score_title_match(title: str, content_text: str) -> int:
    title_text = normalize_text(title)
    title_tokens = token_set(title, stopwords=TITLE_STOPWORDS)
    score = 0
    if title_text and title_text in content_text:
        score += 4
    overlap = len(title_tokens & set(content_text.split()))
    if overlap:
        score += min(overlap, 4)
    return score
