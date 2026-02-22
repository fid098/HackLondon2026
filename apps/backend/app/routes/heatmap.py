"""
heatmap.py - Phase 3 geospatial heatmap routes.

This route module serves dashboard data and accepts user-generated flags
from the browser extension so flagged AI content appears on the heatmap.
"""

import asyncio
import json
import logging
import random
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.core.database import get_db
from app.models.heatmap import (
    HeatmapEvent,
    HeatmapFlagRequest,
    HeatmapFlagResponse,
    HeatmapResponse,
    NarrativeItem,
    RegionStats,
    SimulateRequest,
    SimulateResponse,
    SpreadCity,
)
from app.services.stability_scorer import assess_event, assess_region

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/heatmap", tags=["heatmap"])


# Seed data for the hackathon demo. These are used as baseline values and
# can be replaced by real MongoDB aggregations later.
_EVENTS: list[HeatmapEvent] = [
    HeatmapEvent(
        cx=22,
        cy=38,
        label="New York",
        count=312,
        severity="high",
        category="Health",
        confidence_score=0.87,
        virality_score=1.4,
        trend="up",
        is_coordinated=True,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=16,
        cy=43,
        label="Los Angeles",
        count=198,
        severity="medium",
        category="Politics",
        confidence_score=0.74,
        virality_score=1.1,
        trend="up",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=47,
        cy=32,
        label="London",
        count=245,
        severity="high",
        category="Health",
        confidence_score=0.91,
        virality_score=1.6,
        trend="up",
        is_coordinated=True,
        is_spike_anomaly=True,
    ),
    HeatmapEvent(
        cx=49,
        cy=30,
        label="Berlin",
        count=134,
        severity="medium",
        category="Climate",
        confidence_score=0.68,
        virality_score=0.9,
        trend="same",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=53,
        cy=33,
        label="Moscow",
        count=389,
        severity="high",
        category="Politics",
        confidence_score=0.94,
        virality_score=2.1,
        trend="up",
        is_coordinated=True,
        is_spike_anomaly=True,
    ),
    HeatmapEvent(
        cx=72,
        cy=38,
        label="Beijing",
        count=521,
        severity="high",
        category="Science",
        confidence_score=0.82,
        virality_score=1.8,
        trend="up",
        is_coordinated=True,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=76,
        cy=44,
        label="Tokyo",
        count=287,
        severity="medium",
        category="Finance",
        confidence_score=0.71,
        virality_score=1.3,
        trend="same",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=70,
        cy=50,
        label="Delhi",
        count=403,
        severity="high",
        category="Health",
        confidence_score=0.85,
        virality_score=1.7,
        trend="up",
        is_coordinated=False,
        is_spike_anomaly=True,
    ),
    HeatmapEvent(
        cx=28,
        cy=60,
        label="Sao Paulo",
        count=176,
        severity="medium",
        category="Politics",
        confidence_score=0.69,
        virality_score=1.0,
        trend="same",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=50,
        cy=55,
        label="Cairo",
        count=218,
        severity="medium",
        category="Conflict",
        confidence_score=0.76,
        virality_score=1.2,
        trend="up",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=54,
        cy=62,
        label="Nairobi",
        count=92,
        severity="low",
        category="Health",
        confidence_score=0.62,
        virality_score=0.8,
        trend="down",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=55,
        cy=43,
        label="Tehran",
        count=267,
        severity="high",
        category="Conflict",
        confidence_score=0.89,
        virality_score=1.7,
        trend="up",
        is_coordinated=True,
        is_spike_anomaly=False,
    ),
    HeatmapEvent(
        cx=79,
        cy=67,
        label="Jakarta",
        count=145,
        severity="medium",
        category="Health",
        confidence_score=0.69,
        virality_score=1.1,
        trend="same",
        is_coordinated=False,
        is_spike_anomaly=False,
    ),
]

_REGIONS: list[RegionStats] = [
    RegionStats(name="North America", events=847, delta=12, severity="high"),
    RegionStats(name="Europe", events=623, delta=5, severity="medium"),
    RegionStats(name="Asia Pacific", events=1204, delta=31, severity="high"),
    RegionStats(name="South America", events=391, delta=-4, severity="medium"),
    RegionStats(name="Africa", events=278, delta=8, severity="low"),
    RegionStats(name="Middle East", events=512, delta=19, severity="high"),
]

_NARRATIVES: list[NarrativeItem] = [
    NarrativeItem(
        rank=1,
        title="Vaccine microchip conspiracy resurfaces ahead of flu season",
        category="Health",
        volume=14200,
        trend="up",
    ),
    NarrativeItem(
        rank=2,
        title="AI-generated election footage spreads across social platforms",
        category="Politics",
        volume=11800,
        trend="up",
    ),
    NarrativeItem(
        rank=3,
        title="Manipulated climate data graph shared by influencers",
        category="Climate",
        volume=9400,
        trend="up",
    ),
    NarrativeItem(
        rank=4,
        title="False banking collapse rumour triggers regional bank run",
        category="Finance",
        volume=7600,
        trend="down",
    ),
    NarrativeItem(
        rank=5,
        title="Doctored satellite images misidentify conflict zone locations",
        category="Conflict",
        volume=6300,
        trend="up",
    ),
    NarrativeItem(
        rank=6,
        title="Miracle cure claims spread via encrypted messaging apps",
        category="Health",
        volume=5100,
        trend="same",
    ),
]

