#!/usr/bin/env python3
"""
seed_heatmap_events.py — Populate MongoDB Atlas with realistic mock heatmap data.

Usage (from apps/backend/):
    python scripts/seed_heatmap_events.py           # replace existing seed data
    python scripts/seed_heatmap_events.py --append  # add without clearing first

Prerequisites:
    • MONGO_URI env var set (or .env file present)
    • `pip install motor certifi python-dotenv` (already in requirements.txt)

Run multiple times safely — uses upsert on (label, category) key so no duplicates
accumulate across runs (unless --append is used).

What this script creates
────────────────────────
  heatmap_events  ← 52 realistic events across 6 regions / 7 categories
  narratives      ← 8 narrative arc seeds (used by /arcs aggregation)
  indexes         ← compound + geospatial indexes for fast queries

Note on time-series collections
────────────────────────────────
MongoDB time-series collections (createCollection with timeseries: {}) compress
sequential data and provide fast range queries. To use them:
  1. Drop heatmap_events if it exists as a regular collection
  2. Create it as time-series (see section at bottom of this file)
  3. Requires Atlas M0+ (time-series) or M10+ (change streams)

For the hackathon demo this script uses a regular collection so it works on
any Atlas tier without manual setup steps.
"""

import argparse
import asyncio
import os
import random
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from app.services.embeddings import _mock_embedding, build_event_text, build_narrative_text  # noqa: E402

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.environ.get("MONGO_URI", "")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "Cluster0")

if not MONGO_URI:
    print("ERROR: MONGO_URI not set. Add it to apps/backend/.env")
    sys.exit(1)

