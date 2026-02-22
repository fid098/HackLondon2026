"""
heatmap.py - Phase 3 geospatial heatmap routes.

This route module serves dashboard data and accepts user-generated flags
from the browser extension so flagged AI content appears on the heatmap.
"""

import asyncio
import json
import logging
import random
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect

from app.core.database import db_client, get_db
from app.models.heatmap import (
    ArcLocation,
    CategoryBreakdown,
    HeatmapEvent,
    HeatmapFlagRequest,
    HeatmapFlagResponse,
    HeatmapResponse,
    NarrativeArc,
    NarrativeItem,
    RegionStats,
    SearchRequest,
    SearchResult,
    SimulateRequest,
    SimulateResponse,
    SpreadCity,
    TrendPoint,
)
from app.services.stability_scorer import assess_event, assess_region

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/heatmap", tags=["heatmap"])


# Seed data for the hackathon demo. These are used as baseline values and
# can be replaced by real MongoDB aggregations later.
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
# colour-coded intelligence cards without parsing the message string.
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


# ── MongoDB Atlas aggregation helpers ─────────────────────────────────────────
# These replace the in-memory seed lists when Atlas is reachable.
# All helpers return [] / None on any error so the route falls back to seed data.

async def _build_events_from_db(
    db, category: Optional[str] = None, hours: int = 24
) -> list[HeatmapEvent]:
    """Aggregate heatmap_events collection into HeatmapEvent objects."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    match: dict = {"timestamp": {"$gte": cutoff}}
    if category and category.lower() != "all":
        match["category"] = category

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id":              "$label",
            "lat":              {"$first": {"$arrayElemAt": ["$location.coordinates", 1]}},
            "lng":              {"$first": {"$arrayElemAt": ["$location.coordinates", 0]}},
            "count":            {"$sum":   "$count"},
            "severity":         {"$first": "$severity"},
            "category":         {"$first": "$category"},
            "confidence_score": {"$avg":   "$confidence_score"},
            "virality_score":   {"$avg":   "$virality_score"},
            "trend":            {"$last":  "$trend"},
            "is_coordinated":   {"$first": "$is_coordinated"},
            "is_spike_anomaly": {"$first": "$is_spike_anomaly"},
        }},
        {"$project": {
            "_id":              0,
            "label":            "$_id",
            "lat":              1,
            "lng":              1,
            "count":            1,
            "severity":         1,
            "category":         1,
            "confidence_score": 1,
            "virality_score":   1,
            "trend":            1,
            "is_coordinated":   1,
            "is_spike_anomaly": 1,
        }},
        {"$sort": {"count": -1}},
        {"$limit": 50},
    ]

    docs = await db["heatmap_events"].aggregate(pipeline).to_list(length=50)
    return [HeatmapEvent(**d) for d in docs]


async def _build_regions_from_db(db, hours: int = 24) -> list[RegionStats]:
    """Aggregate heatmap_events by region and compute delta vs prior window."""
    now = datetime.now(tz=timezone.utc)
    cutoff = now - timedelta(hours=hours)
    prev_cutoff = cutoff - timedelta(hours=hours)

    current_pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id":      "$region",
            "events":   {"$sum": "$count"},
            "severity": {"$first": "$severity"},
        }},
    ]
    prev_pipeline = [
        {"$match": {"timestamp": {"$gte": prev_cutoff, "$lt": cutoff}}},
        {"$group": {
            "_id":    "$region",
            "events": {"$sum": "$count"},
        }},
    ]

    current_docs = await db["heatmap_events"].aggregate(current_pipeline).to_list(None)
    prev_docs    = await db["heatmap_events"].aggregate(prev_pipeline).to_list(None)

    current = {d["_id"]: d for d in current_docs}
    prev    = {d["_id"]: d for d in prev_docs}

    results: list[RegionStats] = []
    for name, cur in current.items():
        if not name:
            continue
        prev_events = prev.get(name, {}).get("events", cur["events"] or 1)
        delta = round(((cur["events"] - prev_events) / max(prev_events, 1)) * 100)
        results.append(RegionStats(
            name=name,
            events=cur["events"],
            delta=delta,
            severity=cur.get("severity", "low"),
        ))

    return sorted(results, key=lambda r: r.events, reverse=True)


async def _build_arcs_from_db(
    db, category: Optional[str] = None, hours: int = 24
) -> list[NarrativeArc]:
    """Find narratives that appear in ≥2 cities and return arc data."""
    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    match: dict = {
        "timestamp":    {"$gte": cutoff},
        "narrative_ids": {"$exists": True, "$not": {"$size": 0}},
    }
    if category and category.lower() != "all":
        match["category"] = category

    pipeline = [
        {"$match": match},
        {"$unwind": "$narrative_ids"},
        {"$group": {
            "_id":      "$narrative_ids",
            "category": {"$first": "$category"},
            "strength": {"$sum":   "$count"},
            "locations": {"$addToSet": {
                "lat":  {"$arrayElemAt": ["$location.coordinates", 1]},
                "lng":  {"$arrayElemAt": ["$location.coordinates", 0]},
                "city": "$label",
            }},
        }},
        # Only keep arcs that span ≥2 distinct cities
        {"$match": {"locations.1": {"$exists": True}}},
        {"$sort": {"strength": -1}},
        {"$limit": 40},
    ]

    docs = await db["heatmap_events"].aggregate(pipeline).to_list(length=40)
    arcs: list[NarrativeArc] = []
    for d in docs:
        locations = [ArcLocation(**loc) for loc in d.get("locations", [])]
        arcs.append(NarrativeArc(
            narrative_id=d["_id"],
            category=d.get("category", "General"),
            strength=d.get("strength", 0),
            locations=locations,
        ))
    return arcs


@router.get("", response_model=HeatmapResponse)
async def get_heatmap(
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),
):
    """
    Return hotspot events, region stats, trending narratives, and total count.
    Pulls from MongoDB Atlas when connected; gracefully falls back to seed data.
    """
    # ── Try Atlas aggregation ─────────────────────────────────────────────────
    events: list[HeatmapEvent] = []
    regions: list[RegionStats] = []
    if db is not None:
        try:
            events  = await _build_events_from_db(db, category=category, hours=hours)
            regions = await _build_regions_from_db(db, hours=hours)
        except Exception as exc:
            logger.warning("Atlas aggregation failed, using seed data: %s", exc)
            events, regions = [], []

    # ── Fall back to seed data when Atlas returns nothing ─────────────────────
    if not events:
        events = list(_EVENTS)
        if category and category.lower() != "all":
            events = [e for e in events if e.category == category]

    if not regions:
        regions = list(_REGIONS)

    # ── Narratives always start from seed (DB narratives TBD) ────────────────
    narratives = list(_NARRATIVES)
    if category and category.lower() != "all":
        narratives = [n for n in narratives if n.category == category]
        for i, narrative in enumerate(narratives):
            narrative.rank = i + 1

    # ── Total event count ─────────────────────────────────────────────────────
    total = sum(r.events for r in regions)
    if db is not None:
        try:
            total += await db["reports"].count_documents({})
        except Exception as exc:
            logger.warning("Heatmap DB query failed: %s", exc)

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
async def get_regions(
    hours: int = Query(default=24, ge=1, le=168),
    db=Depends(get_db),
):
    """Return region-level summary cards (Atlas aggregation when available)."""
    if db is not None:
        try:
            regions = await _build_regions_from_db(db, hours=hours)
            if regions:
                return [assess_region(r) for r in regions]
        except Exception as exc:
            logger.warning("Regions aggregation failed, using seed data: %s", exc)
    return [assess_region(r) for r in _REGIONS]


@router.get("/arcs", response_model=list[NarrativeArc])
async def get_heatmap_arcs(
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),
):
    """
    Return narrative spread arcs — narratives that appear in ≥2 cities.
    Used by the frontend globe to draw arc lines between affected cities.
    Returns an empty list when no multi-city narratives are found.
    """
    if db is None:
        return []
    try:
        return await _build_arcs_from_db(db, category=category, hours=hours)
    except Exception as exc:
        logger.warning("Arcs aggregation failed: %s", exc)
        return []


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
    Push live ticker events over WebSocket.

    Strategy:
    1. Try MongoDB Change Streams (requires Atlas M10+ cluster).
       Sends a message for every new document inserted into heatmap_events.
    2. If Change Streams are unavailable (M0 free tier, network error, or DB
       not connected), fall back to the structured mock-feed loop (3-second
       interval), which is identical to the pre-Atlas behaviour.
    """
    await websocket.accept()

    # Access the motor db directly — WebSocket handlers can't use Depends()
    live_db = db_client.db

    if live_db is not None:
        try:
            async with live_db["heatmap_events"].watch(
                pipeline=[{"$match": {"operationType": "insert"}}],
                full_document="updateLookup",
            ) as stream:
                logger.info("Heatmap WebSocket: Change Stream connected")
                async for change in stream:
                    doc = change.get("fullDocument", {})
                    payload = {
                        "type":      "event",
                        "message":   f"New signal · {doc.get('category', '?')} · {doc.get('label', '?')}",
                        "city":      doc.get("label", "Unknown"),
                        "category":  doc.get("category", "General"),
                        "severity":  doc.get("severity", "medium"),
                        "delta":     doc.get("count", 1),
                        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                    }
                    await websocket.send_text(json.dumps(payload))
            # Stream ended cleanly (client disconnected handled by inner loop)
            return
        except WebSocketDisconnect:
            logger.info("Heatmap WebSocket client disconnected (Change Stream)")
            return
        except Exception as exc:
            # OperationFailure on M0 free tier: "Change Streams not supported"
            logger.info(
                "Change Streams unavailable (%s) — switching to mock feed", type(exc).__name__
            )
            # Fall through to mock loop below

    # ── Mock feed fallback (M0 tier / DB unavailable) ─────────────────────────
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
        logger.info("Heatmap WebSocket client disconnected (mock feed)")
    except Exception as exc:
        logger.warning("Heatmap WebSocket error: %s", exc)



