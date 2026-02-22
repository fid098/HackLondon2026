"""
youtube.py — Pydantic models for the YouTube AI-content detection API.
"""

from pydantic import BaseModel, Field


class YouTubeAnalysisRequest(BaseModel):
    url: str = Field(..., description="YouTube video URL (watch, youtu.be, or shorts)")


class YouTubeAnalysisResponse(BaseModel):
    video_id:             str
    title:                str
    channel:              str
    verdict:              str   # AI_GENERATED | HUMAN_CREATED | UNCERTAIN
    confidence:           int   # 0–100
    summary:              str
    ai_indicators:        list[str] = Field(default_factory=list)
    human_indicators:     list[str] = Field(default_factory=list)
    thumbnail_is_ai:      bool  = False
    thumbnail_confidence: float = 0.0
    defender_argument:    str   = ""
    prosecutor_argument:  str   = ""
    judge_reasoning:      str   = ""
    has_transcript:       bool  = False
    thumbnail_url:        str   = ""   # direct YouTube CDN URL for frontend display
