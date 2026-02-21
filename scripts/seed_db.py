#!/usr/bin/env python3
"""
seed_db.py — Populate MongoDB with sample data for local development.

Inserts:
  - Sample geo-tagged misinformation events (for Phase 3 heatmap demo)
  - Creates required indexes

Usage:
    python scripts/seed_db.py

Requires:
    pip install motor pymongo
    MongoDB running locally (or set MONGO_URI env var)

Safe to re-run: deletes seed data first, then re-inserts.
"""

import asyncio
import os
from datetime import datetime, timezone, timedelta
import random

from motor.motor_asyncio import AsyncIOMotorClient

MONGO_URI = os.getenv(
    "MONGO_URI",
    "mongodb://root:devpassword@localhost:27017/truthguard?authSource=admin",
)

# Sample events spread across the world
# Each has: claim, verdict, category, confidence, location (GeoJSON Point), timestamp
SAMPLE_EVENTS = [
    {
        "claim": "New vaccine causes permanent DNA modification in 95% of recipients",
        "verdict": "false",
        "category": "health",
        "confidence": 0.94,
        "location": {"type": "Point", "coordinates": [-0.1276, 51.5074]},  # London
        "country_code": "GB",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=2),
        "source_url": "https://example.com/seed/1",
    },
    {
        "claim": "Federal Reserve secretly printing $50 trillion in unbacked currency",
        "verdict": "false",
        "category": "finance",
        "confidence": 0.89,
        "location": {"type": "Point", "coordinates": [-74.006, 40.7128]},  # New York
        "country_code": "US",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=5),
        "source_url": "https://example.com/seed/2",
    },
    {
        "claim": "Celebrity deepfake promotes fraudulent cryptocurrency scheme",
        "verdict": "false",
        "category": "finance",
        "confidence": 0.97,
        "location": {"type": "Point", "coordinates": [2.3522, 48.8566]},  # Paris
        "country_code": "FR",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=1),
        "source_url": "https://example.com/seed/3",
    },
    {
        "claim": "5G towers cause widespread respiratory illness in urban areas",
        "verdict": "false",
        "category": "health",
        "confidence": 0.92,
        "location": {"type": "Point", "coordinates": [13.4050, 52.5200]},  # Berlin
        "country_code": "DE",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=8),
        "source_url": "https://example.com/seed/4",
    },
    {
        "claim": "Election machines in multiple states pre-loaded with fraudulent votes",
        "verdict": "false",
        "category": "politics",
        "confidence": 0.91,
        "location": {"type": "Point", "coordinates": [-87.6298, 41.8781]},  # Chicago
        "country_code": "US",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=3),
        "source_url": "https://example.com/seed/5",
    },
    {
        "claim": "Popular social media platform secretly records private conversations",
        "verdict": "misleading",
        "category": "social",
        "confidence": 0.68,
        "location": {"type": "Point", "coordinates": [103.8198, 1.3521]},  # Singapore
        "country_code": "SG",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=12),
        "source_url": "https://example.com/seed/6",
    },
    {
        "claim": "AI will replace 90% of all jobs within 2 years",
        "verdict": "misleading",
        "category": "science",
        "confidence": 0.75,
        "location": {"type": "Point", "coordinates": [-122.4194, 37.7749]},  # San Francisco
        "country_code": "US",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=6),
        "source_url": "https://example.com/seed/7",
    },
    {
        "claim": "Country X preparing surprise military invasion for next month",
        "verdict": "unverified",
        "category": "politics",
        "confidence": 0.55,
        "location": {"type": "Point", "coordinates": [37.6173, 55.7558]},  # Moscow
        "country_code": "RU",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=15),
        "source_url": "https://example.com/seed/8",
    },
    {
        "claim": "Major bank about to declare bankruptcy — withdraw funds immediately",
        "verdict": "false",
        "category": "finance",
        "confidence": 0.88,
        "location": {"type": "Point", "coordinates": [139.6917, 35.6895]},  # Tokyo
        "country_code": "JP",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=4),
        "source_url": "https://example.com/seed/9",
    },
    {
        "claim": "New study: common food additive linked to increased cancer risk",
        "verdict": "misleading",
        "category": "health",
        "confidence": 0.72,
        "location": {"type": "Point", "coordinates": [-43.1729, -22.9068]},  # Rio
        "country_code": "BR",
        "timestamp": datetime.now(timezone.utc) - timedelta(hours=20),
        "source_url": "https://example.com/seed/10",
    },
]


async def seed() -> None:
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGO_URI)
    db = client["truthguard"]

    try:
        # Verify connection
        await client.admin.command("ping")
        print("Connected.")

        # ─── Clean up previous seed data ──────────────────────────────────────
        deleted = await db.events.delete_many(
            {"source_url": {"$regex": "^https://example.com/seed/"}}
        )
        print(f"Removed {deleted.deleted_count} existing seed events.")

        # ─── Insert sample events ─────────────────────────────────────────────
        result = await db.events.insert_many(SAMPLE_EVENTS)
        print(f"Inserted {len(result.inserted_ids)} events.")

        # ─── Ensure indexes exist ─────────────────────────────────────────────
        await db.events.create_index([("location", "2dsphere")])
        await db.events.create_index([("category", 1), ("timestamp", -1)])
        await db.events.create_index([("timestamp", -1)])
        print("Indexes ensured.")

        print("\nSeed complete! Sample categories:")
        pipeline = [{"$group": {"_id": "$category", "count": {"$sum": 1}}}]
        async for doc in db.events.aggregate(pipeline):
            print(f"  {doc['_id']}: {doc['count']} events")

    finally:
        client.close()


if __name__ == "__main__":
    asyncio.run(seed())
