"""
heatmap.py - Phase 3 geospatial heatmap routes.

This route module serves the dashboard data and accepts user-generated flags
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
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/heatmap", tags=["heatmap"])


# Seed data for the hackathon demo. These are used as baseline values and
# can be replaced by real MongoDB aggregations later.
_EVENTS: list[HeatmapEvent] = [
    HeatmapEvent(cx=22, cy=38, label="New York", count=312, severity="high", category="Health"),
    HeatmapEvent(cx=16, cy=43, label="Los Angeles", count=198, severity="medium", category="Politics"),
    HeatmapEvent(cx=47, cy=32, label="London", count=245, severity="high", category="Health"),
    HeatmapEvent(cx=49, cy=30, label="Berlin", count=134, severity="medium", category="Climate"),
    HeatmapEvent(cx=53, cy=33, label="Moscow", count=389, severity="high", category="Politics"),
    HeatmapEvent(cx=72, cy=38, label="Beijing", count=521, severity="high", category="Science"),
    HeatmapEvent(cx=76, cy=44, label="Tokyo", count=287, severity="medium", category="Finance"),
    HeatmapEvent(cx=70, cy=50, label="Delhi", count=403, severity="high", category="Health"),
    HeatmapEvent(cx=28, cy=60, label="Sao Paulo", count=176, severity="medium", category="Politics"),
    HeatmapEvent(cx=50, cy=55, label="Cairo", count=218, severity="medium", category="Conflict"),
    HeatmapEvent(cx=54, cy=62, label="Nairobi", count=92, severity="low", category="Health"),
    HeatmapEvent(cx=55, cy=43, label="Tehran", count=267, severity="high", category="Conflict"),
    HeatmapEvent(cx=79, cy=67, label="Jakarta", count=145, severity="medium", category="Health"),
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

_FEED_ITEMS = [
    "New event detected · Health · Jakarta",
    "Spike alert · Politics · Washington DC (+34%)",
    "Cluster identified · Finance · London",
    "Narrative variant · Climate · Berlin",
    "Agent verdict: FALSE · Health · New York",
    "Trending narrative · Science · Tokyo",
]


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
            payload = {
                "type": "event",
                "message": _FEED_ITEMS[idx % len(_FEED_ITEMS)],
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