# ── Predictive spread simulation ───────────────────────────────────────────────

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


# ── Atlas Aggregation: hourly trend time series ────────────────────────────────

@router.get("/trends", response_model=list[TrendPoint])
async def get_trends(
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    category: Optional[str] = Query(default=None, description="Filter by category (omit for all)"),
    db=Depends(get_db),
):
    """
    Return hourly event-count buckets for the requested time window.

    Used by the frontend to render a sparkline or bar chart showing how
    misinformation volume changed over time.  Each point is one hour.

    Aggregation path: heatmap_events → $match(time+category) → $group(by hour)
    Falls back to an empty list if the collection is unavailable.
    """
    if db is None:
        return []

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    match: dict = {"timestamp": {"$gte": cutoff}}
    if category and category.lower() != "all":
        match["category"] = category

    pipeline = [
        {"$match": match},
        {"$group": {
            "_id": {
                "hour": {"$dateToString": {
                    "format": "%Y-%m-%dT%H:00:00Z",
                    "date":   "$timestamp",
                }},
                "category": "$category",
            },
            "count": {"$sum": "$count"},
        }},
        {"$project": {
            "_id":      0,
            "hour":     "$_id.hour",
            "category": "$_id.category",
            "count":    1,
        }},
        {"$sort": {"hour": 1}},
    ]

    try:
        docs = await db["heatmap_events"].aggregate(pipeline).to_list(None)
        return [TrendPoint(**d) for d in docs]
    except Exception as exc:
        logger.warning("Trends aggregation failed: %s", exc)
        return []