# ── Seed events ───────────────────────────────────────────────────────────────
# Columns: label, lng, lat, region, category, count, severity,
#          confidence_score, virality_score, trend, is_coordinated,
#          is_spike_anomaly, narrative_ids
_RAW = [
    # ── North America ─────────────────────────────────────────────────────────
    ("New York",      -74.0,  40.7,  "North America", "Health",   312, "high",   0.87, 1.4, "up",   True,  False, ["narr_001", "narr_002"]),
    ("Los Angeles",  -118.2,  34.0,  "North America", "Politics", 198, "medium", 0.74, 1.1, "up",   False, False, ["narr_003"]),
    ("Chicago",       -87.6,  41.9,  "North America", "Finance",  145, "medium", 0.70, 1.0, "same", False, False, ["narr_004"]),
    ("Houston",       -95.4,  29.7,  "North America", "Health",   178, "high",   0.81, 1.3, "up",   False, True,  ["narr_001"]),
    ("Toronto",       -79.4,  43.7,  "North America", "Science",  112, "medium", 0.65, 0.9, "same", False, False, ["narr_005"]),
    ("Washington DC", -77.0,  38.9,  "North America", "Politics", 267, "high",   0.88, 1.5, "up",   True,  False, ["narr_003"]),
    ("Miami",         -80.2,  25.8,  "North America", "Health",   134, "medium", 0.70, 1.0, "same", False, False, ["narr_001"]),
    ("Vancouver",    -123.1,  49.3,  "North America", "Climate",  89,  "low",    0.60, 0.8, "same", False, False, ["narr_006"]),
    # ── Europe ────────────────────────────────────────────────────────────────
    ("London",          -0.1,  51.5, "Europe", "Health",   245, "high",   0.91, 1.6, "up",   True,  True,  ["narr_001", "narr_002"]),
    ("Berlin",          13.4,  52.5, "Europe", "Climate",  134, "medium", 0.68, 0.9, "same", False, False, ["narr_006"]),
    ("Paris",            2.3,  48.9, "Europe", "Politics", 189, "high",   0.83, 1.4, "up",   True,  False, ["narr_003"]),
    ("Madrid",          -3.7,  40.4, "Europe", "Finance",  98,  "medium", 0.63, 0.8, "down", False, False, ["narr_004"]),
    ("Moscow",          37.6,  55.8, "Europe", "Politics", 389, "high",   0.94, 2.1, "up",   True,  True,  ["narr_003", "narr_007"]),
    ("Warsaw",          21.0,  52.2, "Europe", "Politics", 123, "medium", 0.67, 0.9, "up",   False, False, ["narr_003"]),
    ("Amsterdam",        4.9,  52.4, "Europe", "Science",  112, "medium", 0.65, 0.9, "same", False, False, ["narr_005"]),
    ("Stockholm",       18.1,  59.3, "Europe", "Climate",  78,  "low",    0.57, 0.7, "same", False, False, ["narr_006"]),
    # ── Asia Pacific ──────────────────────────────────────────────────────────
    ("Beijing",        116.4,  39.9, "Asia Pacific", "Science",  521, "high",   0.82, 1.8, "up",   True,  False, ["narr_005", "narr_007"]),
    ("Tokyo",          139.7,  35.7, "Asia Pacific", "Finance",  287, "medium", 0.71, 1.3, "same", False, False, ["narr_004"]),
    ("Delhi",           77.2,  28.6, "Asia Pacific", "Health",   403, "high",   0.85, 1.7, "up",   False, True,  ["narr_001", "narr_002"]),
    ("Shanghai",       121.5,  31.2, "Asia Pacific", "Science",  332, "high",   0.79, 1.5, "up",   True,  False, ["narr_007"]),
    ("Seoul",          127.0,  37.6, "Asia Pacific", "Politics", 201, "medium", 0.72, 1.2, "up",   False, False, ["narr_003"]),
    ("Mumbai",          72.9,  19.1, "Asia Pacific", "Health",   312, "high",   0.83, 1.4, "up",   False, True,  ["narr_001", "narr_002"]),
    ("Sydney",         151.2, -33.9, "Asia Pacific", "Climate",  87,  "low",    0.61, 0.8, "same", False, False, ["narr_006"]),
    ("Jakarta",        106.8,  -6.2, "Asia Pacific", "Health",   145, "medium", 0.69, 1.1, "same", False, False, ["narr_001"]),
    ("Singapore",      103.8,   1.4, "Asia Pacific", "Finance",  145, "medium", 0.69, 1.0, "same", False, False, ["narr_004"]),
    ("Bangkok",        100.5,  13.8, "Asia Pacific", "Politics", 167, "medium", 0.70, 1.0, "same", False, False, ["narr_003"]),
    ("Karachi",         67.0,  24.9, "Asia Pacific", "Health",   198, "medium", 0.73, 1.2, "up",   False, False, ["narr_001"]),
    ("Dhaka",           90.4,  23.7, "Asia Pacific", "Climate",  112, "medium", 0.64, 0.8, "same", False, False, ["narr_006"]),
    ("Hanoi",          105.8,  21.0, "Asia Pacific", "Science",  134, "medium", 0.67, 0.9, "up",   False, False, ["narr_005"]),
    ("Osaka",          135.5,  34.7, "Asia Pacific", "Finance",  123, "medium", 0.65, 0.9, "same", False, False, ["narr_004"]),
    # ── Middle East ───────────────────────────────────────────────────────────
    ("Tehran",          51.4,  35.7, "Middle East", "Conflict", 267, "high",   0.89, 1.7, "up",   True,  False, ["narr_008"]),
    ("Cairo",           31.2,  30.1, "Middle East", "Conflict", 218, "medium", 0.76, 1.2, "up",   False, False, ["narr_008"]),
    ("Istanbul",        29.0,  41.0, "Middle East", "Politics", 156, "medium", 0.71, 1.1, "up",   False, False, ["narr_003"]),
    ("Riyadh",          46.7,  24.7, "Middle East", "Finance",  134, "medium", 0.68, 0.9, "same", False, False, ["narr_004"]),
    ("Dubai",           55.3,  25.2, "Middle East", "Finance",  198, "medium", 0.74, 1.1, "up",   False, False, ["narr_004"]),
    ("Baghdad",         44.4,  33.3, "Middle East", "Conflict", 189, "high",   0.82, 1.4, "up",   True,  False, ["narr_008"]),
    # ── South America ─────────────────────────────────────────────────────────
    ("Sao Paulo",      -46.6, -23.5, "South America", "Politics", 176, "medium", 0.69, 1.0, "same", False, False, ["narr_003"]),
    ("Buenos Aires",   -58.4, -34.6, "South America", "Finance",  123, "medium", 0.65, 0.9, "same", False, False, ["narr_004"]),
    ("Bogota",         -74.1,   4.7, "South America", "Conflict",  89, "low",    0.58, 0.7, "down", False, False, ["narr_008"]),
    ("Lima",           -77.0, -12.0, "South America", "Politics", 134, "medium", 0.66, 0.9, "same", False, False, ["narr_003"]),
    ("Santiago",       -70.7, -33.4, "South America", "Climate",   89, "low",    0.59, 0.7, "same", False, False, ["narr_006"]),
    ("Mexico City",    -99.1,  19.4, "South America", "Health",   223, "high",   0.80, 1.3, "up",   False, True,  ["narr_001"]),
    # ── Africa ────────────────────────────────────────────────────────────────
    ("Nairobi",         36.8,  -1.3, "Africa", "Health",   92,  "low",    0.62, 0.8, "down", False, False, ["narr_001"]),
    ("Lagos",            3.4,   6.5, "Africa", "Finance",  78,  "low",    0.56, 0.7, "down", False, False, ["narr_004"]),
    ("Johannesburg",    28.0, -26.2, "Africa", "Climate",  65,  "low",    0.54, 0.7, "same", False, False, ["narr_006"]),
    ("Accra",           -0.2,   5.6, "Africa", "Health",   54,  "low",    0.52, 0.6, "down", False, False, ["narr_001"]),
    ("Kinshasa",        15.3,  -4.3, "Africa", "Health",   67,  "low",    0.53, 0.6, "down", False, False, ["narr_001"]),
    ("Addis Ababa",     38.7,   9.0, "Africa", "Conflict",  76, "low",    0.57, 0.7, "same", False, False, ["narr_008"]),
    ("Casablanca",      -7.6,  33.6, "Africa", "Politics",  89, "low",    0.59, 0.7, "same", False, False, ["narr_003"]),
    ("Dar es Salaam",   39.3,  -6.8, "Africa", "Health",    63, "low",    0.52, 0.6, "down", False, False, ["narr_001"]),
    ("Abuja",            7.5,   9.1, "Africa", "Politics",  71, "low",    0.55, 0.7, "same", False, False, ["narr_003"]),
]

