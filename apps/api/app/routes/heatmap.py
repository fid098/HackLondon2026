"""
heatmap.py — Phase 3 geospatial heatmap routes.

Routes:
  GET  /api/v1/heatmap          — combined snapshot (events + regions + narratives)
  GET  /api/v1/heatmap/regions  — region stats only
  WS   /api/v1/heatmap/stream   — real-time event feed (simulates MongoDB Change Streams)

Data strategy:
  - When MongoDB is available the total event count is augmented with real report counts.
  - Hotspot positions and region stats use seeded representative data in all cases
    (real deployment would store lat/lng on each report and geo-aggregate).
  - The WebSocket stream pushes a new feed entry every 3 s, simulating Change Streams.
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
    HeatmapResponse,
    NarrativeItem,
    RegionStats,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/heatmap", tags=["heatmap"])


# ── Seed data (representative; replaced by real aggregation in production) ────

_EVENTS: list[HeatmapEvent] = [
    HeatmapEvent(cx=22,  cy=38,  label="New York",    count=312, severity="high",   category="Health"),
    HeatmapEvent(cx=16,  cy=43,  label="Los Angeles", count=198, severity="medium", category="Politics"),
    HeatmapEvent(cx=47,  cy=32,  label="London",      count=245, severity="high",   category="Health"),
    HeatmapEvent(cx=49,  cy=30,  label="Berlin",      count=134, severity="medium", category="Climate"),
    HeatmapEvent(cx=53,  cy=33,  label="Moscow",      count=389, severity="high",   category="Politics"),
    HeatmapEvent(cx=72,  cy=38,  label="Beijing",     count=521, severity="high",   category="Science"),
    HeatmapEvent(cx=76,  cy=44,  label="Tokyo",       count=287, severity="medium", category="Finance"),
    HeatmapEvent(cx=70,  cy=50,  label="Delhi",       count=403, severity="high",   category="Health"),
    HeatmapEvent(cx=28,  cy=60,  label="São Paulo",   count=176, severity="medium", category="Politics"),
    HeatmapEvent(cx=50,  cy=55,  label="Cairo",       count=218, severity="medium", category="Conflict"),
    HeatmapEvent(cx=54,  cy=62,  label="Nairobi",     count=92,  severity="low",    category="Health"),
    HeatmapEvent(cx=55,  cy=43,  label="Tehran",      count=267, severity="high",   category="Conflict"),
    HeatmapEvent(cx=79,  cy=67,  label="Jakarta",     count=145, severity="medium", category="Health"),
]

_REGIONS: list[RegionStats] = [
    RegionStats(name="North America", events=847,  delta=12,  severity="high"),
    RegionStats(name="Europe",        events=623,  delta=5,   severity="medium"),
    RegionStats(name="Asia Pacific",  events=1204, delta=31,  severity="high"),
    RegionStats(name="South America", events=391,  delta=-4,  severity="medium"),
    RegionStats(name="Africa",        events=278,  delta=8,   severity="low"),
    RegionStats(name="Middle East",   events=512,  delta=19,  severity="high"),
]

_NARRATIVES: list[NarrativeItem] = [
    NarrativeItem(rank=1, title="Vaccine microchip conspiracy resurfaces ahead of flu season",   category="Health",   volume=14200, trend="up"),
    NarrativeItem(rank=2, title="AI-generated election footage spreads across social platforms", category="Politics", volume=11800, trend="up"),
    NarrativeItem(rank=3, title="Manipulated climate data graph shared by influencers",          category="Climate",  volume=9400,  trend="up"),
    NarrativeItem(rank=4, title="False banking collapse rumour triggers regional bank run",      category="Finance",  volume=7600,  trend="down"),
    NarrativeItem(rank=5, title="Doctored satellite images misidentify conflict zone locations", category="Conflict", volume=6300,  trend="up"),
    NarrativeItem(rank=6, title="'Miracle cure' claims spread via encrypted messaging apps",    category="Health",   volume=5100,  trend="same"),
]

_FEED_ITEMS = [
    "New event detected · Health · Jakarta",
    "Spike alert · Politics · Washington DC (+34%)",
    "Cluster identified · Finance · London",
    "Narrative variant · Climate · Berlin",
    "Agent verdict: FALSE · Health · New York",
    "Trending narrative · Science · Tokyo",
]


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=HeatmapResponse)
async def get_heatmap(
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),
):
    """
    Return the combined heatmap snapshot: hotspot events, region stats,
    trending narratives, and global event count.

    Optionally filter by category.  The `hours` parameter is accepted for
    forward compatibility with real time-series queries.
    """
    events     = list(_EVENTS)
    regions    = list(_REGIONS)
    narratives = list(_NARRATIVES)
    total      = sum(r.events for r in regions)

    # Augment total with real report count when DB is available
    if db is not None:
        try:
            real_count = await db["reports"].count_documents({})
            total += real_count
        except Exception as exc:
            logger.warning("Heatmap DB query failed: %s", exc)

    # Server-side category filter
    if category and category.lower() != "all":
        events     = [e for e in events     if e.category == category]
        narratives = [n for n in narratives if n.category == category]
        # Re-rank after filter
        for i, n in enumerate(narratives):
            n.rank = i + 1

    return HeatmapResponse(
        events=events,
        regions=regions,
        narratives=narratives,
        total_events=total,
    )


@router.get("/regions", response_model=list[RegionStats])
async def get_regions(db=Depends(get_db)):
    """Return aggregated region statistics (no category filter)."""
    return _REGIONS


# ── WebSocket stream ──────────────────────────────────────────────────────────

@router.websocket("/stream")
async def heatmap_stream(websocket: WebSocket):
    """
    Push a new live-feed entry every 3 s.

    Message format:
      { "type": "event", "message": "...", "delta": <int>, "timestamp": "<ISO>" }

    In production this would be backed by MongoDB Change Streams on the
    `events` collection.  Here we cycle through representative feed strings
    to drive the UI ticker without a real DB.
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