# ── Atlas Aggregation: per-category breakdown ─────────────────────────────────

@router.get("/categories", response_model=list[CategoryBreakdown])
async def get_category_breakdown(
    hours: int = Query(default=24, ge=1, le=168, description="Lookback window in hours"),
    db=Depends(get_db),
):
    """
    Return total event counts and city coverage broken down by category.

    Used by the frontend category pills to show live totals and to
    determine which category pill to highlight as most active.

    Aggregation path: heatmap_events → $group(by category)
      → compute city_count (distinct cities), top_severity
    """
    if db is None:
        # Static fallback from seed data
        from collections import Counter
        counts: Counter = Counter()
        cities: dict[str, set] = {}
        sevs: dict[str, list] = {}
        for e in _EVENTS:
            counts[e.category] += e.count
            cities.setdefault(e.category, set()).add(e.label)
            sevs.setdefault(e.category, []).append(e.severity)
        SEV_ORDER = {"high": 0, "medium": 1, "low": 2}
        return [
            CategoryBreakdown(
                category=cat,
                total_events=counts[cat],
                city_count=len(cities[cat]),
                top_severity=min(sevs[cat], key=lambda s: SEV_ORDER.get(s, 2)),
            )
            for cat in counts
        ]

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    SEV_ORDER = {"high": 0, "medium": 1, "low": 2}

    pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id":           "$category",
            "total_events":  {"$sum": "$count"},
            "cities":        {"$addToSet": "$label"},
            "sev_high":      {"$sum": {"$cond": [{"$eq": ["$severity", "high"]},   1, 0]}},
            "sev_medium":    {"$sum": {"$cond": [{"$eq": ["$severity", "medium"]}, 1, 0]}},
        }},
        {"$project": {
            "_id":          0,
            "category":     "$_id",
            "total_events": 1,
            "city_count":   {"$size": "$cities"},
            "sev_high":     1,
            "sev_medium":   1,
        }},
        {"$sort": {"total_events": -1}},
    ]

    try:
        docs = await db["heatmap_events"].aggregate(pipeline).to_list(None)
        results = []
        for d in docs:
            top_sev = "high" if d["sev_high"] > 0 else "medium" if d["sev_medium"] > 0 else "low"
            results.append(CategoryBreakdown(
                category=d["category"],
                total_events=d["total_events"],
                city_count=d["city_count"],
                top_severity=top_sev,
            ))
        return results
    except Exception as exc:
        logger.warning("Category breakdown aggregation failed: %s", exc)
        return []


# ── Atlas Vector Search ────────────────────────────────────────────────────────

