from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass


@dataclass(frozen=True)
class KeywordScore:
    category: str
    keyword: str
    score: float


@dataclass(frozen=True)
class CandidateProfile:
    archetype: str
    archetype_label: str
    primary_titles: list[str]
    top_technologies: list[str]
    certifications: list[str]
    years_experience: int | None
    preferred_seniority: str
    early_career: bool
    search_queries: list[str]
    summary: str


SECTION_HINTS = {
    "summary": {"summary", "profile", "about"},
    "experience": {"experience", "employment", "work history"},
    "skills": {"skills", "technical skills", "core competencies"},
    "education": {"education", "certifications"},
}

TECH_KEYWORDS = {
    "troubleshooting",
    "help desk",
    "desktop support",
    "technical support",
    "active directory",
    "windows",
    "ticketing",
    "customer support",
    "documentation",
    "python",
    "sql",
    "excel",
    "tableau",
    "power bi",
    "java",
    "javascript",
    "typescript",
    "react",
    "node.js",
    "node",
    "aws",
    "azure",
    "gcp",
    "docker",
    "kubernetes",
    "git",
    "linux",
    "salesforce",
    "snowflake",
    "dbt",
    "airflow",
    "spark",
    "hadoop",
    "pandas",
    "numpy",
    "tensorflow",
    "jira",
    "figma",
    "ga4",
    "seo",
    "sem",
    "quickbooks",
    "crm",
    "erp",
}

TITLE_PATTERNS = [
    "it support specialist",
    "technical support specialist",
    "technical support analyst",
    "desktop support technician",
    "pc technician",
    "help desk technician",
    "help desk analyst",
    "it technician",
    "support technician",
    "qa analyst",
    "qa tester",
    "operations coordinator",
    "customer support specialist",
    "implementation specialist",
    "business systems analyst",
    "junior data analyst",
    "junior software engineer",
    "software engineer",
    "data analyst",
    "data scientist",
    "product manager",
    "project manager",
    "business analyst",
    "marketing manager",
    "operations manager",
    "sales manager",
    "customer success manager",
    "account manager",
    "financial analyst",
    "analytics manager",
    "solutions architect",
    "solutions consultant",
    "implementation manager",
    "machine learning engineer",
    "devops engineer",
    "full stack developer",
    "frontend developer",
    "backend developer",
]

CERT_PATTERNS = [
    r"aws certified [a-z ]+",
    r"pmp",
    r"csm",
    r"scrum master",
    r"google analytics certification",
    r"salesforce administrator",
    r"cpa",
    r"security\+",
]

EXPERIENCE_PATTERNS = [
    r"\b\d+\+?\s+years? of experience\b",
    r"\bintern(ship)?\b",
    r"\btechnician\b",
    r"\bmanaged\b",
    r"\bled\b",
    r"\bbuilt\b",
    r"\bowned\b",
    r"\bdelivered\b",
    r"\blaunched\b",
    r"\bincreased\b",
    r"\breduced\b",
    r"\bimproved\b",
]

TOKEN_PATTERN = re.compile(r"[A-Za-z][A-Za-z0-9\+\#\.\-/]+")
YEARS_PATTERN = re.compile(r"\b(\d{1,2})\+?\s+years? of experience\b")
EARLY_CAREER_HINTS = {
    "recent graduate",
    "new graduate",
    "graduate",
    "entry level",
    "entry-level",
    "intern",
    "internship",
    "pc technician",
    "help desk",
    "desktop support",
    "it support",
    "student worker",
}

ARCHETYPES = {
    "data_analytics": {
        "label": "Data & Analytics",
        "titles": {
            "data analyst",
            "business analyst",
            "financial analyst",
            "analytics manager",
            "marketing analytics manager",
        },
        "technologies": {"sql", "python", "excel", "tableau", "power bi", "ga4", "pandas"},
    },
    "software_engineering": {
        "label": "Software Engineering",
        "titles": {
            "junior software engineer",
            "software engineer",
            "backend developer",
            "frontend developer",
            "full stack developer",
            "machine learning engineer",
            "devops engineer",
        },
        "technologies": {
            "python",
            "javascript",
            "typescript",
            "react",
            "node.js",
            "node",
            "sql",
            "aws",
            "docker",
            "kubernetes",
            "git",
            "linux",
        },
    },
    "product_project_ops": {
        "label": "Product / Project / Operations",
        "titles": {
            "operations coordinator",
            "implementation specialist",
            "product manager",
            "project manager",
            "operations manager",
            "solutions architect",
            "implementation manager",
        },
        "technologies": {"jira", "sql", "excel", "crm", "erp", "salesforce"},
    },
    "customer_success": {
        "label": "Customer Success / Account Growth",
        "titles": {
            "customer support specialist",
            "customer success manager",
            "account manager",
            "sales manager",
            "solutions consultant",
        },
        "technologies": {"crm", "salesforce", "excel", "tableau", "power bi"},
    },
    "it_support": {
        "label": "IT Support / Technician",
        "titles": {
            "it support specialist",
            "technical support specialist",
            "technical support analyst",
            "desktop support technician",
            "pc technician",
            "help desk technician",
            "help desk analyst",
            "it technician",
            "support technician",
        },
        "technologies": {"windows", "linux", "crm", "jira", "git", "python"},
    },
    "marketing_growth": {
        "label": "Marketing & Growth",
        "titles": {"marketing manager", "marketing analytics manager"},
        "technologies": {"ga4", "seo", "sem", "excel", "power bi", "tableau"},
    },
}


