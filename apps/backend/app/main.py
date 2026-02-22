"""
TruthGuard API — Application entry point.

Bootstraps FastAPI, wires up middleware, registers route groups,
and manages the MongoDB connection lifecycle.

Extension points:
  - Add new route groups with app.include_router() below
  - Add new middleware (rate limiting, logging) in the middleware block
  - Change startup behaviour in the lifespan context manager
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from app.core.config import settings
from app.core.database import close_mongo_connection, connect_to_mongo
from app.core.rate_limit import limiter
from app.routes.auth import router as auth_router
from app.routes.deepfake import router as deepfake_router
from app.routes.factcheck import router as factcheck_router
from app.routes.health import router as health_router
from app.routes.heatmap import router as heatmap_router
from app.routes.reports import router as reports_router
from app.routes.scam import router as scam_router
from app.routes.triage import router as triage_router
from app.routes.users import router as users_router
from app.routes.youtube import router as youtube_router

# ─── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.debug else logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
)
logger = logging.getLogger(__name__)


# ─── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Manage startup and shutdown lifecycle.

    FastAPI recommends this over the deprecated @app.on_event decorators.
    Code before `yield` runs on startup; code after runs on shutdown.
    """
    logger.info("Starting TruthGuard API (env: %s)", settings.environment)
    await connect_to_mongo()
    yield
    logger.info("Shutting down TruthGuard API")
    await close_mongo_connection()


# ─── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="TruthGuard API",
    description=(
        "Misinformation detection, deepfake analysis, and heatmap backend. "
        "All AI results are probabilistic — not guaranteed."
    ),
    version="0.1.0",
    lifespan=lifespan,
    # Disable docs in production to reduce attack surface
    docs_url="/docs" if settings.environment != "production" else None,
    redoc_url="/redoc" if settings.environment != "production" else None,
)


# ─── Rate limiting (Phase 7) ───────────────────────────────────────────────────
# Attach the limiter to app state so slowapi can find it.
# Routes opt-in with @limiter.limit("N/minute") + request: Request parameter.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ─── Middleware ─────────────────────────────────────────────────────────────────
# CORS: allow the web app and Chrome extension to call the API.
# In production, restrict allow_origins to your actual domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ─── Routes ────────────────────────────────────────────────────────────────────
# Phase 0
app.include_router(health_router, prefix="/health", tags=["health"])

# Phase 1 — Auth + Users
app.include_router(auth_router)
app.include_router(users_router)

# Phase 2 — Fact Check + Reports
app.include_router(factcheck_router)
app.include_router(reports_router)

# Phase 3 — Heatmap
app.include_router(heatmap_router)

# Phase 4 — Chrome Extension Quick Triage
app.include_router(triage_router)

# Phase 5 — Deepfake Detection
app.include_router(deepfake_router)

# Phase 6 — Scam Detection + Feedback
app.include_router(scam_router)

# Phase 7 — YouTube AI-Content Detection
app.include_router(youtube_router)


@app.get("/", tags=["root"])
async def root():
    """API root — basic metadata."""
    return {
        "name": "TruthGuard API",
        "version": "0.1.0",
        "status": "running",
        "environment": settings.environment,
        "docs": "/docs",
    }
