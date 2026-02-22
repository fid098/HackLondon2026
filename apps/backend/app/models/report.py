"""
report.py — Pydantic schemas for fact-check reports.

FactCheckRequest  — what the client sends
FactCheckResponse — immediate response (report_id + full result)
ReportOut         — stored report retrieved from DB
DebateArtifact    — the Pro / Con / Judge exchange
"""

from datetime import datetime, timezone
from typing import Literal, Optional

from pydantic import BaseModel, Field, HttpUrl


# ── Source types ──────────────────────────────────────────────────────────────

SourceType = Literal["url", "text", "media"]
VerdictType = Literal["TRUE", "FALSE", "MISLEADING", "UNVERIFIED", "SATIRE"]


# ── Request ───────────────────────────────────────────────────────────────────

class FactCheckRequest(BaseModel):
    """Payload for POST /api/v1/factcheck."""
    source_type: SourceType = "text"
    # URL analysis
    url: Optional[str] = None
    # Text analysis
    text: Optional[str] = Field(default=None, max_length=50_000)
    # Media analysis (base64-encoded bytes + MIME type)
    media_b64: Optional[str] = None
    media_mime: Optional[str] = None
    # Optional user-supplied context
    context: Optional[str] = Field(default=None, max_length=2000)


# ── Debate artefact ───────────────────────────────────────────────────────────

class SourceCitation(BaseModel):
    title: str
    url: str = ""


class DebateArtifact(BaseModel):
    """Full debate exchange stored with each report."""
    claim_text: str
    pro_argument: str
    con_argument: str
    judge_reasoning: str
    pro_sources: list[SourceCitation] = Field(default_factory=list)
    con_sources: list[SourceCitation] = Field(default_factory=list)


# ── Report ────────────────────────────────────────────────────────────────────

class ReportOut(BaseModel):
    """A completed fact-check report."""
    id: str
    source_type: SourceType
    source_ref: str                        # URL or short descriptor
    verdict: VerdictType
    confidence: int = Field(ge=0, le=100)  # 0-100
    summary: str
    pro_points: list[str] = Field(default_factory=list)
    con_points: list[str] = Field(default_factory=list)
    sources: list[SourceCitation] = Field(default_factory=list)
    category: str = "General"
    debate: Optional[DebateArtifact] = None
    created_at: datetime
    user_id: Optional[str] = None


# ── Immediate response ────────────────────────────────────────────────────────

class FactCheckResponse(BaseModel):
    """Response body for POST /api/v1/factcheck."""
    report_id: str
    report: ReportOut


# ── List response ─────────────────────────────────────────────────────────────

class ReportListResponse(BaseModel):
    items: list[ReportOut]
    total: int
    page: int
    limit: int
    pages: int


# ── Save request (from frontend "Save to Reports" button) ────────────────────

class SaveReportRequest(BaseModel):
    """Client-side save — used when the frontend holds the result locally."""
    source_type: SourceType
    source_ref: str
    verdict: VerdictType
    confidence: int = Field(ge=0, le=100)
    summary: str
    pro_points: list[str] = Field(default_factory=list)
    con_points: list[str] = Field(default_factory=list)
    sources: list[SourceCitation] = Field(default_factory=list)
    category: str = "General"
