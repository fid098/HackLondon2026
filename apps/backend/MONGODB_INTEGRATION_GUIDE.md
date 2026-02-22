# MongoDB Atlas Integration Guide
## Reality Stability Intelligence — Heatmap Data Layer

> **Audience:** Junior developers onboarding to this service.
> **Purpose:** Replace the in-memory seed data in `routes/heatmap.py` with
> real MongoDB Atlas queries so the heatmap shows live misinformation intelligence.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Collections & Schemas](#2-collections--schemas)
3. [Time-Series Collection Setup](#3-time-series-collection-setup)
4. [Indexes](#4-indexes)
5. [Aggregation Pipelines](#5-aggregation-pipelines)
6. [Change Streams (WebSocket live feed)](#6-change-streams-websocket-live-feed)
7. [Switching from Mock → Atlas](#7-switching-from-mock--atlas)
8. [Environment Variables](#8-environment-variables)
9. [Scaling Notes](#9-scaling-notes)
10. [Testing Checklist](#10-testing-checklist)

---

## 1. Architecture Overview

```
Frontend (React + Globe)
      ↕  HTTP GET /api/v1/heatmap          (30-second polling)
      ↕  WebSocket /api/v1/heatmap/stream  (live Change Stream feed)

Backend (FastAPI + Motor)
      ↕  Motor async driver

MongoDB Atlas (M10+ cluster recommended for Change Streams)
  ├── heatmap_events   ← time-series collection  (primary source)
  ├── reports          ← existing fact-check reports (geo-tagged)
  └── narratives       ← trending narrative documents
```

The backend aggregates `heatmap_events` and `reports` to produce the
`HeatmapResponse` (events + regions + narratives + total_events).

---

## 2. Collections & Schemas

### 2.1 `heatmap_events` (time-series, primary)

Each document represents ONE misinformation signal detected in a specific
city at a specific time. The scoring service (Phase 2) will write these.

```json
{
  "_id": ObjectId("..."),
  "timestamp":        ISODate("2026-02-22T14:00:00Z"),   // required for time-series
  "location": {
    "type":           "Point",
    "coordinates":    [-74.0, 40.7]                       // [lng, lat] — GeoJSON order!
  },
  "label":            "New York",
  "count":            312,
  "severity":         "high",
  "category":         "Health",
  "confidence_score": 0.87,
  "virality_score":   1.4,
  "is_coordinated":   true,
  "is_spike_anomaly": false,
  "trend":            "up",
  "narrative_ids":    ["narr_001", "narr_002"],           // linked narratives
  "platform_breakdown": {
    "twitter_x": 45,
    "facebook":  30,
    "telegram":  25
  }
}
```

> **GeoJSON coordinate order:** Always `[longitude, latitude]` — the
> opposite of the intuitive lat/lng order. Get this wrong and all your
> geo-queries will silently fail.

### 2.2 `reports` (existing collection — extend with geo field)

Add a `geo` sub-document to every fact-check report so we can aggregate
them alongside `heatmap_events`:

```json
{
  "geo": {
    "type":        "Point",
    "coordinates": [-74.0, 40.7],
    "city":        "New York",
    "country":     "US"
  }
}
```

Migration script to backfill existing reports:

```python
# scripts/backfill_geo.py
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient

async def backfill():
    client = AsyncIOMotorClient("your-atlas-uri")
    db = client["verify"]
    async for doc in db["reports"].find({"geo": {"$exists": False}}):
        # TODO: call a geocoding API using doc["source_url"] domain
        # For now, set a default point so the index is satisfied
        await db["reports"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"geo": {"type": "Point", "coordinates": [0, 0]}}}
        )

asyncio.run(backfill())
```

### 2.3 `narratives` (optional dedicated collection)

If the narrative list grows beyond the seed data, store each in its own
collection so it can be updated independently:

```json
{
  "_id":      "narr_health_vaccine_001",
  "rank":     1,
  "title":    "Vaccine microchip conspiracy resurfaces ahead of flu season",
  "category": "Health",
  "volume":   14200,
  "trend":    "up",
  "first_seen": ISODate("2026-02-01T00:00:00Z"),
  "last_seen":  ISODate("2026-02-22T14:00:00Z")
}
```

---

## 3. Time-Series Collection Setup

Run this **once** in MongoDB Atlas shell or a setup script:

```javascript
// In MongoDB Atlas → Collections → Create Collection
db.createCollection("heatmap_events", {
  timeseries: {
    timeField:   "timestamp",   // field containing the event time
    metaField:   "meta",        // optional: put non-varying fields here for compression
    granularity: "minutes"      // "seconds" | "minutes" | "hours"
  },
  expireAfterSeconds: 604800    // auto-delete documents older than 7 days
})
```

Time-series collections automatically compress sequential documents and
provide fast range queries on `timestamp`. You cannot add a `2dsphere`
index directly to a time-series collection — keep the `location` field in
the document body for geo-queries, or store aggregated snapshots in a
separate regular collection.

---

## 4. Indexes

Run these once to enable geo and category queries:

```javascript
// Geospatial index on reports (for $geoNear queries)
db.reports.createIndex({ "geo": "2dsphere" })

// Compound index for time-range + category filtering (heatmap_events)
db.heatmap_events.createIndex({ timestamp: -1, category: 1 })

// Index for fast narrative lookups
db.narratives.createIndex({ category: 1, volume: -1 })
```

---

## 5. Aggregation Pipelines

### 5.1 Hotspot events (`GET /api/v1/heatmap`)

Replace the `_EVENTS` seed list with this Motor query:

```python
# In routes/heatmap.py — get_heatmap()
async def build_events(db, category=None, hours=24):
    from datetime import datetime, timezone, timedelta

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)

    match_stage = {"timestamp": {"$gte": cutoff}}
    if category and category.lower() != "all":
        match_stage["category"] = category

    pipeline = [
        {"$match": match_stage},
        {"$group": {
            "_id": "$label",
            "lat":              {"$first": {"$arrayElemAt": ["$location.coordinates", 1]}},
            "lng":              {"$first": {"$arrayElemAt": ["$location.coordinates", 0]}},
            "count":            {"$sum": "$count"},
            "severity":         {"$first": "$severity"},       # TODO: derive from max count
            "category":         {"$first": "$category"},
            "confidence_score": {"$avg": "$confidence_score"},
            "virality_score":   {"$avg": "$virality_score"},
            "trend":            {"$last": "$trend"},
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
        }},
        {"$sort": {"count": -1}},
        {"$limit": 50},
    ]

    docs = await db["heatmap_events"].aggregate(pipeline).to_list(length=50)
    return [HeatmapEvent(**d) for d in docs]
```

### 5.2 Region stats (`GET /api/v1/heatmap/regions`)

```python
async def build_regions(db, hours=24):
    from datetime import datetime, timezone, timedelta

    cutoff      = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    prev_cutoff = cutoff - timedelta(hours=hours)  # prior window for delta

    # Current window
    current_pipeline = [
        {"$match": {"timestamp": {"$gte": cutoff}}},
        {"$group": {
            "_id":      "$region",   # add a "region" field to documents
            "events":   {"$sum": "$count"},
            "severity": {"$first": "$severity"},
        }}
    ]

    # Previous window (for delta calculation)
    prev_pipeline = [
        {"$match": {"timestamp": {"$gte": prev_cutoff, "$lt": cutoff}}},
        {"$group": {"_id": "$region", "events": {"$sum": "$count"}}}
    ]

    current = {d["_id"]: d async for d in db["heatmap_events"].aggregate(current_pipeline)}
    prev    = {d["_id"]: d async for d in db["heatmap_events"].aggregate(prev_pipeline)}

    results = []
    for name, cur in current.items():
        prev_events = prev.get(name, {}).get("events", cur["events"] or 1)
        delta = round(((cur["events"] - prev_events) / max(prev_events, 1)) * 100)
        results.append(RegionStats(
            name=name, events=cur["events"],
            delta=delta, severity=cur.get("severity", "low")
        ))
    return results
```

### 5.3 Narrative arcs (`GET /api/v1/heatmap/arcs`)

Find narratives that appear in ≥2 cities so the frontend can draw spread arcs:

```python
async def build_arcs(db, hours=24, category=None):
    from datetime import datetime, timezone, timedelta

    cutoff = datetime.now(tz=timezone.utc) - timedelta(hours=hours)
    match = {"timestamp": {"$gte": cutoff}, "narrative_ids": {"$exists": True}}
    if category and category != "all":
        match["category"] = category

    pipeline = [
        {"$match": match},
        {"$unwind": "$narrative_ids"},
        {"$group": {
            "_id":      "$narrative_ids",
            "category": {"$first": "$category"},
            "strength": {"$sum": "$count"},
            "locations": {"$addToSet": {
                "lat":  {"$arrayElemAt": ["$location.coordinates", 1]},
                "lng":  {"$arrayElemAt": ["$location.coordinates", 0]},
                "city": "$label"
            }}
        }},
        {"$match": {"locations.1": {"$exists": True}}},  # ≥2 locations
        {"$sort": {"strength": -1}},
        {"$limit": 40},
    ]
    return await db["heatmap_events"].aggregate(pipeline).to_list(length=40)
```

---

## 6. Change Streams (WebSocket live feed)

Replace the `asyncio.sleep(3)` loop in `routes/heatmap.py` with a real
MongoDB Change Stream. This requires an **M10+ Atlas cluster** (Change
Streams are not available on M0 free tier).

```python
# In routes/heatmap.py — heatmap_stream() WebSocket handler
@router.websocket("/stream")
async def heatmap_stream(websocket: WebSocket, db=Depends(get_db)):
    await websocket.accept()

    if db is None:
        # DB unavailable — fall back to mock interval (existing behaviour)
        await _mock_stream(websocket)
        return

    try:
        # Watch for new documents inserted into heatmap_events
        async with db["heatmap_events"].watch(
            pipeline=[{"$match": {"operationType": "insert"}}],
            full_document="updateLookup"
        ) as stream:
            async for change in stream:
                doc = change.get("fullDocument", {})
                payload = {
                    "type":      "event",
                    "message":   f"New event · {doc.get('category','?')} · {doc.get('label','?')}",
                    "delta":     doc.get("count", 1),
                    "timestamp": datetime.now(tz=timezone.utc).isoformat(),
                    "severity":  doc.get("severity", "low"),
                }
                await websocket.send_text(json.dumps(payload))

    except WebSocketDisconnect:
        logger.info("Heatmap WebSocket client disconnected")
    except Exception as exc:
        logger.warning("Heatmap WebSocket error: %s", exc)
        # Fall back to mock stream on error
        await _mock_stream(websocket)


async def _mock_stream(websocket: WebSocket):
    """Fallback mock stream when Change Streams are unavailable."""
    idx = 0
    try:
        while True:
            payload = {
                "type":      "event",
                "message":   _FEED_ITEMS[idx % len(_FEED_ITEMS)],
                "delta":     random.randint(1, 8),
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            }
            await websocket.send_text(json.dumps(payload))
            idx += 1
            await asyncio.sleep(3)
    except WebSocketDisconnect:
        pass
```

---

## 7. Switching from Mock → Atlas

The frontend (`intelligenceProvider.js`) and backend both support
mock-to-Atlas switching with zero UI changes.

### Frontend switch

| Method | How |
|--------|-----|
| Auto (default) | Provider tries API call; falls back to mock on error |
| Env override | Set `VITE_INTELLIGENCE_MOCK=true` in `.env.local` |
| Per-call | Pass `{ forceMock: true }` to `getIntelligenceSnapshot()` |

### Backend switch

The backend's `get_heatmap()` currently checks `if db is not None` before
querying. When `MONGODB_URI` is set and Motor connects successfully, `db`
will not be None and the real queries run automatically.

Steps to enable Atlas on the backend:

```bash
# 1. Set the connection string in your environment
export MONGODB_URI="mongodb+srv://user:password@cluster.mongodb.net/verify?retryWrites=true&w=majority"

# 2. Restart the backend
cd apps/backend
uvicorn app.main:app --reload

# 3. Verify the connection
curl http://localhost:8000/health
# → { "status": "ok", "database": "connected" }

# 4. Seed some test events (optional)
python scripts/seed_heatmap_events.py
```

---

## 8. Environment Variables

| Variable | Where | Description |
|----------|-------|-------------|
| `MONGODB_URI` | Backend `.env` | Full Atlas connection string |
| `MONGODB_DB_NAME` | Backend `.env` | Database name (default: `verify`) |
| `VITE_API_URL` | Frontend `.env` | Backend base URL (default: `http://localhost:8000`) |
| `VITE_INTELLIGENCE_MOCK` | Frontend `.env.local` | Set `true` to force mock mode |

Example `.env` for backend:
```
MONGODB_URI=mongodb+srv://dev:secret@cluster.mongodb.net/verify
MONGODB_DB_NAME=verify
```

Example `.env.local` for frontend (development only):
```
VITE_API_URL=http://localhost:8000
VITE_INTELLIGENCE_MOCK=false
```

---

## 9. Scaling Notes

- **Atlas M10+** required for Change Streams and $geoNear on time-series data
- **M0 free tier** works for development; use mock stream (`asyncio.sleep` fallback)
- **TTL on heatmap_events**: the `expireAfterSeconds: 604800` setting auto-purges events older than 7 days; adjust for your retention policy
- **Read preference**: set `readPreference=secondaryPreferred` in the URI to offload reads from primary
- **Connection pooling**: Motor reuses a single client per process; do not create a new `AsyncIOMotorClient` per request
- **Aggregation indexes**: always verify your aggregation stages hit an index using `explain("executionStats")` in Atlas UI

---

## 10. Testing Checklist

After switching from mock to Atlas, verify:

- [ ] `curl http://localhost:8000/health` returns `"database": "connected"`
- [ ] `curl http://localhost:8000/api/v1/heatmap` returns `events` with real lat/lng
- [ ] `curl http://localhost:8000/api/v1/heatmap/regions` returns region stats
- [ ] WebSocket stream delivers messages: `wscat -c ws://localhost:8000/api/v1/heatmap/stream`
- [ ] Frontend globe shows live hotspots from Atlas (not mock data)
- [ ] Disconnect Atlas URI → frontend automatically falls back to mock data
- [ ] Reconnect Atlas URI → frontend picks up live data on next 30-second poll
- [ ] Category filter (`?category=Health`) returns only Health events
- [ ] `pytest tests/test_heatmap.py -v` passes (update assertions if seed data shape changes)
