# TruthGuard API Dockerfile
#
# Multi-stage build with two named targets:
#   development  — hot-reload with uvicorn --reload
#   production   — minimal image, non-root user, 2 workers
#
# Usage:
#   docker build --target development -t truthguard-api:dev .
#   docker build --target production  -t truthguard-api:prod .
#
# docker-compose.yml uses 'target: development'
# docker-compose.prod.yml uses 'target: production'

# ─── Base stage (shared deps) ────────────────────────────────────
FROM python:3.11-slim AS base

WORKDIR /app

# Install system build deps needed by some Python packages (bcrypt, etc.)
# Clean up apt cache to keep image small.
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libffi-dev curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# ─── Development stage ───────────────────────────────────────────
FROM base AS development

# Source is mounted as a volume in docker-compose (for hot-reload)
COPY . .

EXPOSE 8000

# --reload watches for file changes and restarts the server automatically
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ─── Production stage ────────────────────────────────────────────
FROM base AS production

COPY . .

# Run as non-root to reduce attack surface
RUN useradd -m -u 1000 appuser \
    && chown -R appuser:appuser /app
USER appuser

EXPOSE 8000

# 2 workers for a single Vultr instance; tune based on CPU cores (2 * cores + 1)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "2"]
