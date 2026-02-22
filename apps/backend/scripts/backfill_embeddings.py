#!/usr/bin/env python3
"""
backfill_embeddings.py — Add or update embedding vectors on existing MongoDB documents.

Usage (from apps/backend/):
    # Use mock embeddings (fast, no API key required)
    python scripts/backfill_embeddings.py

    # Use real Google text-embedding-004 (requires AI_MOCK_MODE=false + GEMINI_API_KEY)
    python scripts/backfill_embeddings.py --real

    # Target a specific collection only
    python scripts/backfill_embeddings.py --collection narratives
    python scripts/backfill_embeddings.py --collection heatmap_events

What it does
────────────
For each document in the target collection(s) that is missing an 'embedding'
field (or has an incorrectly-sized one), this script:
  1. Builds a canonical text string from the document's key fields
  2. Generates a 768-dim unit-norm float vector (real or mock)
  3. Writes the 'embedding' field back to the document via update_one

After running this, the Atlas Vector Search index can query the embedding field.

Atlas Vector Search index setup (do this in Atlas UI first)
────────────────────────────────────────────────────────────
1. Go to Atlas → Your Cluster → Search & Vectorize → Create Search Index
2. Choose "Atlas Vector Search" → JSON Editor
3. For narratives, use index name: narrative_vector_index
   {
     "fields": [
       { "type": "vector", "path": "embedding",
         "numDimensions": 768, "similarity": "cosine" },
       { "type": "filter", "path": "category" }
     ]
   }
4. For heatmap_events, use index name: event_vector_index
   {
     "fields": [
       { "type": "vector", "path": "embedding",
         "numDimensions": 768, "similarity": "cosine" },
       { "type": "filter", "path": "category" },
       { "type": "filter", "path": "region" }
     ]
   }
5. Re-run this script with --real once the index is active for production-quality
   semantic similarity.
"""

import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from dotenv import load_dotenv
load_dotenv(ROOT / ".env")

import certifi
from motor.motor_asyncio import AsyncIOMotorClient

from app.services.embeddings import (
    EMBEDDING_DIM,
    _mock_embedding,
    build_event_text,
    build_narrative_text,
    embed_text,
)

MONGO_URI     = os.environ.get("MONGO_URI", "")
MONGO_DB_NAME = os.environ.get("MONGO_DB_NAME", "Cluster0")

if not MONGO_URI:
    print("ERROR: MONGO_URI not set. Check apps/backend/.env")
    sys.exit(1)


def _needs_embedding(doc: dict) -> bool:
    """Return True if the document is missing a valid 768-dim embedding."""
    emb = doc.get("embedding")
    if not emb:
        return True
    if not isinstance(emb, list) or len(emb) != EMBEDDING_DIM:
        return True
    return False


async def backfill_narratives(db, use_real: bool) -> None:
    print("\nBackfilling narratives…")
    cursor = db["narratives"].find({}, {"_id": 1, "title": 1, "category": 1, "embedding": 1})
    updated = skipped = 0
    async for doc in cursor:
        if not _needs_embedding(doc):
            skipped += 1
            continue
        text = build_narrative_text(
            title=doc.get("title", ""),
            category=doc.get("category", "General"),
        )
        embedding = await embed_text(text, mock=not use_real)
        await db["narratives"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"embedding": embedding}},
        )
        updated += 1
        if updated % 5 == 0:
            print(f"  {updated} narratives updated…")

    print(f"  Done: {updated} updated, {skipped} already had embeddings")


async def backfill_events(db, use_real: bool) -> None:
    print("\nBackfilling heatmap_events…")
    cursor = db["heatmap_events"].find(
        {},
        {"_id": 1, "label": 1, "category": 1, "severity": 1, "embedding": 1},
    )
    updated = skipped = 0
    async for doc in cursor:
        if not _needs_embedding(doc):
            skipped += 1
            continue
        text = build_event_text(
            label=doc.get("label", "Unknown"),
            category=doc.get("category", "General"),
            severity=doc.get("severity", "medium"),
        )
        embedding = await embed_text(text, mock=not use_real)
        await db["heatmap_events"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"embedding": embedding}},
        )
        updated += 1
        if updated % 20 == 0:
            print(f"  {updated} events updated…")

    print(f"  Done: {updated} updated, {skipped} already had embeddings")


async def backfill_reports(db, use_real: bool) -> None:
    """
    Backfill fact-check reports with embeddings.
    Embeds: "{verdict}: {summary}" for semantic duplicate-detection.
    """
    print("\nBackfilling reports…")
    cursor = db["reports"].find(
        {},
        {"_id": 1, "verdict": 1, "summary": 1, "category": 1, "embedding": 1},
    )
    updated = skipped = 0
    async for doc in cursor:
        if not _needs_embedding(doc):
            skipped += 1
            continue
        verdict  = doc.get("verdict", "UNVERIFIED")
        summary  = doc.get("summary", "")
        category = doc.get("category", "General")
        text = f"{verdict} ({category}): {summary}"
        embedding = await embed_text(text, mock=not use_real)
        await db["reports"].update_one(
            {"_id": doc["_id"]},
            {"$set": {"embedding": embedding}},
        )
        updated += 1
        if updated % 10 == 0:
            print(f"  {updated} reports updated…")

    print(f"  Done: {updated} updated, {skipped} already had embeddings")


async def run(collection: str, use_real: bool) -> None:
    client = AsyncIOMotorClient(MONGO_URI, tlsCAFile=certifi.where())
    db = client[MONGO_DB_NAME]

    try:
        await client.admin.command("ping")
        mode = "REAL (Google text-embedding-004)" if use_real else "MOCK (deterministic hash)"
        print(f"Connected to MongoDB ({MONGO_DB_NAME})")
        print(f"Embedding mode: {mode}")
    except Exception as exc:
        print(f"ERROR: Cannot connect to MongoDB: {exc}")
        return

    if collection in ("narratives", "all"):
        await backfill_narratives(db, use_real)
    if collection in ("heatmap_events", "all"):
        await backfill_events(db, use_real)
    if collection in ("reports", "all"):
        await backfill_reports(db, use_real)

    client.close()
    print("\n✓ Backfill complete")
    print(
        "\nNext step: create Atlas Vector Search indexes in the Atlas UI.\n"
        "See the docstring at the top of this file for the index JSON."
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill Atlas Vector Search embeddings")
    parser.add_argument(
        "--real",
        action="store_true",
        help="Use Google text-embedding-004 (requires GEMINI_API_KEY + AI_MOCK_MODE=false)",
    )
    parser.add_argument(
        "--collection",
        default="all",
        choices=["all", "narratives", "heatmap_events", "reports"],
        help="Which collection to backfill (default: all)",
    )
    args = parser.parse_args()

    if args.real:
        api_key = os.environ.get("GEMINI_API_KEY", "")
        if not api_key:
            print("ERROR: --real requires GEMINI_API_KEY to be set in .env")
            sys.exit(1)
        mock_mode = os.environ.get("AI_MOCK_MODE", "true").lower()
        if mock_mode == "true":
            print("WARNING: AI_MOCK_MODE=true in .env — forcing real mode for embeddings")

    asyncio.run(run(args.collection, use_real=args.real))