def extract_keywords(resume_text: str) -> tuple[list[KeywordScore], list[str]]:
    lines = [line.strip() for line in resume_text.splitlines() if line.strip()]
    section = "summary"
    weighted_terms: defaultdict[tuple[str, str], float] = defaultdict(float)
    found_titles: Counter[str] = Counter()
    search_queries: list[str] = []

    for line in lines:
        lowered = line.lower()
        section = detect_section(lowered, section)
        weight = section_weight(section)

        for title in TITLE_PATTERNS:
            if title in lowered:
                found_titles[title] += 1
                weighted_terms[("job_title", title)] += 4.0 * weight

        for tech in TECH_KEYWORDS:
            if tech in lowered:
                weighted_terms[("technology", tech)] += 2.5 * weight

        for pattern in CERT_PATTERNS:
            for match in re.findall(pattern, lowered):
                weighted_terms[("certification", match)] += 3.5 * weight

        for pattern in EXPERIENCE_PATTERNS:
            for match in re.findall(pattern, lowered):
                weighted_terms[("experience_phrase", match)] += 2.0 * weight

        if ":" not in line:
            for phrase in extract_candidate_phrases(line):
                category = infer_phrase_category(phrase)
                if category:
                    weighted_terms[(category, phrase)] += 1.0 * weight

    top_titles = [title for title, _count in found_titles.most_common(3)]
    top_technologies = [
        keyword
        for (category, keyword), _score in sorted(
            weighted_terms.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if category == "technology"
    ][:6]

    if top_titles and top_technologies:
        for title in top_titles:
            search_queries.append(f"{title} Minneapolis MN {' '.join(top_technologies[:3])}")
    elif top_titles:
        for title in top_titles:
            search_queries.append(f"{title} Minneapolis MN")

    keyword_scores = [
        KeywordScore(category=category, keyword=keyword, score=round(score, 2))
        for (category, keyword), score in sorted(
            weighted_terms.items(),
            key=lambda item: item[1],
            reverse=True,
        )
        if score >= 2.0
    ][:30]

    return keyword_scores, search_queries[:5]


def infer_candidate_profile(
    resume_text: str,
    keywords: list[KeywordScore],
    queries: list[str] | None = None,
) -> CandidateProfile:
    keyword_scores = {
        item.category: [keyword for keyword in keywords if keyword.category == item.category]
        for item in keywords
    }
    primary_titles = [item.keyword for item in keyword_scores.get("job_title", [])[:4]]
    top_technologies = [item.keyword for item in keyword_scores.get("technology", [])[:6]]
    certifications = [item.keyword for item in keyword_scores.get("certification", [])[:4]]
    years_experience = extract_years_experience(resume_text)
    early_career = infer_early_career(resume_text, years_experience)
    preferred_seniority = infer_preferred_seniority(early_career, years_experience)

    archetype_scores: Counter[str] = Counter()
    for archetype, config in ARCHETYPES.items():
        title_matches = len(set(primary_titles) & config["titles"])
        tech_matches = len(set(top_technologies) & config["technologies"])
        archetype_scores[archetype] += title_matches * 6 + tech_matches * 1.5

        lowered_resume = resume_text.lower()
        for title in config["titles"]:
            if title in lowered_resume:
                archetype_scores[archetype] += 4
        for tech in config["technologies"]:
            if tech in lowered_resume:
                archetype_scores[archetype] += 1

    if archetype_scores:
        archetype = archetype_scores.most_common(1)[0][0]
    else:
        archetype = "generalist"

    archetype_label = ARCHETYPES.get(archetype, {}).get("label", "Generalist")
    search_queries = queries or build_search_queries(
        archetype,
        primary_titles,
        top_technologies,
        preferred_seniority,
    )
    summary = build_profile_summary(
        archetype_label=archetype_label,
        primary_titles=primary_titles,
        top_technologies=top_technologies,
        years_experience=years_experience,
        early_career=early_career,
    )

    return CandidateProfile(
        archetype=archetype,
        archetype_label=archetype_label,
        primary_titles=primary_titles,
        top_technologies=top_technologies,
        certifications=certifications,
        years_experience=years_experience,
        preferred_seniority=preferred_seniority,
        early_career=early_career,
        search_queries=search_queries,
        summary=summary,
    )


def detect_section(line: str, current: str) -> str:
    for section, hints in SECTION_HINTS.items():
        if line in hints:
            return section
    return current


def section_weight(section: str) -> float:
    return {
        "summary": 1.2,
        "experience": 1.4,
        "skills": 1.8,
        "education": 1.0,
    }.get(section, 1.0)


def extract_candidate_phrases(line: str) -> list[str]:
    phrases: list[str] = []
    tokens = TOKEN_PATTERN.findall(line)
    if len(tokens) <= 6:
        normalized = " ".join(tokens).lower()
        if 2 <= len(normalized.split()) <= 5:
            phrases.append(normalized)
    return phrases


def infer_phrase_category(phrase: str) -> str | None:
    if any(title in phrase for title in TITLE_PATTERNS):
        return "job_title"
    if any(tech in phrase for tech in TECH_KEYWORDS):
        return "technology"
    if "cert" in phrase or phrase in {"pmp", "cpa", "csm"}:
        return "certification"
    return None


def extract_years_experience(resume_text: str) -> int | None:
    matches = [int(value) for value in YEARS_PATTERN.findall(resume_text.lower())]
    if not matches:
        return None
    return max(matches)


def build_search_queries(
    archetype: str,
    primary_titles: list[str],
    top_technologies: list[str],
    preferred_seniority: str,
) -> list[str]:
    titles = primary_titles[:3]
    if not titles and archetype in ARCHETYPES:
        titles = list(ARCHETYPES[archetype]["titles"])[:2]

    focus_skills = " ".join(top_technologies[:3]).strip()
    seniority_prefix = ""
    if preferred_seniority == "entry_level":
        seniority_prefix = "entry level"
    elif preferred_seniority == "mid_level":
        seniority_prefix = "mid level"

    queries: list[str] = []
    for title in titles[:2]:
        queries.append(f"{seniority_prefix} {title} Minneapolis MN {focus_skills}".strip())

    if titles:
        primary_title = titles[0]
        queries.append(f"{seniority_prefix} {primary_title} remote {focus_skills}".strip())
        queries.append(f"{seniority_prefix} {primary_title} Minnesota {focus_skills}".strip())
        queries.append(f"{seniority_prefix} {primary_title} Wisconsin Iowa {focus_skills}".strip())
    return queries[:5]


def build_profile_summary(
    *,
    archetype_label: str,
    primary_titles: list[str],
    top_technologies: list[str],
    years_experience: int | None,
    early_career: bool,
) -> str:
    title_text = ", ".join(primary_titles[:2]) if primary_titles else archetype_label
    tech_text = ", ".join(top_technologies[:3]) if top_technologies else "broad transferable skills"

    if early_career:
        if years_experience:
            return (
                f"Best aligned for early-career {archetype_label.lower()} roles, anchored by {title_text}, "
                f"roughly {years_experience} years of experience, and strengths in {tech_text}."
            )
        return (
            f"Best aligned for early-career {archetype_label.lower()} roles, anchored by {title_text} "
            f"and strengths in {tech_text}."
        )

    if years_experience:
        return (
            f"Best aligned for {archetype_label} roles, anchored by {title_text}, "
            f"{years_experience}+ years of experience, and strengths in {tech_text}."
        )

    return (
        f"Best aligned for {archetype_label} roles, anchored by {title_text} "
        f"and strengths in {tech_text}."
    )


def infer_early_career(resume_text: str, years_experience: int | None) -> bool:
    lowered = resume_text.lower()
    if years_experience is not None and years_experience <= 3:
        return True
    if any(hint in lowered for hint in EARLY_CAREER_HINTS):
        return True
    return False


def infer_preferred_seniority(early_career: bool, years_experience: int | None) -> str:
    if early_career:
        return "entry_level"
    if years_experience is not None and years_experience <= 5:
        return "mid_level"
    return "experienced"
