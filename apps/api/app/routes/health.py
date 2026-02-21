"""
Health check endpoint.

Used by:
  - Docker HEALTHCHECK instruction
  - Load balancers / orchestrators (Vultr)
  - Monitoring tools
  - Front-end to check API connectivity

Returns status + DB connectivity so callers can distinguish between
"API down" and "API up but DB unreachable".
"""

import logging

from fastapi import APIRouter
from pydantic import BaseModel

from app.core import database as db_module

logger = logging.getLogger(__name__)
router = APIRouter()


class HealthResponse(BaseModel):
    status: str  # Always "ok" if the API process is alive
    version: str
    database: str  # "connected" | "disconnected"
    environment: str


@router.get("", response_model=HealthResponse, summary="API health check")
async def health_check() -> HealthResponse:
    """
    Returns the liveness status of the API and its database connection.

    The API is considered healthy (HTTP 200) even when the database is
    disconnected — that lets upstream systems distinguish between a
    total API failure and a DB-only issue.
    """
    from app.core.config import settings

    db_status = "disconnected"
    try:
        # Access via module reference so tests can patch db_module.db_client
        if db_module.db_client.client is not None:
            await db_module.db_client.client.admin.command("ping")
            db_status = "connected"
    except Exception as exc:
        logger.warning("DB ping failed: %s", exc)

    return HealthResponse(
        status="ok",
        version="0.1.0",
        database=db_status,
        environment=settings.environment,
    )
