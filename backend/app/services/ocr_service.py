"""Document text extraction and field heuristics.

- pdfplumber for text-based PDFs (installed by default).
- pytesseract + Pillow for scanned PDFs/images, used ONLY when the tesseract
  binary is available (TESSERACT_CMD); otherwise extraction fails honestly with
  a message asking the reviewer to read the document manually.

CRITICAL POLICY (spec §7): OCR does not establish document authenticity. A
document is never marked 'fraudulent' automatically — anomalies are flagged
'needs_manual_review' for an authorized human verifier.
"""
from __future__ import annotations

import re
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.log import get_logger
from app.models.orm_models import Document, OcrResult, utcnow

log = get_logger("ocr")

PARSER_VERSION = "heuristic-v1"

_DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), ("y", "m", "d")),
    (re.compile(r"\b(\d{2})[/-](\d{2})[/-](\d{4})\b"), ("d", "m", "y")),
    (re.compile(r"\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{4})\b", re.I), ("d", "mon", "y")),
]

_MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}

_DATE_HINTS = {
    "expiry": (r"expir(?:y|ies|es|ing)\s*(?:date)?|valid\s*(?:upto|until|till|:)", "expiry_date"),
    "issue": (r"issued?\s*(?:on|date)?|dated?.{0,10}", "issue_date"),
}

_NUM_HINTS = {r"(?:cert\.?|certificate|bcn|regno)\s*(?:no\.?|number|:)\s*[:#-]?\s*([A-Z0-9/-]{3,30})", }


def _find_dates(text: str) -> list[tuple[str, datetime]]:
    out: list[tuple[str, datetime]] = []
    for hint, _ in _DATE_HINTS.items():
        for match in re.finditer(rf"({hint})[^\d0-9]{{0,20}}([0-9]{{2,4}}[-/.][0-9]{{1,2}}[-/.][0-9]{{2,4}})", text, re.I):
            raw = match.group(2)
            parsed = _parse_date(raw)
            if parsed:
                out.append((hint, parsed))
    for match in re.finditer(r"\b([0-9]{2,4}[-/.][0-9]{1,2}[-/.][0-9]{2,4})\b", text):
        parsed = _parse_date(match.group(1))
        if parsed:
            out.append(("ambiguous", parsed))
    return out


def _parse_date(raw: str) -> datetime | None:
    for sep in ("-", "/", "."):
        parts = raw.split(sep)
        if len(parts) == 3:
            a, b, c = [p.strip() for p in parts]
            try:
                if len(a) == 4:
                    return datetime(int(a), int(b), int(c))
                if len(c) == 4:
                    # assume DD/MM/YYYY (Indian convention), fallback MM/DD/YYYY
                    d1 = datetime(int(c), int(b), int(a))
                    return d1
            except ValueError:
                continue
    return None


def _infer_field_names(dates: list[tuple[str, datetime]]) -> dict:
    fields = {"issue_date": datetime, "expiry_date": None}
    found = {}
    for hint, dt in dates:
        if hint == "expiry" and "expiry_date" not in found:
            found["expiry_date"] = dt
        elif hint == "issue" and "issue_date" not in found:
            found["issue_date"] = dt
    return found


def _extract_simple_fields(text: str) -> list[dict]:
    """Very simple, transparent heuristics — outputs always carry confidence
    and a text snippet so a human reviewer can verify the source."""
    fields: list[dict] = []

    def add(key, value, confidence, snippet):
        if value:
            fields.append({"key": key, "value": str(value), "confidence": round(confidence, 2), "snippet": snippet})

    m = re.search(r"(?:institut(?:e|ion)\s*name|institution)\s*[:\-]\s*([A-Za-z0-9.,& ()']{5,120})", text, re.I)
    if m:
        add("institution_name", m.group(1).strip(), 0.75, m.group(0)[:160])

    m = re.search(r"(?:regno|reg\.?\s*no\.?|certificate\s*(?:no\.?|number)|bcn)\s*[:\-]?\s*([A-Za-z0-9/-]{4,30})", text, re.I)
    if m:
        add("document_number", m.group(1).strip(), 0.7, m.group(0)[:160])

    dates = _find_dates(text)
    if dates:
        fields_obj = _infer_field_names(dates)
        for key, val in fields_obj.items():
            if val:
                add(key, val.strftime("%Y-%m-%d") if hasattr(val, "strftime") else val, 0.4 if key == "expiry_date" else 0.5, "date pattern in document text")

    return fields


def extract_pdf_text(content: bytes) -> tuple[int, str]:
    """Extract text using pdfplumber. Returns (page_count, text)."""
    import io

    import pdfplumber

    text_parts: list[str] = []
    pages = 0
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        pages = len(pdf.pages)
        for page in pdf.pages:
            page_text = page.extract_text() or ""
            text_parts.append(page_text)
    return pages, "\n".join(text_parts)


def _try_tesseract(content: bytes, filename: str) -> tuple[int, str] | None:
    """Scanned-document best effort. Returns None if pytesseract/binary absent."""
    try:
        import io

        import pytesseract  # noqa: F401
        from PIL import Image  # noqa: F401
    except ImportError:
        return None
    if settings.TESSERACT_CMD:
        pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD
    if filename.lower().endswith((".png", ".jpg", ".jpeg", ".tif", ".tiff")):
        try:
            from PIL import Image

            img = Image.open(io.BytesIO(content))
            return 1, pytesseract.image_to_string(img)
        except Exception as exc:  # noqa: BLE001
            log.warning("tesseract image OCR failed: %s", exc)
            return None
    return None


def run_ocr(db: Session, doc: Document) -> OcrResult:
    """Run extraction for a document and record results honestly."""
    ocr = OcrResult(document_id=doc.id, status="running", extractor="pdfplumber")
    db.add(ocr)
    db.flush()

    from app.services.document_service import storage

    content = storage().get(doc.storage_key)
    text = ""
    page_count: int | None = None
    try:
        if doc.storage_key.lower().endswith(".pdf"):
            try:
                page_count, text = extract_pdf_text(content)
            except Exception as exc:
                log.info("pdfplumber failed (%s); trying tesseract if available", exc)
                t = _try_tesseract(content, doc.storage_key)
                if t is not None:
                    ocr.extractor = "tesseract"
                    page_count, text = t
        else:
            t = _try_tesseract(content, doc.storage_key)
            if t is not None:
                ocr.extractor = "tesseract"
                page_count, text = t
    except Exception as exc:  # noqa: BLE001 — record and flag for human action
        ocr.status = "failed"
        ocr.error = str(exc)[:800]
        doc.status = "needs_manual_review"
        ocr.finished_at = utcnow()
        db.flush()
        return ocr

    if not text or len(text.strip()) < 20:
        ocr.status = "failed"
        ocr.error = (
            "No machine-readable text found. If this is a scanned document, install the tesseract "
            "binary (TESSERACT_CMD) and retry — or verify the document manually."
        )
        doc.status = "needs_manual_review"
    else:
        fields = _extract_simple_fields(text)
        ocr.status = "completed"
        ocr.page_count = page_count
        ocr.text = text
        ocr.fields = fields
        ocr.avg_confidence = (
            round(sum(f["confidence"] for f in fields) / len(fields), 2) if fields else 0.3
        )
        flags = []
        if not fields:
            flags.append("no_fields_extracted")
        if len(text.strip()) < 200:
            flags.append("short_text")
        ocr.flags = flags
        doc.status = "ocr_completed"
    ocr.finished_at = utcnow()
    db.flush()
    return ocr
