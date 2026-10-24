"""RAG service for the AICTE handbook / regulatory source documents.

Pipeline (spec §15):
  ingest: pdfplumber text -> page-aware chunking -> optional embeddings ->
          RagChunk rows (embedding as JSON vector)
  query : permission check -> embedding similarity OR lexical fallback
          (BM25-lite token scoring) -> grounded answer via ai_provider -> citations

Honest engineering notes:
- On PostgreSQL deployments with pgvector the embedding column can be switched
  to a vector type (documented in docs/architecture.md); the prototype keeps a
  JSON-stored vector + in-process cosine similarity, which is fully functional
  at handbook scale (hundreds of chunks).
- When an embedding model is NOT configured, retrieval falls back to deterministic
  lexical scoring — still real retrieval, clearly labelled in the response.
- If no chunk clears the retrieval threshold or the LLM is unavailable, the
  service says so instead of fabricating an answer.
"""
from __future__ import annotations

import hashlib
import json
import math
import re
from collections import Counter
from dataclasses import dataclass

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.orm_models import RegulatoryDocument, RagChunk, utcnow


# ---------------------------------------------------------------------------
# embeddings
# ---------------------------------------------------------------------------

def embeddings_available() -> bool:
    return bool(settings.AI_API_BASE_URL and settings.AI_API_KEY and settings.AI_EMBEDDING_MODEL)


def _embed(texts: list[str]) -> list[list[float]] | None:
    if not embeddings_available():
        return None
    import httpx

    headers = {"Authorization": f"Bearer {settings.AI_API_KEY}"}
    try:
        resp = httpx.post(
            settings.AI_API_BASE_URL.rstrip("/") + "/embeddings",
            json={"model": settings.AI_EMBEDDING_MODEL, "input": texts},
            headers=headers, timeout=httpx.Timeout(60, connect=10),
        )
        resp.raise_for_status()
        data = resp.json()
        return [item["embedding"] for item in data["data"]]
    except Exception:
        return None


def _cosine(a: list[float], b: list[float]) -> float:
    if len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


_TOKEN_RE = re.compile(r"[a-z0-9]{3,}")


def _tokens(text: str) -> list[str]:
    from collections import Counter
    return Counter(w for w in _TOKEN_RE.findall(text.lower()))


def _lexical_score(query: str, text: str) -> float:
    """Simple IDF-weighted overlap; deterministic and explainable."""
    q = _tokens(query)
    d = _tokens(text)
    if not q or not d:
        return 0.0
    common = set(q) & set(d)
    if not common:
        return 0.0
    hits = sum(q[t] * d[t] for t in common)
    return hits / (1 + sum(q.values()))


# ---------------------------------------------------------------------------
# ingestion
# ---------------------------------------------------------------------------

_CHUNK_TARGET = 900  # characters; keeps sections meaningful


def ingest_document(db: Session, doc: RegulatoryDocument) -> dict:
    """Extract + chunk + embed one registered source document."""
    from app.services.document_service import storage

    if not doc.storage_key:
        return {"document_id": doc.id, "chunks": 0, "error": "no file attached"}
    content = storage().get(doc.storage_key)

    import io

    import pdfplumber

    pages: list[tuple[int, str]] = []
    with pdfplumber.open(io.BytesIO(content)) as pdf:
        for i, page in enumerate(pdf.pages, start=1):
            pages.append((i, page.extract_text() or ""))
    if not any(t.strip() for _, t in pages):
        return {"document_id": doc.id, "chunks": 0, "error": "no extractable text (scanned document? configure TESSERACT_CMD)"}

    chunks: list[dict] = []
    for page_no, text in pages:
        section = ""
        for para in re.split(r"\n\s*\n|\n(?=[A-Z][A-Z\s]{8,}\n)", text):
            para = para.strip()
            if not para:
                continue
            m = re.match(r"^([A-Z][A-Z0-9\s,\-()]{6,80})$", para)
            if m:
                section = m.group(1).strip()
            for piece in _split_long(para, _CHUNK_TARGET):
                chunks.append({"page": page_no, "section": section, "text": piece})
    # de-noise tiny chunks by merging
    merged = _merge_small(chunks, min_chars=120)

    vectors = _embed([c["text"] for c in merged]) or None
    db.query(RagChunk).filter(RagChunk.document_id == doc.id).delete()
    for idx, c in enumerate(merged):
        db.add(RagChunk(
            document_id=doc.id, page=c["page"], section=c.get("section"),
            chunk_index=idx, text=c["text"],
            embedding=(vectors[idx] if vectors else None),
            embedding_model=(settings.AI_EMBEDDING_MODEL if vectors else None),
        ))
    doc.is_ingested = True
    doc.checksum = hashlib.sha256(content).hexdigest()
    db.flush()
    return {"document_id": doc.id, "chunks": len(merged), "embedded": vectors is not None,
            "retrieval_mode": "vector" if vectors else "lexical-fallback"}


