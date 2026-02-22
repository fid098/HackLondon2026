"""
MongoDB connection management using Motor (async driver).

Architecture decision: single DatabaseClient instance shared across all
requests via a module-level singleton. FastAPI's dependency injection
(get_db) gives routes clean access without importing the singleton directly.

Local dev: connects to the Docker Compose mongo container.
Production: connects to MongoDB Atlas (same code, different URI).

The connection is opened in FastAPI's lifespan (startup) and closed
on shutdown — this is the recommended pattern over @app.on_event.
"""

import logging
import re

import certifi
from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.core.config import settings

logger = logging.getLogger(__name__)


class DatabaseClient:
    """
    Holds the Motor client and selected database.

    Why a class rather than bare globals: we can safely replace
    .client and .db in tests (monkeypatching a class attribute is
    cleaner than replacing module-level vars).
    """

    client: AsyncIOMotorClient | None = None
    db: AsyncIOMotorDatabase | None = None


# Module-level singleton — all app code references this object
db_client = DatabaseClient()


async def connect_to_mongo() -> None:
    """
    Create the MongoDB connection and validate it with a ping.

    Called once at app startup (via lifespan). Fails gracefully if
    MongoDB is unavailable — the API will still respond but DB-dependent
    endpoints will return errors. This lets the health check report the
    real status rather than crashing the whole server.
    """
    logger.info("Connecting to MongoDB at %s", _redact_uri(settings.mongo_uri))
    try:
        # Use certifi's CA bundle so Atlas TLS works on macOS/Linux without
        # system-level cert workarounds (the default Python ssl context doesn't
        # include the CA that signed MongoDB Atlas's certificate on macOS).
        db_client.client = AsyncIOMotorClient(
            settings.mongo_uri,
            # Fail fast in tests; real deployments use the URI default (30s)
            serverSelectionTimeoutMS=5000,
            tlsCAFile=certifi.where(),
        )
        db_client.db = db_client.client[settings.mongo_db_name]
        # Validate connection immediately — don't wait for first query
        await db_client.client.admin.command("ping")
        logger.info("MongoDB connection established (db: %s)", settings.mongo_db_name)
    except Exception as exc:
        logger.warning(
            "MongoDB unavailable at startup: %s. "
            "API running in degraded mode — DB endpoints will fail.",
            exc,
        )
        db_client.client = None
        db_client.db = None


async def close_mongo_connection() -> None:
    """Close the MongoDB connection gracefully on app shutdown."""
    if db_client.client is not None:
        db_client.client.close()
        logger.info("MongoDB connection closed")


def get_db() -> AsyncIOMotorDatabase | None:
    """
    FastAPI dependency — inject the database into route handlers.

    Returns None when MongoDB is unavailable so routes can degrade
    gracefully (skip persistence) rather than returning 500 errors.

    Usage in a route:
        async def my_route(db = Depends(get_db)):
            if db is not None:
                await db.collection.insert_one(doc)
    """
    return db_client.db


def _redact_uri(uri: str) -> str:
    """Strip credentials from URI before logging."""
    return re.sub(r"://[^:]+:[^@]+@", "://<redacted>@", uri)