_NARRATIVES = [
    {"_id": "narr_001", "rank": 1, "title": "Vaccine microchip conspiracy resurfaces ahead of flu season",  "category": "Health",   "volume": 14200, "trend": "up"},
    {"_id": "narr_002", "rank": 2, "title": "AI-generated medical advice spreading on social platforms",    "category": "Health",   "volume":  9800, "trend": "up"},
    {"_id": "narr_003", "rank": 3, "title": "AI-generated election footage spreads across platforms",       "category": "Politics", "volume": 11800, "trend": "up"},
    {"_id": "narr_004", "rank": 4, "title": "False banking collapse rumour triggers regional bank run",     "category": "Finance",  "volume":  7600, "trend": "down"},
    {"_id": "narr_005", "rank": 5, "title": "Fabricated scientific study claims suppressed by institutions","category": "Science",  "volume":  5400, "trend": "up"},
    {"_id": "narr_006", "rank": 6, "title": "Manipulated climate data graph shared by influencers",        "category": "Climate",  "volume":  9400, "trend": "up"},
    {"_id": "narr_007", "rank": 7, "title": "State-linked disinformation network detected cross-border",   "category": "Science",  "volume":  6800, "trend": "up"},
    {"_id": "narr_008", "rank": 8, "title": "Doctored satellite images misidentify conflict zone locations","category": "Conflict", "volume":  6300, "trend": "up"},
]


def _make_event(row: tuple, hours_ago: float) -> dict:
    """Convert a seed row into a MongoDB document."""
    (label, lng, lat, region, category, count, severity,
     confidence_score, virality_score, trend, is_coordinated,
     is_spike_anomaly, narrative_ids) = row

    ts = datetime.now(tz=timezone.utc) - timedelta(hours=hours_ago)

    # Add ±15% noise to count so reruns produce slightly different values
    noisy_count = max(1, int(count * random.uniform(0.85, 1.15)))

    return {
        "timestamp":        ts,
        "location": {
            "type":        "Point",
            "coordinates": [lng, lat],   # GeoJSON: [lng, lat]
        },
        "label":            label,
        "region":           region,
        "count":            noisy_count,
        "severity":         severity,
        "category":         category,
        "confidence_score": confidence_score,
        "virality_score":   virality_score,
        "trend":            trend,
        "is_coordinated":   is_coordinated,
        "is_spike_anomaly": is_spike_anomaly,
        "narrative_ids":    narrative_ids,
        "platform_breakdown": {
            "twitter_x": random.randint(30, 50),
            "facebook":  random.randint(20, 40),
            "telegram":  random.randint(10, 30),
        },
        # Pre-computed mock embedding for Atlas Vector Search.
        # Replace with real embeddings via scripts/backfill_embeddings.py
        # once GEMINI_API_KEY is set and AI_MOCK_MODE=false.
        "embedding": _mock_embedding(build_event_text(label, category, severity)),
    }