# Structured feed items for the live WebSocket ticker.
# Each entry includes city/category/severity so the frontend can render

# color-coded intelligence cards without parsing the message string.
_FEED_ITEMS = [
    {"city": "Jakarta", "category": "Health", "severity": "medium", "verb": "New event detected"},
    {"city": "Washington DC", "category": "Politics", "severity": "high", "verb": "Spike alert"},
    {"city": "London", "category": "Finance", "severity": "high", "verb": "Cluster identified"},
    {"city": "Berlin", "category": "Climate", "severity": "medium", "verb": "Narrative variant"},
    {"city": "New York", "category": "Health", "severity": "high", "verb": "Agent verdict: FALSE"},
    {"city": "Tokyo", "category": "Science", "severity": "medium", "verb": "Trending narrative"},
    {"city": "Moscow", "category": "Politics", "severity": "high", "verb": "Coordinated activity"},
    {"city": "Delhi", "category": "Health", "severity": "high", "verb": "Spike anomaly detected"},
    {"city": "Beijing", "category": "Science", "severity": "high", "verb": "State-linked network"},
    {"city": "Tehran", "category": "Conflict", "severity": "high", "verb": "Narrative flagged"},
]

# Neighbor cities used by the /simulate endpoint for spread projection.
# Each entry is (city_name, base_spread_factor) - factor relative to origin count.
_SPREAD_NEIGHBOURS: dict[str, list[tuple[str, float]]] = {
    "New York": [("Boston", 0.45), ("Philadelphia", 0.38), ("Washington DC", 0.30), ("Chicago", 0.20)],
    "Los Angeles": [("San Francisco", 0.50), ("San Diego", 0.40), ("Las Vegas", 0.25), ("Phoenix", 0.18)],
    "London": [("Manchester", 0.55), ("Birmingham", 0.42), ("Amsterdam", 0.35), ("Dublin", 0.28)],
    "Berlin": [("Warsaw", 0.52), ("Hamburg", 0.45), ("Vienna", 0.38), ("Prague", 0.32)],
    "Moscow": [("St. Petersburg", 0.60), ("Minsk", 0.42), ("Kyiv", 0.30), ("Kazan", 0.25)],
    "Beijing": [("Shanghai", 0.65), ("Tianjin", 0.55), ("Chengdu", 0.35), ("Wuhan", 0.28)],
    "Tokyo": [("Osaka", 0.62), ("Nagoya", 0.50), ("Seoul", 0.28), ("Fukuoka", 0.22)],
    "Delhi": [("Mumbai", 0.55), ("Kolkata", 0.42), ("Bangalore", 0.38), ("Hyderabad", 0.30)],
    "Sao Paulo": [("Rio de Janeiro", 0.60), ("Brasilia", 0.35), ("Buenos Aires", 0.22), ("Lima", 0.18)],
    "Cairo": [("Alexandria", 0.65), ("Amman", 0.30), ("Riyadh", 0.22), ("Beirut", 0.18)],
    "Nairobi": [("Mombasa", 0.55), ("Addis Ababa", 0.32), ("Dar es Salaam", 0.28), ("Kampala", 0.20)],
    "Tehran": [("Isfahan", 0.60), ("Baghdad", 0.25), ("Kabul", 0.20), ("Ankara", 0.18)],
    "Jakarta": [("Surabaya", 0.62), ("Bandung", 0.55), ("Kuala Lumpur", 0.30), ("Singapore", 0.25)],
}


def _latlng_to_svg_percent(lat: float, lng: float) -> tuple[float, float]:
    """Convert lat/lng to equirectangular map percentages (0-100)."""
    cx = (lng + 180.0) / 360.0 * 100.0
    cy = (90.0 - lat) / 180.0 * 100.0
    return max(0.0, min(100.0, cx)), max(0.0, min(100.0, cy))


def _severity_from_confidence(confidence: int | None) -> str:
    if confidence is None:
        return "medium"
    if confidence >= 80:
        return "high"
    if confidence >= 50:
        return "medium"
    return "low"


def _pretty_platform_label(platform: str) -> str:
    name = (platform or "web").strip().lower()
    if name in {"x", "x.com", "twitter", "twitter.com"}:
        return "X / Twitter"
    if name in {"youtube", "youtube.com"}:
        return "YouTube"
    if name in {"instagram", "instagram.com"}:
        return "Instagram"
    if name in {"tiktok", "tiktok.com"}:
        return "TikTok"
    if name in {"telegram", "telegram.org"}:
        return "Telegram"
    return name.title()


