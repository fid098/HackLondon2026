"""
factcheck.py — Fact-check submission route.

POST /api/v1/factcheck
  1. Extract content (URL / text / media)
  2. Run multi-agent debate pipeline
  3. Persist report to MongoDB (if DB available)
  4. Return full FactCheckResponse

Authentication is optional: if a valid Bearer token is present the report
is associated with that user; anonymous submissions are also accepted.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.ai.debate_pipeline import debate_pipeline
from app.core.database import get_db
from app.models.report import (
    DebateArtifact,
    FactCheckRequest,
    FactCheckResponse,
    ReportOut,
    SourceCitation,
)
from app.services.content_extractor import extract_content

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1", tags=["factcheck"])

_bearer = HTTPBearer(auto_error=False)
CredDep = Optional[HTTPAuthorizationCredentials]


def _optional_user_id(
    credentials: CredDep = Depends(_bearer),
) -> Optional[str]:
    """Extract user ID from token if present; returns None for anonymous."""
    if not credentials:
        return None
    from app.core.security import decode_access_token
    return decode_access_token(credentials.credentials)


# ── Route ─────────────────────────────────────────────────────────────────────

@router.post("/factcheck", response_model=FactCheckResponse, status_code=201)
async def factcheck(
    payload: FactCheckRequest,
    db=Depends(get_db),
    user_id: Optional[str] = Depends(_optional_user_id),
):
    """
    Submit a claim for AI fact-checking.

    - URL submissions: content is fetched and extracted automatically.
    - Text submissions: passed directly to the debate pipeline.
    - Media submissions: base64-encoded content is forwarded to Gemini's
      vision capabilities (gracefully degrades in mock mode).

    Returns the full report synchronously. For very long articles the
    extraction + debate typically takes 8–15 s with a live Gemini key.
    In mock mode it completes in < 1 s.
    """
    # ── 1. Validate ───────────────────────────────────────────────────────────
    if payload.source_type == "url" and not payload.url:
        raise HTTPException(status_code=422, detail="url is required when source_type is 'url'")
    if payload.source_type == "text" and not payload.text:
        raise HTTPException(status_code=422, detail="text is required when source_type is 'text'")
    if payload.source_type == "media" and not payload.media_b64:
        raise HTTPException(status_code=422, detail="media_b64 is required when source_type is 'media'")

    # ── 2. Extract content ────────────────────────────────────────────────────
    content = await extract_content(
        source_type=payload.source_type,
        url=payload.url,
        text=payload.text,
    )

    if payload.context:
        content = f"{content}\n\nAdditional context: {payload.context}"

    # ── 3. Run debate pipeline ────────────────────────────────────────────────
    try:
        result = await debate_pipeline.run(content)
    except Exception as exc:
        logger.error("Debate pipeline error: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI pipeline error: {exc}")

    # ── 4. Build report document ──────────────────────────────────────────────
    source_ref = (
        payload.url or
        (payload.text[:80] + "…" if payload.text else "media upload")
    )

    sources = [SourceCitation(title=s.title, url=s.url) for s in result.sources]

    debate_artifact = DebateArtifact(
        claim_text=result.claim_text[:500],
        pro_argument=result.pro_argument,
        con_argument=result.con_argument,
        judge_reasoning=result.judge_reasoning,
        pro_sources=[SourceCitation(title=s.title, url=s.url) for s in result.pro_sources],
        con_sources=[SourceCitation(title=s.title, url=s.url) for s in result.con_sources],
    )

    now = datetime.now(tz=timezone.utc)

    # ── 5. Persist to MongoDB (best-effort) ───────────────────────────────────
    report_id: Optional[str] = None

    if db is not None:
        try:
            doc = {
                "source_type":  payload.source_type,
                "source_ref":   source_ref,
                "verdict":      result.verdict,
                "confidence":   result.confidence,
                "summary":      result.summary,
                "pro_points":   result.pro_points,
                "con_points":   result.con_points,
                "sources":      [s.model_dump() for s in sources],
                "category":     result.category,
                "debate":       debate_artifact.model_dump(),
                "created_at":   now,
                "user_id":      user_id,
            }
            ins = await db["reports"].insert_one(doc)
            report_id = str(ins.inserted_id)
        except Exception as exc:
            logger.warning("Failed to persist report to MongoDB: %s", exc)

    if not report_id:
        report_id = str(ObjectId())  # ephemeral ID for non-persisted reports

    # ── 6. Build response ─────────────────────────────────────────────────────
    report_out = ReportOut(
        id=report_id,
        source_type=payload.source_type,
        source_ref=source_ref,
        verdict=result.verdict,
        confidence=result.confidence,
        summary=result.summary,
        pro_points=result.pro_points,
        con_points=result.con_points,
        sources=sources,
        category=result.category,
        debate=debate_artifact,
        created_at=now,
        user_id=user_id,
    )

    return FactCheckResponse(report_id=report_id, report=report_out)