async def create_indexes(db) -> None:
    """Idempotent index creation — safe to run multiple times."""
    print("  Creating indexes…")

    # heatmap_events: time-range + category (primary query pattern)
    await db["heatmap_events"].create_index(
        [("timestamp", -1), ("category", 1)],
        name="ts_desc_cat_asc",
        background=True,
    )
    # heatmap_events: geospatial (for future $geoNear queries)
    # Note: 2dsphere index on location field
    await db["heatmap_events"].create_index(
        [("location", "2dsphere")],
        name="location_2dsphere",
        background=True,
    )
    # reports: geospatial (for $geoNear aggregation)
    # Only creates if the field exists; safe on empty collection
    await db["reports"].create_index(
        [("geo", "2dsphere")],
        name="geo_2dsphere",
        sparse=True,        # don't index docs that lack the geo field
        background=True,
    )
    # narratives: category + volume (for ordered fetches by category)
    await db["narratives"].create_index(
        [("category", 1), ("volume", -1)],
        name="cat_asc_vol_desc",
        background=True,
    )
    print("  Indexes OK")


async def seed(append: bool = False) -> None:
    client = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[MONGO_DB_NAME]

    try:
        await client.admin.command("ping")
        print(f"Connected to MongoDB ({MONGO_DB_NAME})")
    except Exception as exc:
        print(f"ERROR: Cannot connect to MongoDB: {exc}")
        return

    # ── Narratives (with mock embeddings for vector search) ───────────────────
    print("\nSeeding narratives (with embeddings)…")
    for narr in _NARRATIVES:
        doc = dict(narr)
        # Embed "category: title" text for semantic similarity search
        doc["embedding"] = _mock_embedding(build_narrative_text(narr["title"], narr["category"]))
        await db["narratives"].update_one(
            {"_id": doc["_id"]},
            {"$set": doc},
            upsert=True,
        )
    print(f"  {len(_NARRATIVES)} narrative documents upserted (embeddings included)")

    # ── heatmap_events ────────────────────────────────────────────────────────
    if not append:
        print("\nClearing existing heatmap_events…")
        result = await db["heatmap_events"].delete_many({})
        print(f"  Deleted {result.deleted_count} existing documents")

    print("\nInserting heatmap events…")
    # Spread events over the last 23 hours (within default 24h query window)
    step = 23.0 / len(_RAW)
    docs = [_make_event(row, hours_ago=i * step + 0.5) for i, row in enumerate(_RAW)]

    result = await db["heatmap_events"].insert_many(docs)
    print(f"  Inserted {len(result.inserted_ids)} events across 6 regions")

    # ── Indexes ───────────────────────────────────────────────────────────────
    print("\nEnsuring indexes…")
    await create_indexes(db)

    # ── Verify ────────────────────────────────────────────────────────────────
    total = await db["heatmap_events"].count_documents({})
    categories = await db["heatmap_events"].distinct("category")
    regions = await db["heatmap_events"].distinct("region")

    print(f"\n✓ Done")
    print(f"  heatmap_events total : {total}")
    print(f"  Categories           : {sorted(categories)}")
    print(f"  Regions              : {sorted(regions)}")
    print(f"  narratives total     : {await db['narratives'].count_documents({})}")

    client.close()


# ── Time-series collection reference ────────────────────────────────────────
# To enable time-series compression + auto-TTL on Atlas M0+:
#
#   from motor.motor_asyncio import AsyncIOMotorClient
#   db = client["Cluster0"]
#   await db.create_collection("heatmap_events", **{
#       "timeseries": {
#           "timeField":   "timestamp",
#           "granularity": "minutes",
#       },
#       "expireAfterSeconds": 604800,   # auto-delete after 7 days
#   })
#
# Note: drop the regular collection first, then run this script with --append.
# Time-series collections do not support 2dsphere indexes directly.


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Seed TruthGuard heatmap data into MongoDB")
    parser.add_argument(
        "--append",
        action="store_true",
        help="Add events without clearing existing data first",
    )
    args = parser.parse_args()

    print(f"TruthGuard Heatmap Seeder  (db: {MONGO_DB_NAME})")
    print(f"Mode: {'append' if args.append else 'replace'}\n")

    asyncio.run(seed(append=args.append))