@router.post("/search", response_model=list[SearchResult])
async def vector_search(
    body: SearchRequest,
    db=Depends(get_db),
):
    """
    Semantic similarity search over narratives or heatmap events.

    Uses MongoDB Atlas Vector Search ($vectorSearch stage) with
    Google's text-embedding-004 model (768 dimensions, cosine similarity).

    Prerequisites — create these indexes in Atlas UI once:
      • narratives    → index "narrative_vector_index"  (see embeddings.py)
      • heatmap_events → index "event_vector_index"      (see embeddings.py)

    If the index doesn't exist yet (or Atlas is on a tier that doesn't
    support vector search), the endpoint falls back to a regex-based
    full-text search so the UI stays functional during index setup.

    Request body:
      query       — natural-language search string
      category    — optional category filter
      limit       — max results (1–20, default 5)
      collection  — "narratives" (default) or "events"

    Response: list of SearchResult sorted by similarity score desc.
    """
    from app.services.embeddings import embed_text

    if db is None:
        return []

    # ── Generate query embedding ──────────────────────────────────────────────
    query_vec = await embed_text(body.query)

    collection = "narratives" if body.collection != "events" else "heatmap_events"
    index_name = "narrative_vector_index" if collection == "narratives" else "event_vector_index"

    # ── $vectorSearch stage ───────────────────────────────────────────────────
    vs_stage: dict = {
        "$vectorSearch": {
            "index":        index_name,
            "path":         "embedding",
            "queryVector":  query_vec,
            "numCandidates": min(body.limit * 10, 200),
            "limit":        body.limit,
        }
    }
    if body.category and body.category.lower() != "all":
        vs_stage["$vectorSearch"]["filter"] = {"category": body.category}

    if collection == "narratives":
        project_stage = {"$project": {
            "title":    1,
            "category": 1,
            "volume":   1,
            "trend":    1,
            "score":    {"$meta": "vectorSearchScore"},
        }}
    else:
        project_stage = {"$project": {
            "label":    1,
            "category": 1,
            "region":   1,
            "severity": 1,
            "count":    1,
            "score":    {"$meta": "vectorSearchScore"},
        }}

    pipeline = [vs_stage, project_stage]

    try:
        docs = await db[collection].aggregate(pipeline).to_list(body.limit)
        results = []
        for d in docs:
            results.append(SearchResult(
                id=str(d.get("_id", "")),
                title=d.get("title") or d.get("label", ""),
                category=d.get("category", "General"),
                score=round(float(d.get("score", 0.0)), 4),
                volume=d.get("volume"),
                trend=d.get("trend"),
                region=d.get("region"),
                severity=d.get("severity"),
            ))

        if results:
            logger.info(
                "Vector search '%s' on %s → %d results (Atlas index)",
                body.query, collection, len(results),
            )
            return results

        # $vectorSearch returned nothing — index likely not created yet.
        # Fall through to regex so the endpoint stays useful during Atlas setup.
        logger.info(
            "Vector search returned 0 results — falling back to regex "
            "(create '%s' index in Atlas UI to enable semantic search)", index_name,
        )
        return await _regex_fallback_search(db, body, collection)

    except Exception as exc:
        # ── Fallback: regex full-text search when index not yet created ───────
        logger.info(
            "Vector search index not ready (%s: %s) — falling back to regex search",
            type(exc).__name__, exc,
        )
        return await _regex_fallback_search(db, body, collection)


async def _regex_fallback_search(db, body: SearchRequest, collection: str) -> list[SearchResult]:
    """
    Simple regex-based fallback used when the Atlas Vector Search index
    hasn't been created yet.  Less semantic but always available.
    """
    words = [w for w in body.query.split() if len(w) >= 3]
    if not words:
        return []

    # Case-insensitive OR match across key text fields
    regex_alts = "|".join(words)
    if collection == "narratives":
        match: dict = {"title": {"$regex": regex_alts, "$options": "i"}}
        project = {"title": 1, "category": 1, "volume": 1, "trend": 1}
        label_field = "title"
    else:
        match = {"label": {"$regex": regex_alts, "$options": "i"}}
        project = {"label": 1, "category": 1, "region": 1, "severity": 1, "count": 1}
        label_field = "label"

    if body.category and body.category.lower() != "all":
        match["category"] = body.category

    try:
        docs = await db[collection].find(match, project).limit(body.limit).to_list(body.limit)
        return [
            SearchResult(
                id=str(d.get("_id", "")),
                title=d.get(label_field, ""),
                category=d.get("category", "General"),
                score=0.0,       # no real similarity score in regex mode
                volume=d.get("volume"),
                trend=d.get("trend"),
                region=d.get("region"),
                severity=d.get("severity"),
            )
            for d in docs
        ]
    except Exception as exc:
        logger.warning("Regex fallback search failed: %s", exc)
        return []
