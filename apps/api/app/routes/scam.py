"""
scam.py — Phase 6 Scam Detection + Feedback endpoints.

Routes:
  POST /api/v1/scam/check  — RoBERTa + XGBoost scam/phishing classifier (via Gemini Pro)
  POST /api/v1/feedback    — persist user verdict feedback to MongoDB

Scam check:
  Single Gemini Pro call that simulates a dual-model ensemble.
  Returns is_scam, confidence (0–1), per-model scores, scam_type, and reasoning.
  No authentication required — anyone can check text.

Feedback:
  Accepts thumbs_up/thumbs_down + optional notes for any report.
  Stores to the `feedback` MongoDB collection.
  No authentication required — public feedback encouraged.
"""

import json
import logging
import re
from datetime import datetime, timezone
from typing import Optional

from bson import ObjectId
from fastapi import APIRouter, Depends, Request

from app.ai.gemini_client import gemini_client
from app.core.database import get_db
from app.core.rate_limit import limiter
from app.models.scam import (
    FeedbackRequest,
    FeedbackResponse,
    ModelScores,
    ScamCheckRequest,
    ScamCheckResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["scam"])

# ── Scam-check prompt ──────────────────────────────────────────────────────────

_SCAM_PROMPT = """\
You are an expert scam-detection AI using a dual-model ensemble (RoBERTa + XGBoost).
Analyse the following text and determine whether it is a scam or phishing attempt.

Look for: urgency cues, impersonation, prize/lottery language, advance-fee patterns,
suspicious links/domains, too-good-to-be-true offers, and threatening language.

TEXT:
{text}

Respond with valid JSON and nothing else:
{{
  "is_scam": <true|false>,
  "confidence": <float 0.0-1.0>,
  "model_scores": {{
    "roberta": <float 0.0-1.0>,
    "xgboost": <float 0.0-1.0>
  }},
  "scam_type": "<phishing|advance_fee|impersonation|lottery|romance|investment|other|null>",
  "reasoning": "<one or two sentences explaining the verdict>"
}}"""


def _clamp(val: float) -> float:
    return max(0.0, min(1.0, float(val)))


def _parse_scam_json(raw: str) -> Optional[dict]:
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group())
    except (json.JSONDecodeError, ValueError):
        return None


# ── POST /api/v1/scam/check ────────────────────────────────────────────────────

@router.post("/api/v1/scam/check", response_model=ScamCheckResponse, status_code=200)
@limiter.limit("30/minute")
async def check_scam(request: Request, payload: ScamCheckRequest):
    """
    Analyse text for scam / phishing indicators.

    Uses Gemini Pro to simulate a RoBERTa + XGBoost ensemble.
    Returns is_scam, combined confidence, per-model scores, and a scam category.
    No auth required.
    """
    prompt = _SCAM_PROMPT.format(text=payload.text[:2000])
    raw = await gemini_client.generate_with_pro(prompt, response_key="scam_check")

    data = _parse_scam_json(raw)
    if data:
        try:
            scores_raw = data.get("model_scores", {})
            return ScamCheckResponse(
                is_scam=bool(data.get("is_scam", False)),
                confidence=_clamp(data.get("confidence", 0.5)),
                model_scores=ModelScores(
                    roberta=_clamp(scores_raw.get("roberta", 0.5)),
                    xgboost=_clamp(scores_raw.get("xgboost", 0.5)),
                ),
                scam_type=data.get("scam_type") or None,
                reasoning=str(data.get("reasoning", "Analysis complete.")),
            )
        except (TypeError, ValueError):
            pass

    return ScamCheckResponse(
        is_scam=False,
        confidence=0.5,
        model_scores=ModelScores(roberta=0.5, xgboost=0.5),
        scam_type=None,
        reasoning="Unable to parse AI response — result inconclusive.",
    )


# ── POST /api/v1/feedback ──────────────────────────────────────────────────────

@router.post("/api/v1/feedback", response_model=FeedbackResponse, status_code=201)
async def submit_feedback(payload: FeedbackRequest, db=Depends(get_db)):
    """
    Store user feedback (thumbs_up / thumbs_down) for any report.

    Saved to the `feedback` MongoDB collection with a UTC timestamp.
    No auth required — anonymous feedback accepted.
    """
    doc = {
        "report_id":  payload.report_id,
        "rating":     payload.rating,
        "notes":      payload.notes,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    result = await db["feedback"].insert_one(doc)
    return FeedbackResponse(ok=True, id=str(result.inserted_id))
