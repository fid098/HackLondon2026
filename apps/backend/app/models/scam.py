"""
scam.py — Pydantic models for Phase 6 Scam Detection + Feedback API.
"""

from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


# ── Scam check ────────────────────────────────────────────────────────────────

class ScamCheckRequest(BaseModel):
    """Text payload submitted for scam/phishing analysis."""

    text: str = Field(..., min_length=10, max_length=2000, description="Text to analyse for scam indicators")


class ModelScores(BaseModel):
    """Per-model confidence scores (0.0–1.0)."""

    roberta: float   # RoBERTa classifier score
    xgboost: float   # XGBoost classifier score


class ScamCheckResponse(BaseModel):
    """Result of scam detection analysis."""

    model_config = ConfigDict(protected_namespaces=())

    is_scam:      bool          # True = likely scam / phishing
    confidence:   float         # combined score 0.0–1.0
    model_scores: ModelScores   # individual model breakdown
    scam_type:    Optional[str] # 'phishing'|'advance_fee'|'impersonation'|'lottery'|'romance'|'investment'|'other'
    reasoning:    str           # brief explanation


# ── Feedback ──────────────────────────────────────────────────────────────────

class FeedbackRequest(BaseModel):
    """User feedback on a fact-check or scam verdict."""

    report_id: str  = Field(..., min_length=1, description="ID of the report being rated")
    rating:    str  = Field(..., pattern="^(thumbs_up|thumbs_down)$", description="thumbs_up or thumbs_down")
    notes:     Optional[str] = Field(default=None, max_length=500, description="Optional free-text comment")


class FeedbackResponse(BaseModel):
    """Confirmation that feedback was stored."""

    ok: bool
    id: str   # inserted document ObjectId
