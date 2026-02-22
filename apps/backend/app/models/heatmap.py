"""
heatmap.py — Pydantic models for Heatmap API + Reality Stability Intelligence Layer.

Phase 1 additions
─────────────────
HeatmapEvent now carries both:
  • Legacy SVG coords (cx, cy) — kept for backward-compat with seed data
  • Geographic coords  (lat, lng) — used by the 3-D globe and future geo-queries

Intelligence scoring fields (all Optional — backend may omit them; the
frontend's intelligenceProvider.js always fills them in via realityScoring.js):
  • reality_score      0–100  (lower = more destabilised)
  • risk_level         LOW | MEDIUM | HIGH | CRITICAL
  • virality_score     normalised 0–10
  • dominant_narrative top narrative title for this hotspot / region
  • next_action        recommended response string
  • confidence_score   0–1 model confidence that events ARE misinformation

RegionStats also gains the three key intelligence fields so the region cards
in the UI can display them without a second API call.

MongoDB migration note
──────────────────────
When real aggregation replaces the seed data, each document in the
`heatmap_events` collection should have this shape:

  {
    "location": { "type": "Point", "coordinates": [lng, lat] },  ← 2dsphere
    "label": "New York",
    "count": 312,
    "severity": "high",
    "category": "Health",
    "confidence_score": 0.87,
    "virality_score": 1.4,
    "is_coordinated": false,
    "is_spike_anomaly": false,
    "trend": "up",
    "timestamp": ISODate("2026-02-22T00:00:00Z")
  }

The lat/lng fields in HeatmapEvent can then be populated directly from
`coordinates[1]` and `coordinates[0]` in the aggregation $project stage.
"""

from typing import Optional

from pydantic import BaseModel, Field


class HeatmapEvent(BaseModel):
    """A single geo-positioned misinformation hotspot."""

    # ── Legacy SVG map coordinates (0–100 %) ─────────────────────────────────
    # Kept for backward-compat while seed data still uses them.
    # Remove once the backend returns real lat/lng from MongoDB.
    cx: Optional[float] = None   # map x % (0-100, equirectangular)
    cy: Optional[float] = None   # map y % (0-100)

    # ── Geographic coordinates ────────────────────────────────────────────────
    # Preferred. The frontend's intelligenceProvider derives these from cx/cy
    # when not provided by the backend.
    lat: Optional[float] = None  # latitude  (-90 → +90)
    lng: Optional[float] = None  # longitude (-180 → +180)

    # ── Core event fields ─────────────────────────────────────────────────────
    label: str       # city / region label
    count: int       # event count in the observation window
    severity: str    # "high" | "medium" | "low"
    category: str    # Health | Politics | Finance | Science | Conflict | Climate | General

    # ── Signal characteristics ────────────────────────────────────────────────
    confidence_score: Optional[float] = None   # 0–1 model confidence (IS misinfo)
    virality_score:   Optional[float] = None   # raw spread multiplier (1.0 = baseline)
    trend:            Optional[str]   = None   # "up" | "down" | "same"
    is_coordinated:   Optional[bool]  = None   # inauthentic amplification detected
    is_spike_anomaly: Optional[bool]  = None   # count > 3σ rolling 7-day baseline

    # ── Intelligence scoring (computed by realityScoring.js on the frontend,
    #    or by stability_scorer.py on the backend in Phase 2) ─────────────────
    reality_score:      Optional[float] = None  # 0–100 stability score
    risk_level:         Optional[str]   = None  # LOW | MEDIUM | HIGH | CRITICAL
    dominant_narrative: Optional[str]   = None  # top narrative title for this hotspot
    next_action:        Optional[str]   = None  # recommended intervention


class RegionStats(BaseModel):
    """Aggregated statistics for a world region."""

    name: str        # e.g. "North America"
    events: int      # total events in last 24 h
    delta: int       # % change vs previous 24 h (positive = increase)
    severity: str    # "high" | "medium" | "low"

    # ── Intelligence scoring ──────────────────────────────────────────────────
    reality_score: Optional[float] = None  # 0–100 stability score
    risk_level:    Optional[str]   = None  # LOW | MEDIUM | HIGH | CRITICAL
    next_action:   Optional[str]   = None  # recommended intervention


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


class SimulateRequest(BaseModel):
    """Request body for POST /api/v1/heatmap/simulate."""
    hotspot_label:      Optional[str] = None
    category:           Optional[str] = None
    time_horizon_hours: int           = 48


class SpreadCity(BaseModel):
    """A projected spread city returned by the simulation."""
    city:           str
    projectedCount: int


class SimulateResponse(BaseModel):
    """Response shape for POST /api/v1/heatmap/simulate."""
    confidence:       float
    model:            str
    projected_spread: list[SpreadCity]


class StreamEvent(BaseModel):
    """Single frame pushed over the WebSocket stream."""

    type:      str            # "event"
    message:   str            # human-readable feed entry
    delta:     int            # count increment since last frame
    timestamp: str            # ISO-8601
    severity:  Optional[str] = None   # "high" | "medium" | "low"
    city:      Optional[str] = None   # originating city label
    category:  Optional[str] = None   # narrative category


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


class ArcLocation(BaseModel):
    """A single city location within a narrative arc."""

    lat: float
    lng: float
    city: str


class NarrativeArc(BaseModel):
    """A narrative that has spread to ≥2 cities — used to draw globe arcs."""

    narrative_id: str
    category: str
    strength: int            # total event count across all cities
    locations: list[ArcLocation]


# ── Atlas Vector Search + Aggregation models ──────────────────────────────────

class TrendPoint(BaseModel):
    """One hourly bucket in the event count time series."""

    hour: str            # ISO-8601 string, e.g. "2026-02-22T14:00:00Z"
    count: int           # total event count in that hour
    category: Optional[str] = None   # None when aggregated across all categories


class CategoryBreakdown(BaseModel):
    """Per-category aggregated statistics."""

    category: str
    total_events: int
    city_count: int        # distinct cities affected
    top_severity: str      # "high" | "medium" | "low" (worst seen in window)


class SearchRequest(BaseModel):
    """Request body for POST /api/v1/heatmap/search (vector search)."""

    query: str = Field(..., min_length=3, max_length=500,
                       description="Natural-language search query")
    category: Optional[str] = Field(
        default=None,
        description="Restrict results to this category (omit for all)",
    )
    limit: int = Field(default=5, ge=1, le=20,
                       description="Maximum number of results to return")
    collection: str = Field(
        default="narratives",
        description="Which collection to search: 'narratives' or 'events'",
    )


class SearchResult(BaseModel):
    """A single result from a vector search query."""

    id: str                          # MongoDB _id (stringified)
    title: str                       # narrative title or event label
    category: str
    score: float                     # cosine similarity [0.0 – 1.0]
    volume: Optional[int] = None     # narrative volume (narratives only)
    trend: Optional[str] = None      # "up" | "down" | "same"
    region: Optional[str] = None     # region label (events only)
    severity: Optional[str] = None   # severity (events only)
