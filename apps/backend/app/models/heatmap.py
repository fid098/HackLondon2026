"""
heatmap.py — Pydantic models for Phase 3 Heatmap API.
"""

from pydantic import BaseModel, Field


class HeatmapEvent(BaseModel):
    """A single geo-positioned misinformation hotspot (SVG map coordinates, 0–100)."""

    cx: float        # map x % (0-100, equirectangular)
    cy: float        # map y % (0-100)
    label: str       # city / region label
    count: int       # event count
    severity: str    # "high" | "medium" | "low"
    category: str    # Health | Politics | Finance | Science | Conflict | Climate | General


class RegionStats(BaseModel):
    """Aggregated statistics for a world region."""

    name: str        # e.g. "North America"
    events: int      # total events in last 24 h
    delta: int       # % change vs previous 24 h (positive = increase)
    severity: str    # "high" | "medium" | "low"


class NarrativeItem(BaseModel):
    """A trending misinformation narrative."""

    rank: int
    title: str
    category: str
    volume: int      # estimated reach / share count
    trend: str       # "up" | "down" | "same"


class HeatmapResponse(BaseModel):
    """Combined snapshot returned by GET /api/v1/heatmap."""

    events: list[HeatmapEvent]
    regions: list[RegionStats]
    narratives: list[NarrativeItem]
    total_events: int


class StreamEvent(BaseModel):
    """Single frame pushed over the WebSocket stream."""

    type: str             # "event"
    message: str          # human-readable feed entry
    delta: int            # count increment since last frame
    timestamp: str        # ISO-8601


class GeoPoint(BaseModel):
    """Lat/lng coordinates from user-reported flags."""

    lat: float = Field(..., ge=-90, le=90)
    lng: float = Field(..., ge=-180, le=180)


class HeatmapFlagRequest(BaseModel):
    """
    Payload sent by the extension when a user flags suspected AI content.
    """

    source_url: str = Field(..., min_length=5, max_length=3000)
    platform: str = Field(default="web", min_length=2, max_length=50)
    category: str = Field(default="Deepfake", min_length=2, max_length=50)
    reason: str = Field(default="user_suspected_ai_video", min_length=3, max_length=200)
    confidence: int | None = Field(default=None, ge=0, le=100)
    location: GeoPoint | None = None


class HeatmapFlagResponse(BaseModel):
    """API response after saving a user flag."""

    ok: bool
    id: str | None = None
    event: HeatmapEvent
