# TruthGuard — Ayo's Developer Guide
## Area: Heatmap (Live Geospatial Dashboard)

Welcome Ayo! This guide covers everything you need to know to work on the heatmap feature.

---

## What you own

The heatmap shows a real-time world map of misinformation hotspots. Your areas:

| File | What it does |
|------|-------------|
| `apps/backend/app/routes/heatmap.py` | The 3 API endpoints (GET snapshot, GET regions, WebSocket stream) |
| `apps/backend/app/models/heatmap.py` | Pydantic data models (HeatmapEvent, RegionStats, etc.) |
| `apps/frontend/src/pages/Heatmap.jsx` | The entire heatmap page UI |
| `apps/frontend/src/lib/api.js` | `getHeatmapEvents()` and `openHeatmapStream()` functions |

---

## How to run locally

```bash
# Option A: Docker (easiest — runs everything)
docker compose up --build

# Option B: Run backend manually (faster iteration)
cd apps/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (in a separate terminal)
cd apps/frontend
npm install
npm run dev
```

Visit:
- **Frontend**: http://localhost:5173 → click "Heatmap"
- **API docs**: http://localhost:8000/docs → scroll to "heatmap" section

---

## How the heatmap data flows

```
User opens Heatmap page
         │
         ▼
Heatmap.jsx  →  getHeatmapEvents()  →  GET /api/v1/heatmap  →  heatmap.py
                                                                     │
                                        ┌────────────────────────────┘
                                        │ returns: { events, regions, narratives, total_events }
                                        ▼
                                   React state → renders SVG map + cards + table

         │ (simultaneously)
         ▼
openHeatmapStream()  →  WebSocket /api/v1/heatmap/stream  →  heatmap.py
                                                                   │
                                                   pushes JSON every 3s
                                                                   │
                                              { type, message, delta, timestamp }
                                                                   ▼
                                              liveFeed ticker updates + counter increments
```

---

## The 3 backend endpoints you own

### 1. `GET /api/v1/heatmap`
Returns everything the map page needs in one call.

```bash
# Basic call
curl http://localhost:8000/api/v1/heatmap

# With category filter
curl "http://localhost:8000/api/v1/heatmap?category=Health"

# With time window (not yet implemented — ready for you to add)
curl "http://localhost:8000/api/v1/heatmap?hours=48"
```

Response:
```json
{
  "events": [
    { "cx": 22, "cy": 38, "label": "New York", "count": 312, "severity": "high", "category": "Health" }
  ],
  "regions": [
    { "name": "North America", "events": 847, "delta": 12, "severity": "high" }
  ],
  "narratives": [
    { "rank": 1, "title": "Vaccine conspiracy...", "category": "Health", "volume": 14200, "trend": "up" }
  ],
  "total_events": 55234
}
```

### 2. `GET /api/v1/heatmap/regions`
Returns only region stats (faster, smaller payload).

### 3. `WS /api/v1/heatmap/stream`
WebSocket that pushes every 3 seconds:
```json
{ "type": "event", "message": "Spike alert · Politics · London", "delta": 4, "timestamp": "..." }
```

---

## The frontend component (`Heatmap.jsx`)

Key sections to know:

```jsx
// State
const [hotspots, setHotspots] = useState(HOTSPOTS)      // SVG dot markers
const [regions,  setRegions]  = useState(REGIONS)       // region stat cards
const [narratives, setNarratives] = useState(NARRATIVES) // trending table

// On page load — fetches from your API
const fetchHeatmap = useCallback(async () => {
  const data = await getHeatmapEvents()
  setHotspots(data.events)   // updates the map dots
  setRegions(data.regions)   // updates the region cards
  setNarratives(data.narratives) // updates the table
  setTotalEvents(data.total_events)
}, [])

// WebSocket live ticker
openHeatmapStream((msg) => {
  setLiveFeed(msg.message)       // updates the "LIVE" ticker text
  setTotalEvents(n => n + msg.delta) // increments the global counter
})
```

The SVG world map uses `cx` and `cy` as percentage coordinates (0–100) of the SVG viewport.
`scale = mapWidth / 100` converts them to pixel positions.

---

## Your next tasks

### Task 1 — Connect real MongoDB data
Right now `_EVENTS` and `_REGIONS` in `heatmap.py` are hardcoded.
Replace them with a MongoDB aggregation:

```python
# In get_heatmap(), replace the seed data with:
pipeline = [
    { "$group": {
        "_id": "$city",
        "count": { "$sum": 1 },
        "lat": { "$first": "$location.coordinates.1" },
        "lng": { "$first": "$location.coordinates.0" }
    }},
    { "$sort": { "count": -1 } },
    { "$limit": 20 }
]
results = await db["reports"].aggregate(pipeline).to_list(length=20)
```

### Task 2 — Add real Change Streams to the WebSocket
```python
# Replace the while True / asyncio.sleep loop with:
async with db["heatmap_events"].watch() as stream:
    async for change in stream:
        await websocket.send_text(json.dumps({
            "type": "event",
            "message": f"New event · {change['fullDocument']['category']} · {change['fullDocument']['city']}",
            "delta": 1,
            "timestamp": datetime.now(tz=timezone.utc).isoformat()
        }))
```

### Task 3 — Add a new hotspot to the map
In `Heatmap.jsx`, add to the `HOTSPOTS` array:
```js
{ cx: 51, cy: 52, label: 'London (new)', count: 180, severity: 'medium' }
```
`cx` and `cy` are percentages of the SVG width/height (try cx: 47-49, cy: 31-33 for London).

---

## Running tests

```bash
cd apps/backend
source .venv/bin/activate
pytest tests/test_heatmap.py -v

# Run all tests to make sure nothing is broken
pytest tests/ -q
```

Frontend tests:
```bash
cd apps/frontend
npm run test -- --reporter=verbose
```

---

## Key files reference

```
apps/backend/
  app/routes/heatmap.py      ← YOUR MAIN FILE (backend routes)
  app/models/heatmap.py      ← Pydantic models for heatmap data
  tests/test_heatmap.py      ← Backend tests (keep these passing!)

apps/frontend/
  src/pages/Heatmap.jsx      ← YOUR MAIN FILE (the entire heatmap page)
  src/lib/api.js             ← getHeatmapEvents() and openHeatmapStream()
  src/index.css              ← shared CSS classes (.orb, .glass-card, etc.)
```

---

## Common questions

**Q: Why are cx/cy percentages instead of lat/lng?**
The map is a custom SVG (not a real map library like Leaflet) to keep the bundle small.
`cx=47, cy=32` means 47% across and 32% down the SVG viewBox.
For production, swap to Leaflet or Mapbox with real lat/lng.

**Q: How do I add a new category filter?**
In both `heatmap.py` (the `_NARRATIVES` data) and `Heatmap.jsx` (the `CATEGORIES` array),
add your new category string. The filter logic is already wired up.

**Q: What is `motor`?**
Motor is the async MongoDB driver for Python. Think of it as pymongo but `await`-friendly.
Any call to `db["collection"].find(...)` needs an `await` in front of it.
