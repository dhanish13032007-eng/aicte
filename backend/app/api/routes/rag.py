"""AICTE Handbook Assistant (RAG) endpoint — spec §15.

Retrieval happens against ingested, registered source documents only; the
answer is grounded in retrieved passages and always returns citations. When no
sufficiently relevant passage exists the service abstains instead of guessing,
and when no LLM is configured it returns the retrieved passages for manual
reading (honest degradation, never fabricated answers).
"""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user, require_perm
from app.core.permissions import Perm
from app.db import get_db
from app.models.orm_models import AiOperation, RegulatoryDocument, User
from app.schemas import RagQuestionIn
from app.services import rag_service

router = APIRouter(prefix="/rag", tags=["rag"])


@router.post("/ask")
def ask(
    body: RagQuestionIn,
    db: Session = Depends(get_db),
    user: User = Depends(require_perm(Perm.RAG_QUERY)),
):
    if not body.question.strip():
        raise HTTPException(status_code=400, detail="Question must not be empty")
    source_count = db.query(RegulatoryDocument).count()
    if source_count == 0:
        return {
            "answer": None,
            "abstained": True,
            "reason": (
                "No source documents have been registered and ingested yet. "
                "An administrator must register the applicable Approval Process Handbook "
                "(or other approved reference) before questions can be answered."
            ),
            "retrieval_mode": "none",
            "citations": [],
            "source_count": 0,
        }

    result = rag_service.answer(db, user_role=user.role, question=body.question.strip())
    op = AiOperation(
        purpose="rag_answer",
        provider=result.get("provider"),
        model=result.get("model"),
        request_summary=body.question.strip()[:400],
        output={
            "citations": [
                {"title": c["title"], "page": c["page"], "score": c["score"]} for c in result["citations"]
            ],
            "abstained": result.get("abstained", False),
            "retrieval_mode": result.get("retrieval_mode"),
        },
        status="ok" if (result.get("answer") or result.get("citations")) else "abstained",
        created_by=user.id,
    )
    db.add(op)
    db.commit()
    return {**result, "source_count": source_count, "operation_id": op.id}