@router.get("", response_model=HeatmapResponse)
async def get_heatmap(
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),
):
    """
    Return hotspot events, region stats, trending narratives, and total count.
    """
    _ = hours  # reserved for future DB time-window queries
    events = list(_EVENTS)
    regions = list(_REGIONS)
    narratives = list(_NARRATIVES)
    total = sum(r.events for r in regions)

    if db is not None:
        try:
            total += await db["reports"].count_documents({})
        except Exception as exc:
            logger.warning("Heatmap DB query failed: %s", exc)

    if category and category.lower() != "all":
        events = [e for e in events if e.category == category]
        narratives = [n for n in narratives if n.category == category]
        for i, narrative in enumerate(narratives):
            narrative.rank = i + 1

    # Add stability intelligence fields.
    events = [assess_event(e) for e in events]
    regions = [assess_region(r) for r in regions]

    return HeatmapResponse(
        events=events,
        regions=regions,
        narratives=narratives,
        total_events=total,
    )


@router.get("/regions", response_model=list[RegionStats])
async def get_regions(db=Depends(get_db)):
    """Return only the region-level summary cards."""
    _ = db
    return _REGIONS


@router.post("/flags", response_model=HeatmapFlagResponse, status_code=201)
async def submit_heatmap_flag(payload: HeatmapFlagRequest, db=Depends(get_db)):
    """
    Save a user-submitted suspected-AI flag and add it to heatmap events.
    """
    if payload.location is not None:
        cx, cy = _latlng_to_svg_percent(payload.location.lat, payload.location.lng)
        label = _pretty_platform_label(payload.platform)
        location_doc = {
            "type": "Point",
            "coordinates": [payload.location.lng, payload.location.lat],
        }
    else:
        cx, cy = 50.0, 50.0
        label = f"{_pretty_platform_label(payload.platform)} (unknown location)"
        location_doc = None

    event = HeatmapEvent(
        cx=round(cx, 2),
        cy=round(cy, 2),
        label=label,
        count=1,
        severity=_severity_from_confidence(payload.confidence),
        category=payload.category,
    )

    doc = {
        "source_url": payload.source_url,
        "platform": payload.platform,
        "category": payload.category,
        "reason": payload.reason,
        "confidence": payload.confidence,
        "location": location_doc,
        "event": event.model_dump(),
        "created_at": datetime.now(tz=timezone.utc).isoformat(),
    }

    inserted_id: str | None = None
    if db is not None:
        try:
            result = await db["heatmap_flags"].insert_one(doc)
            inserted_id = str(result.inserted_id)
        except Exception as exc:
            logger.warning("Failed to persist heatmap flag: %s", exc)

    # Keep a live in-memory list so users can immediately see new markers.
    _EVENTS.insert(0, event)
    if len(_EVENTS) > 400:
        del _EVENTS[400:]

    return HeatmapFlagResponse(ok=True, id=inserted_id, event=event)


@router.websocket("/stream")
async def heatmap_stream(websocket: WebSocket):
    """
    Push live ticker events over WebSocket every 3 seconds.
    """
    await websocket.accept()
    idx = 0
    try:
        while True:
            item = _FEED_ITEMS[idx % len(_FEED_ITEMS)]
            payload = {

                "type": "event",
                "message": f"{item['verb']} · {item['category']} · {item['city']}",
                "city": item["city"],
                "category": item["category"],
                "severity": item["severity"],
                "delta": random.randint(1, 8),

                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            }
            await websocket.send_text(json.dumps(payload))
            idx += 1
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        logger.info("Heatmap WebSocket client disconnected")
    except Exception as exc:
        logger.warning("Heatmap WebSocket error: %s", exc)


@router.post("/simulate", response_model=SimulateResponse)
async def simulate_spread(body: SimulateRequest):
    """
    Run a velocity-diffusion spread simulation for a single hotspot.
    """
    # Resolve origin event from seed data; synthesize if not found.
    event = next((e for e in _EVENTS if e.label == body.hotspot_label), None)
    if event is None:
        event = HeatmapEvent(
            label=body.hotspot_label or "Unknown",
            count=100,
            severity="medium",
            category=body.category or "General",
        )

    scored = assess_event(event)

    # Higher risk -> more certainty the narrative spreads.
    sim_confidence = round(
        max(0.40, min(0.95, 1.0 - (scored.reality_score or 50) / 100 * 0.55)),
        2,
    )

    virality = event.virality_score or 1.0
    horizon_factor = body.time_horizon_hours / 48.0

    neighbours = _SPREAD_NEIGHBOURS.get(event.label, [("Adjacent Region", 0.30)])
    projected = [
        SpreadCity(
            city=city,
            projectedCount=max(10, int(event.count * virality * factor * horizon_factor)),
        )
        for city, factor in neighbours[:4]
    ]

    return SimulateResponse(
        confidence=sim_confidence,
        model="velocity-diffusion-v2",
        projected_spread=projected,
    )
