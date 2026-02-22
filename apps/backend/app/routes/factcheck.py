"""
factcheck.py — Fact-check submission route.

DEVELOPER: Ishaan
─────────────────────────────────────────────────────────────────────────────
This file owns the main fact-check AI pipeline endpoint.

Route:
  POST /api/v1/factcheck  — accepts URL / text / media, runs the AI debate
                            pipeline, persists to MongoDB, returns a full report.

HOW THE DATA FLOWS
──────────────────
1. Frontend (Analyze.jsx) calls POST /api/v1/factcheck with source_type + content.
2. content_extractor.py fetches/parses URLs (or passes text straight through).
3. The 4-agent debate pipeline runs (see THE DEBATE PIPELINE below).
4. The result is persisted to MongoDB `reports` collection (best-effort).
5. A FactCheckResponse is returned immediately — this is synchronous, no polling.

THE DEBATE PIPELINE  (app/ai/debate_pipeline.py)
────────────────────────────────────────────────
  Extractor Agent  → identifies the core falsifiable claim in the content
  Pro Agent        → argues FOR the claim, finds supporting evidence
  Con Agent        → argues AGAINST the claim with counter-evidence
  Judge Agent      → synthesises both sides and issues verdict + confidence

  Each agent is a Gemini Pro call. In mock mode (GEMINI_API_KEY not set) all
  four agents return pre-scripted responses so tests never hit the API.

WHAT TO IMPROVE (your tasks as Ishaan)
────────────────────────────────────────
- Wire the YouTube transcript extractor: if source_type='url' and the URL is
  YouTube, call the YouTube Data API (or yt-dlp) to fetch the transcript, then
  pass it as the content string to the debate pipeline.
- Add streaming: use FastAPI's StreamingResponse + Server-Sent Events so the
  frontend can render each agent's output as it arrives (faster perceived UX).
- Cache common claims: hash the claim_text and skip the pipeline if the same
  claim was checked in the last 24 h — store the hash in a `claim_cache` collection.
- Improve category tagging: the Judge Agent guesses the category; add a
  dedicated Gemini Flash classification call for speed and accuracy.

TESTING YOUR CHANGES
─────────────────────
  cd apps/backend
  pytest tests/test_factcheck.py -v       # unit + integration tests
  pytest tests/test_rate_limit.py -v      # confirm 20/minute limit is enforced

  # Manual test — text claim:
  curl -X POST http://localhost:8000/api/v1/factcheck \\
    -H 'Content-Type: application/json' \\
    -d '{"source_type": "text", "text": "The moon is made of cheese."}'

  # Manual test — URL:
  curl -X POST http://localhost:8000/api/v1/factcheck \\
    -H 'Content-Type: application/json' \\
    -d '{"source_type": "url", "url": "https://example.com/article"}'

AUTHENTICATION
──────────────
Bearer token is optional. If a valid JWT is provided the report is stored
with user_id set in MongoDB; anonymous reports have user_id = null.
Token decode logic is in app/core/security.py.
"""

import logging
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.ai.debate_pipeline import debate_pipeline
from app.core.database import get_db
from app.core.rate_limit import limiter
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
@limiter.limit("20/minute")
async def factcheck(
    request: Request,
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

    # ── 5. Generate ephemeral ID — user must click "Save to Reports" to persist ─
    # The factcheck pipeline intentionally does NOT auto-save to MongoDB.
    # The frontend prompts the user after showing the result; they call
    # POST /api/v1/reports only if they want to keep it.
    report_id = str(ObjectId())

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
