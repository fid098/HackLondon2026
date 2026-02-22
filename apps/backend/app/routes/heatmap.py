"""
heatmap.py — Phase 3 Geospatial Heatmap routes.

DEVELOPER: Ayo
─────────────────────────────────────────────────────────────────────────────
This file owns everything heatmap-related on the backend.

Routes:
  GET  /api/v1/heatmap          — full snapshot: events + regions + narratives
  GET  /api/v1/heatmap/regions  — region stats only (lighter payload)
  WS   /api/v1/heatmap/stream   — real-time WebSocket feed (simulates Change Streams)

HOW THE DATA FLOWS
──────────────────
1. The frontend (Heatmap.jsx) calls GET /api/v1/heatmap on page load.
2. It also opens a WebSocket to /api/v1/heatmap/stream for live ticker updates.
3. This backend file returns seed data for now. In production, the _EVENTS and
   _REGIONS lists would be built from real MongoDB documents using geospatial
   queries (e.g. $geoNear, $group by city).
4. The WebSocket pushes a new ticker message every 3 seconds.

WHAT TO IMPROVE (your tasks as Ayo)
────────────────────────────────────
- Replace seed _EVENTS with a real MongoDB $geoNear aggregation on the
  reports collection (each report should store a lat/lng point).
- Replace seed _REGIONS with a $group aggregation over continent bounding boxes.
- Swap the WebSocket fake interval for a real MongoDB Change Stream cursor
  (Motor supports collection.watch() for async change streams).
- Add a ?category=Health query param filter that runs at the DB level.
- Store heatmap events in their own heatmap_events collection so they persist.

MONGO GEOSPATIAL CHEAT SHEET
──────────────────────────────
  # Add a 2dsphere index (run once in MongoDB shell or seed script):
  db.reports.createIndex({ location: "2dsphere" })

  # Document shape for a geo-tagged report:
  { "location": { "type": "Point", "coordinates": [-73.98, 40.74] }, ... }

  # Motor query to find nearby events:
  cursor = db["reports"].find({
      "location": {
          "$nearSphere": {
              "$geometry": { "type": "Point", "coordinates": [lng, lat] },
              "$maxDistance": 500000   # 500 km in metres
          }
      }
  })

  # Motor Change Stream (for live updates):
  async with db["heatmap_events"].watch() as stream:
      async for change in stream:
          await websocket.send_text(json.dumps(change))

TESTING YOUR CHANGES
─────────────────────
  cd apps/backend
  pytest tests/test_heatmap.py -v

  # Manual test with curl:
  curl http://localhost:8000/api/v1/heatmap
  curl "http://localhost:8000/api/v1/heatmap?category=Health"
  curl http://localhost:8000/api/v1/heatmap/regions

  # WebSocket test (install wscat: npm i -g wscat):
  wscat -c ws://localhost:8000/api/v1/heatmap/stream
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
    SimulateRequest,
    SimulateResponse,
    SpreadCity,
)
from app.services.stability_scorer import assess_event, assess_region

logger = logging.getLogger(__name__)

# All heatmap routes are grouped under /api/v1/heatmap.
# The prefix is applied here so every route in this file inherits it automatically.
router = APIRouter(prefix="/api/v1/heatmap", tags=["heatmap"])


# ── Seed data ─────────────────────────────────────────────────────────────────
#
# These are representative placeholder values.
# Replace with real MongoDB aggregation queries once the database has
# geo-indexed report documents.
#
# HeatmapEvent fields:
#   cx, cy     — SVG percentage coordinates (0-100) for the world map render
#   label      — city name shown in the hover tooltip
#   count      — number of misinformation events detected near this city
#   severity   — "high" | "medium" | "low" (controls dot colour on the map)
#   category   — used for the category filter pills in the UI

_EVENTS: list[HeatmapEvent] = [
    HeatmapEvent(cx=22, cy=38, label="New York",    count=312, severity="high",   category="Health",
                 confidence_score=0.87, virality_score=1.4, trend="up",   is_coordinated=True,  is_spike_anomaly=False),
    HeatmapEvent(cx=16, cy=43, label="Los Angeles", count=198, severity="medium", category="Politics",
                 confidence_score=0.74, virality_score=1.1, trend="up",   is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=47, cy=32, label="London",      count=245, severity="high",   category="Health",
                 confidence_score=0.91, virality_score=1.6, trend="up",   is_coordinated=True,  is_spike_anomaly=True),
    HeatmapEvent(cx=49, cy=30, label="Berlin",      count=134, severity="medium", category="Climate",
                 confidence_score=0.68, virality_score=0.9, trend="same", is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=53, cy=33, label="Moscow",      count=389, severity="high",   category="Politics",
                 confidence_score=0.94, virality_score=2.1, trend="up",   is_coordinated=True,  is_spike_anomaly=True),
    HeatmapEvent(cx=72, cy=38, label="Beijing",     count=521, severity="high",   category="Science",
                 confidence_score=0.82, virality_score=1.8, trend="up",   is_coordinated=True,  is_spike_anomaly=False),
    HeatmapEvent(cx=76, cy=44, label="Tokyo",       count=287, severity="medium", category="Finance",
                 confidence_score=0.71, virality_score=1.3, trend="same", is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=70, cy=50, label="Delhi",       count=403, severity="high",   category="Health",
                 confidence_score=0.85, virality_score=1.7, trend="up",   is_coordinated=False, is_spike_anomaly=True),
    HeatmapEvent(cx=28, cy=60, label="Sao Paulo",   count=176, severity="medium", category="Politics",
                 confidence_score=0.69, virality_score=1.0, trend="same", is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=50, cy=55, label="Cairo",       count=218, severity="medium", category="Conflict",
                 confidence_score=0.76, virality_score=1.2, trend="up",   is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=54, cy=62, label="Nairobi",     count=92,  severity="low",    category="Health",
                 confidence_score=0.62, virality_score=0.8, trend="down", is_coordinated=False, is_spike_anomaly=False),
    HeatmapEvent(cx=55, cy=43, label="Tehran",      count=267, severity="high",   category="Conflict",
                 confidence_score=0.89, virality_score=1.7, trend="up",   is_coordinated=True,  is_spike_anomaly=False),
    HeatmapEvent(cx=79, cy=67, label="Jakarta",     count=145, severity="medium", category="Health",
                 confidence_score=0.69, virality_score=1.1, trend="same", is_coordinated=False, is_spike_anomaly=False),
]

# RegionStats fields:
#   name     — continent / macro-region label
#   events   — total event count in the last 24 h (from DB aggregation in production)
#   delta    — percentage change vs previous 24 h (positive = more misinformation)
#   severity — worst severity level in this region
_REGIONS: list[RegionStats] = [
    RegionStats(name="North America", events=847,  delta=12,  severity="high"),
    RegionStats(name="Europe",        events=623,  delta=5,   severity="medium"),
    RegionStats(name="Asia Pacific",  events=1204, delta=31,  severity="high"),
    RegionStats(name="South America", events=391,  delta=-4,  severity="medium"),
    RegionStats(name="Africa",        events=278,  delta=8,   severity="low"),
    RegionStats(name="Middle East",   events=512,  delta=19,  severity="high"),
]

# NarrativeItem fields:
#   rank     — position in trending table (recalculated after category filter)
#   title    — human-readable headline of the misinformation narrative
#   category — matches the category filter pill labels in the UI
#   volume   — number of social media posts / shares carrying this narrative
#   trend    — "up" | "down" | "same" (shown as arrows in the table)
_NARRATIVES: list[NarrativeItem] = [
    NarrativeItem(rank=1, title="Vaccine microchip conspiracy resurfaces ahead of flu season",   category="Health",   volume=14200, trend="up"),
    NarrativeItem(rank=2, title="AI-generated election footage spreads across social platforms", category="Politics", volume=11800, trend="up"),
    NarrativeItem(rank=3, title="Manipulated climate data graph shared by influencers",          category="Climate",  volume=9400,  trend="up"),
    NarrativeItem(rank=4, title="False banking collapse rumour triggers regional bank run",      category="Finance",  volume=7600,  trend="down"),
    NarrativeItem(rank=5, title="Doctored satellite images misidentify conflict zone locations", category="Conflict", volume=6300,  trend="up"),
    NarrativeItem(rank=6, title="Miracle cure claims spread via encrypted messaging apps",       category="Health",   volume=5100,  trend="same"),
]

# Structured feed items for the live WebSocket ticker.
# Each entry includes city/category/severity so the frontend can render
# colour-coded intelligence cards without parsing the message string.
_FEED_ITEMS = [
    {"city": "Jakarta",       "category": "Health",   "severity": "medium", "verb": "New event detected"},
    {"city": "Washington DC", "category": "Politics", "severity": "high",   "verb": "Spike alert"},
    {"city": "London",        "category": "Finance",  "severity": "high",   "verb": "Cluster identified"},
    {"city": "Berlin",        "category": "Climate",  "severity": "medium", "verb": "Narrative variant"},
    {"city": "New York",      "category": "Health",   "severity": "high",   "verb": "Agent verdict: FALSE"},
    {"city": "Tokyo",         "category": "Science",  "severity": "medium", "verb": "Trending narrative"},
    {"city": "Moscow",        "category": "Politics", "severity": "high",   "verb": "Coordinated activity"},
    {"city": "Delhi",         "category": "Health",   "severity": "high",   "verb": "Spike anomaly detected"},
    {"city": "Beijing",       "category": "Science",  "severity": "high",   "verb": "State-linked network"},
    {"city": "Tehran",        "category": "Conflict", "severity": "high",   "verb": "Narrative flagged"},
]

# Neighbour cities used by the /simulate endpoint for spread projection.
# Each entry is (city_name, base_spread_factor) — factor relative to origin count.
_SPREAD_NEIGHBOURS: dict[str, list[tuple[str, float]]] = {
    "New York":    [("Boston", 0.45), ("Philadelphia", 0.38), ("Washington DC", 0.30), ("Chicago", 0.20)],
    "Los Angeles": [("San Francisco", 0.50), ("San Diego", 0.40), ("Las Vegas", 0.25), ("Phoenix", 0.18)],
    "London":      [("Manchester", 0.55), ("Birmingham", 0.42), ("Amsterdam", 0.35), ("Dublin", 0.28)],
    "Berlin":      [("Warsaw", 0.52), ("Hamburg", 0.45), ("Vienna", 0.38), ("Prague", 0.32)],
    "Moscow":      [("St. Petersburg", 0.60), ("Minsk", 0.42), ("Kyiv", 0.30), ("Kazan", 0.25)],
    "Beijing":     [("Shanghai", 0.65), ("Tianjin", 0.55), ("Chengdu", 0.35), ("Wuhan", 0.28)],
    "Tokyo":       [("Osaka", 0.62), ("Nagoya", 0.50), ("Seoul", 0.28), ("Fukuoka", 0.22)],
    "Delhi":       [("Mumbai", 0.55), ("Kolkata", 0.42), ("Bangalore", 0.38), ("Hyderabad", 0.30)],
    "Sao Paulo":   [("Rio de Janeiro", 0.60), ("Brasilia", 0.35), ("Buenos Aires", 0.22), ("Lima", 0.18)],
    "Cairo":       [("Alexandria", 0.65), ("Amman", 0.30), ("Riyadh", 0.22), ("Beirut", 0.18)],
    "Nairobi":     [("Mombasa", 0.55), ("Addis Ababa", 0.32), ("Dar es Salaam", 0.28), ("Kampala", 0.20)],
    "Tehran":      [("Isfahan", 0.60), ("Baghdad", 0.25), ("Kabul", 0.20), ("Ankara", 0.18)],
    "Jakarta":     [("Surabaya", 0.62), ("Bandung", 0.55), ("Kuala Lumpur", 0.30), ("Singapore", 0.25)],
}


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("", response_model=HeatmapResponse)
async def get_heatmap(
    # Optional category filter — omit to get all categories.
    # Valid values: Health, Politics, Finance, Science, Conflict, Climate
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    # Time window — accepted for forward-compatibility with real time-series queries.
    # Currently ignored; will drive the real DB aggregation pipeline later.
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),  # injected MongoDB database handle (or None if DB is down)
):
    """
    Return the combined heatmap snapshot: hotspot events, region stats,
    trending narratives, and global event count.

    Called by the frontend on page load and when the user clicks a category filter.

    Response shape (HeatmapResponse Pydantic model):
      events        : list of HeatmapEvent — hotspot markers for the SVG world map
      regions       : list of RegionStats  — continent-level stats for the region cards
      narratives    : list of NarrativeItem — ranked trending narratives for the table
      total_events  : int — global counter shown in the top-right badge
    """
    # Start with in-memory seed lists (shallow copies to avoid mutating the originals)
    events     = list(_EVENTS)
    regions    = list(_REGIONS)
    narratives = list(_NARRATIVES)

    # Sum region event counts for the default total.
    # In production this should be a single MongoDB count_documents() call.
    total = sum(r.events for r in regions)

    # Augment total_events with the actual number of saved analysis reports when
    # the database is reachable — gives a live feel without full geo-aggregation.
    if db is not None:
        try:
            real_count = await db["reports"].count_documents({})
            total += real_count
        except Exception as exc:
            # DB error is non-fatal — fall back to seed data gracefully.
            logger.warning("Heatmap DB query failed: %s", exc)

    # Apply server-side category filter when the user selects a category pill.
    # The frontend also filters client-side, but doing it here reduces payload size.
    if category and category.lower() != "all":
        events     = [e for e in events     if e.category == category]
        narratives = [n for n in narratives if n.category == category]
        # Re-rank narratives so the table always starts at #1 after filtering
        for i, n in enumerate(narratives):
            n.rank = i + 1

    # ── Phase 2: Enrich with Reality Stability scores ──────────────────────────
    # assess_event() populates reality_score, risk_level, and next_action on
    # each event. assess_region() does the same for region cards.
    # These are deterministic and fast (pure computation, no I/O).
    events  = [assess_event(e)  for e in events]
    regions = [assess_region(r) for r in regions]

    return HeatmapResponse(
        events=events,
        regions=regions,
        narratives=narratives,
        total_events=total,
    )


@router.get("/regions", response_model=list[RegionStats])
async def get_regions(db=Depends(get_db)):
    """
    Return only the continent-level region statistics.

    A lighter endpoint for components that only need the region cards,
    not the full hotspot + narrative payload.
    """
    return _REGIONS


# ── WebSocket live feed ────────────────────────────────────────────────────────
#
# This WebSocket endpoint drives the "LIVE" ticker strip at the top of the
# heatmap page. It pushes a new message every 3 seconds.
#
# Ayo — to wire this to real MongoDB Change Streams:
#   1. Create a heatmap_events collection and insert a document whenever
#      a new report is saved (hook into the factcheck route's DB save step).
#   2. Open a Motor change stream cursor: db["heatmap_events"].watch()
#   3. For each change, build the payload dict and call websocket.send_text().
#   4. Handle WebSocketDisconnect to cleanly close the cursor.

@router.websocket("/stream")
async def heatmap_stream(websocket: WebSocket):
    """
    Push a new live-feed entry every 3 seconds over WebSocket.

    Message format (JSON string):
      {
        "type":      "event",
        "message":   "Spike alert · Politics · Washington DC (+34%)",
        "delta":     3,           // how many new events to add to the counter
        "timestamp": "2026-02-21T18:00:00+00:00"
      }

    The frontend reads:
      - "message" → ticker text that fades in at the top of the page
      - "delta"   → added to the running totalEvents counter in state

    In production, replace the asyncio.sleep loop with a MongoDB Change Stream
    cursor using Motor's async context manager.
    """
    await websocket.accept()
    idx = 0
    try:
        while True:
            item = _FEED_ITEMS[idx % len(_FEED_ITEMS)]
            payload = {
                "type":      "event",
                "message":   f"{item['verb']} · {item['category']} · {item['city']}",
                "city":      item["city"],
                "category":  item["category"],
                "severity":  item["severity"],
                "delta":     random.randint(1, 8),
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            }
            await websocket.send_text(json.dumps(payload))
            idx += 1
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        logger.info("Heatmap WebSocket client disconnected")
    except Exception as exc:
        logger.warning("Heatmap WebSocket error: %s", exc)


# ── Predictive spread simulation ───────────────────────────────────────────────

@router.post("/simulate", response_model=SimulateResponse)
async def simulate_spread(body: SimulateRequest):
    """
    Run a velocity-diffusion spread simulation for a single hotspot.

    Uses the hotspot's intelligence-scored reality_score and virality_score
    to project how many events will surface in neighbouring cities over the
    requested time horizon.

    Request body:
      hotspot_label       — label of the origin hotspot (must match a seed event)
      category            — used to synthesise an event when label is unknown
      time_horizon_hours  — projection window (default 48 h)

    Response:
      confidence          — simulation confidence (0–1), inversely proportional
                            to reality_score (more destabilised = higher certainty)
      model               — model identifier string
      projected_spread    — list of { city, projectedCount } sorted by impact desc
    """
    # Resolve origin event from seed data; synthesise if not found
    event = next((e for e in _EVENTS if e.label == body.hotspot_label), None)
    if event is None:
        event = HeatmapEvent(
            label=body.hotspot_label or "Unknown",
            count=100,
            severity="medium",
            category=body.category or "General",
        )

    scored = assess_event(event)

    # Simulation confidence: higher risk → more certain the misinfo will spread
    sim_confidence = round(
        max(0.40, min(0.95, 1.0 - (scored.reality_score or 50) / 100 * 0.55)),
        2,
    )

    virality       = event.virality_score or 1.0
    horizon_factor = body.time_horizon_hours / 48.0

    neighbours = _SPREAD_NEIGHBOURS.get(event.label, [("Adjacent Region", 0.30)])
    projected  = [
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
