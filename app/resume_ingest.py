from __future__ import annotations

from io import BytesIO


class ResumeParseError(RuntimeError):
    pass


def extract_resume_text(
    *,
    resume_text: str,
    resume_bytes: bytes | None = None,
    filename: str = "",
    content_type: str = "",
) -> tuple[str, str]:
    cleaned_text = resume_text.strip()
    if cleaned_text:
        return cleaned_text, filename or "pasted_resume.txt"

    if not resume_bytes:
        return "", filename or "pasted_resume.txt"

    normalized_name = filename.lower()
    normalized_type = (content_type or "").lower()

    if normalized_name.endswith(".pdf") or normalized_type == "application/pdf":
        return extract_pdf_text(resume_bytes), filename

    return resume_bytes.decode("utf-8", errors="ignore").strip(), filename


def extract_pdf_text(raw_bytes: bytes) -> str:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise ResumeParseError(
            "PDF parsing needs the `pypdf` package installed. Run `pip3 install -r requirements.txt`."
        ) from exc

    try:
        reader = PdfReader(BytesIO(raw_bytes))
    except Exception as exc:
        raise ResumeParseError("The uploaded PDF could not be read.") from exc

    pages: list[str] = []
    for page in reader.pages:
        pages.append(page.extract_text() or "")

    extracted = "\n".join(part.strip() for part in pages if part.strip()).strip()
    if not extracted:
        raise ResumeParseError("The PDF was uploaded, but no readable text was found in it.")

    return extracted
