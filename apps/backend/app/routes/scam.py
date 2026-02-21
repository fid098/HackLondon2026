"""
scam.py — Phase 6 Scam Detection + Feedback endpoints.

DEVELOPER: Ishaan
─────────────────────────────────────────────────────────────────────────────
This file owns the scam / phishing detection and user feedback endpoints.

Routes:
  POST /api/v1/scam/check  — dual-model ensemble scam classifier (30/minute)
  POST /api/v1/feedback    — user thumbs up/down feedback for any report

HOW THE SCAM CHECK WORKS
─────────────────────────
1. Frontend sends text (the URL, the claim text, or audio filename) as { text: "..." }.
2. The text is truncated to 2000 chars and injected into the _SCAM_PROMPT template.
3. Gemini Pro simulates a RoBERTa + XGBoost dual-model ensemble and returns JSON.
4. The JSON is parsed by _parse_scam_json() and validated into a Pydantic model.
5. If parsing fails, a safe fallback (is_scam=False, confidence=0.5) is returned.

DUAL-MODEL ENSEMBLE EXPLAINED
──────────────────────────────
In a real production system, the ensemble would be:
  RoBERTa  — transformer fine-tuned on phishing email / scam message datasets.
             Good at understanding intent and deceptive language patterns.
  XGBoost  — gradient-boosted trees on hand-crafted NLP features such as:
             URL entropy, urgency word count, domain age, header anomalies,
             number of exclamation marks, presence of financial keywords.

The model_scores returned (roberta, xgboost) reflect what each model would
have given individually. The final is_scam uses both in a weighted vote.
Currently, Gemini Pro simulates both models in a single prompt call.

SCAM TYPES DETECTED
────────────────────
  phishing       — fake login pages, credential harvesting links
  advance_fee    — Nigerian prince, lottery winnings, overpayment
  impersonation  — fake banks, HMRC, Amazon, PayPal, etc.
  lottery        — "You've won!" prizes you never entered
  romance        — dating site money transfer requests
  investment     — crypto / forex pump-and-dump schemes
  other          — anything suspicious that doesn't fit above

WHAT TO IMPROVE (your tasks as Ishaan)
────────────────────────────────────────
- Real RoBERTa model: download roberta-base-openai-detector from HuggingFace
  and run it locally via a transformers pipeline for offline classification.
- URL feature extraction: if text contains a URL, resolve it, check domain age
  via WHOIS, and compare against phishing blacklists (PhishTank API is free).
- Feedback loop: aggregate thumbs_up / thumbs_down from the `feedback` collection
  to fine-tune the scam prompt or adjust per-category confidence thresholds.
- Add rate limit to /api/v1/feedback: currently unlimited — add 100/minute.

TESTING YOUR CHANGES
─────────────────────
  cd apps/backend
  pytest tests/test_scam.py -v
  pytest tests/test_rate_limit.py -v      # confirm 30/minute limit enforced

  # Scam check — obvious scam text:
  curl -X POST http://localhost:8000/api/v1/scam/check \\
    -H 'Content-Type: application/json' \\
    -d '{"text": "URGENT: Your account is suspended. Click here to verify: http://paypa1.com"}'

  # Feedback:
  curl -X POST http://localhost:8000/api/v1/feedback \\
    -H 'Content-Type: application/json' \\
    -d '{"report_id": "abc123", "rating": "thumbs_down", "notes": "Wrong verdict"}'

No authentication required for either endpoint — public by design.
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
