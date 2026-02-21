"""
triage.py — Phase 4 Quick Triage endpoint (Chrome Extension).

Route:
  POST /api/v1/triage — single Gemini Flash call, no debate pipeline.

Unlike /factcheck (3-agent debate, ~10 s), this makes one Flash call (~1 s)
and is designed for the Chrome extension's real-time post scanning.
No authentication required — the extension triage is intentionally public.
"""

import json
import logging
import re

from fastapi import APIRouter
from pydantic import BaseModel, Field

from app.ai.gemini_client import gemini_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/triage", tags=["triage"])

_TRIAGE_PROMPT = """\
You are a fast AI fact-checker. Evaluate the text below and classify it.

TEXT:
{text}

Respond with valid JSON and nothing else:
{{
  "verdict": "<TRUE|FALSE|MISLEADING|UNVERIFIED|SATIRE>",
  "confidence": <integer 0-100>,
  "summary": "<one concise sentence>"
}}"""


class TriageRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=2000, description="Text to triage")


class TriageResponse(BaseModel):
    verdict: str     # TRUE | FALSE | MISLEADING | UNVERIFIED | SATIRE
    confidence: int  # 0–100
    summary: str


@router.post("", response_model=TriageResponse, status_code=200)
async def quick_triage(payload: TriageRequest):
    """
    Fast single-model fact-check using Gemini Flash.

    Returns verdict + confidence in ~1 s vs the full debate pipeline's ~10 s.
    Intended for Chrome extension content-script real-time triaging.
    No debate: one prompt → one JSON response → return.
    """
    prompt = _TRIAGE_PROMPT.format(text=payload.text[:2000])
    raw = await gemini_client.generate_with_flash(prompt, response_key="quick_triage")

    # Try to extract JSON block
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            data = json.loads(m.group())
            return TriageResponse(
                verdict=str(data.get("verdict", "UNVERIFIED")).upper(),
                confidence=max(0, min(100, int(data.get("confidence", 30)))),
                summary=str(data.get("summary", "Triage complete.")),
            )
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # Keyword fallback
    upper = raw.upper()
    for v in ("TRUE", "FALSE", "MISLEADING", "SATIRE"):
        if v in upper:
            return TriageResponse(verdict=v, confidence=50, summary=raw[:200])

    return TriageResponse(verdict="UNVERIFIED", confidence=20, summary="Unable to parse AI response.")