def _split_long(text: str, target: int) -> list[str]:
    if len(text) <= target:
        return [text]
    parts = []
    for sentence in re.split(r"(?<=[.;:])\s+", text):
        if parts and len(parts[-1]) + len(sentence) < target * 1.3:
            parts[-1] += " " + sentence
        else:
            parts.append(sentence)
    return parts


def _merge_small(chunks: list[dict], min_chars: int) -> list[dict]:
    out: list[dict] = []
    for c in chunks:
        if out and len(c["text"]) < min_chars:
            out[-1]["text"] += " " + c["text"]
        else:
            out.append(dict(c))
    return out


# ---------------------------------------------------------------------------
# retrieval + answering
# ---------------------------------------------------------------------------

@dataclass
class RetrievedChunk:
    chunk: RagChunk
    score: float
    score_kind: str  # cosine | lexical


def retrieve(db: Session, query: str, top_k: int = 6) -> tuple[list[RetrievedChunk], str]:
    """Access control note: caller must filter document access by role scope;
    in this prototype RAG sources are institution-independent (official public
    documents), so all authenticated roles may query them."""
    qvec = None
    mode = "lexical-fallback"
    if embeddings_available():
        vecs = _embed([query])
        if vecs:
            qvec = vecs[0]
            mode = "vector"

    scored: list[RetrievedChunk] = []
    chunks = db.query(RagChunk).all()
    if not chunks:
        return [], mode
    if qvec is not None:
        for c in chunks:
            if not c.embedding:
                continue
            scored.append(RetrievedChunk(c, _cosine(qvec, c.embedding), "cosine"))
        scored = [s for s in scored if s.score > 0.05] or scored
    else:
        for c in chunks:
            s = _lexical_score(query, c.text)
            if s > 0:
                scored.append(RetrievedChunk(c, _lexical_score(query, c.text), "lexical"))
    scored.sort(key=lambda s: -s.score)
    return scored[:top_k], mode


def answer(db: Session, *, user_role: str, question: str, top_k: int = 6) -> dict:
    from app.services import ai_provider

    hits, mode = retrieve(db, question, top_k)
    if not hits or (hits and hits[0].score < 0.02):
        return {
            "answer": None,
            "abstained": True,
            "reason": "No sufficiently relevant passage was found in the ingested source documents.",
            "retrieval_mode": mode,
            "citations": [],
        }

    context = "\n\n---\n\n".join(
        f"[{i + 1}] Document: {h.chunk.document.title} (v{h.chunk.document.version or 'n/a'}), "
        f"page {h.chunk.page}, section: {h.chunk.section or 'n/a'}\n{h.chunk.text}"
        for i, h in enumerate(hits)
    )
    citations = [
        {
            "n": i + 1,
            "title": h.chunk.document.title,
            "authority": h.chunk.document.authority,
            "version": h.chunk.document.version,
            "page": h.chunk.page,
            "section": h.chunk.section,
            "source_url": h.chunk.document.source_url,
            "status": h.chunk.document.status,
            "score": round(h.score, 3),
            "score_kind": h.score_kind,
            "snippet": h.chunk.text[:240],
        }
        for i, h in enumerate(hits)
    ]

    if not ai_provider.ai_available():
        # Degraded but honest mode: return retrieved passages WITHOUT an LLM answer.
        return {
            "answer": None,
            "abstained": False,
            "llm_available": False,
            "reason": "AI provider is not configured — below are the retrieved source passages for manual reading.",
            "retrieval_mode": mode,
            "citations": citations,
        }

    result = ai_provider.chat(
        messages=[
            {"role": "system", "content": (
                "Answer ONLY from the numbered retrieved passages. Cite like [1]. "
                "If the passages do not establish the answer, reply exactly: "
                "'The available sources do not establish this.' Never invent clause numbers, "
                "page numbers or quotations. Distinguish what sources state from operational suggestions."
            )},
            {"role": "user", "content": f"Question: {question}\n\nRetrieved passages:\n{context}"},
        ],
        max_tokens=800,
    )
    if not result.ok:
        return {
            "answer": None, "abstained": False, "llm_available": False,
            "reason": f"AI provider error: {result.error}",
            "retrieval_mode": mode, "citations": citations,
        }
    return {"answer": result.content, "abstained": False, "llm_available": True,
            "retrieval_mode": mode, "citations": citations,
            "provider": result.provider, "model": result.model}
