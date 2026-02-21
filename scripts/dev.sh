#!/usr/bin/env bash
# dev.sh — Start the TruthGuard development environment
#
# Usage:
#   ./scripts/dev.sh              # Start all services
#   ./scripts/dev.sh --build      # Rebuild Docker images first
#   ./scripts/dev.sh backend      # Start only the backend API + dependencies
#   ./scripts/dev.sh --seed       # Start all + seed the database

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

# ─── Ensure env files exist ───────────────────────────────────────────────────
if [ ! -f "apps/backend/.env" ]; then
    echo "Creating apps/backend/.env from .env.example..."
    cp apps/backend/.env.example apps/backend/.env
    echo "  → Edit apps/backend/.env to add real API keys (or leave AI_MOCK_MODE=true)"
fi

# ─── Parse arguments ─────────────────────────────────────────────────────────
BUILD_FLAG=""
SEED=false
SERVICE=""

for arg in "$@"; do
    case $arg in
        --build) BUILD_FLAG="--build" ;;
        --seed)  SEED=true ;;
        backend|frontend|mongo) SERVICE="$arg" ;;
    esac
done

# ─── Start services ───────────────────────────────────────────────────────────
echo "Starting TruthGuard dev environment..."
echo "  Frontend:  http://localhost:5173"
echo "  Backend:   http://localhost:8000"
echo "  API Docs:  http://localhost:8000/docs"
echo "  Mongo:     localhost:27017"
echo ""

if [ -n "$SERVICE" ]; then
    docker compose up $BUILD_FLAG "$SERVICE"
else
    # Run in background if seeding so we can wait for mongo
    if [ "$SEED" = true ]; then
        docker compose up $BUILD_FLAG -d
        echo "Waiting for MongoDB to be ready..."
        sleep 8  # Give mongo time to initialize
        echo "Seeding database..."
        python scripts/seed_db.py
        echo "Seed complete. Attaching to logs..."
        docker compose logs -f
    else
        docker compose up $BUILD_FLAG
    fi
fi
