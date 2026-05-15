from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from io import BytesIO
from pathlib import Path

from pypdf import PdfReader

DATE_PATTERNS = (
    r"\b\d{4}-\d{2}-\d{2}\b",
    r"\b\d{1,2}/\d{1,2}/\d{4}\b",
    r"\b\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\b",
)

DOCUMENT_ALIASES = {
    "appointment_letter": ("appointment", "employment letter", "letter of appointment"),
    "birth_certificate": ("birth", "declaration of age", "age declaration"),
    "promotion_letter": ("promotion", "last promotion"),
    "staff_id_card": ("staff id", "identity card", "id card"),
    "posting_letter": ("posting", "deployment"),
    "bvn_identity_record": ("bvn", "bank verification number"),
}


@dataclass(frozen=True)
class UploadedDocument:
    filename: str
    content_type: str | None
    content: bytes


def extract_staff_document_payload(documents: list[UploadedDocument]) -> dict:
    extracted_documents: list[dict] = []
    full_text_parts: list[str] = []
    submitted_documents: set[str] = set()
    document_numbers: dict[str, str] = {}

    for document in documents:
        text, extraction_method = _extract_text(document)
        lower_source = f"{document.filename} {text}".lower()
        detected_type = _detect_document_type(lower_source)
        if detected_type:
            submitted_documents.add(detected_type)
        if text:
            full_text_parts.append(text)
        document_number = _detect_document_number(text) or _detect_document_number(document.filename)
        if detected_type and document_number:
            document_numbers[detected_type] = document_number
        extracted_documents.append(
            {
                "filename": document.filename,
                "content_type": document.content_type,
                "document_type": detected_type,
                "extraction_method": extraction_method,
                "text_characters": len(text),
                "dates": [item.isoformat() for item in _extract_dates(text)],
                "document_number": document_number,
            }
        )

    combined_text = "\n".join(full_text_parts)
    dates = _extract_dates(combined_text)
    return {
        "submitted_documents": sorted(submitted_documents),
        "document_numbers": document_numbers,
        "extracted_dates": [item.isoformat() for item in dates],
        "extracted_documents": extracted_documents,
        "text_excerpt": combined_text[:1200],
        "fields": _infer_staff_fields(combined_text, dates),
    }


def _extract_text(document: UploadedDocument) -> tuple[str, str]:
    suffix = Path(document.filename).suffix.lower()
    content_type = (document.content_type or "").lower()

    if suffix == ".pdf" or "pdf" in content_type:
        return _extract_pdf_text(document.content), "pdf_text"
    if suffix in {".txt", ".csv", ".md"} or content_type.startswith("text/"):
        return _decode_text(document.content), "plain_text"
    return "", "metadata_only"


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _decode_text(content: bytes) -> str:
    for encoding in ("utf-8", "latin-1"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    return content.decode("utf-8", errors="ignore")


def _detect_document_type(source: str) -> str | None:
    for doc_type, aliases in DOCUMENT_ALIASES.items():
        if any(alias in source for alias in aliases):
            return doc_type
    return None


def _detect_document_number(source: str) -> str | None:
    match = re.search(r"\b(?:OG|EDU|MOE|BVN|STAFF)[-/A-Z0-9]{4,}\b", source, re.IGNORECASE)
    return match.group(0).upper() if match else None


def _extract_dates(text: str) -> list[date]:
    found: list[date] = []
    for pattern in DATE_PATTERNS:
        for match in re.finditer(pattern, text, re.IGNORECASE):
            parsed = _parse_date(match.group(0))
            if parsed and parsed not in found:
                found.append(parsed)
    return sorted(found)


def _parse_date(value: str) -> date | None:
    cleaned = value.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d %B %Y", "%d %b %Y"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _infer_staff_fields(text: str, dates: list[date]) -> dict:
    lower = text.lower()
    fields: dict[str, str] = {}
    if dates:
        if "birth" in lower or "age" in lower:
            fields["file_dob"] = dates[0].isoformat()
        if "appointment" in lower or "employment" in lower:
            fields["appointment_date"] = dates[0].isoformat()
        if "promotion" in lower and len(dates) >= 1:
            fields["last_promotion_date"] = dates[-1].isoformat()
    return fields
