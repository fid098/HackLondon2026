# TruthGuard

> AI-powered misinformation detection, deepfake analysis, and real-time heatmaps.

## What it does

- **AI Analysis Suite**: Submit a URL, text, image, audio, or video → runs fact-check debate + deepfake detection + scam detection simultaneously
- **Heatmap Dashboard**: World map of misinformation hotspots powered by MongoDB geospatial queries
- **Report Archive**: Every analysis is saved; full-text search, PDF/JSON export
- **Chrome Extension**: Non-disruptive flags on X/Instagram; highlight text → instant analysis

## Stack

| Layer      | Tech                                              |
|------------|---------------------------------------------------|
| Frontend   | React 18 + Vite + TailwindCSS                     |
| Backend    | FastAPI + Pydantic v2 + Motor (async MongoDB)     |
| Database   | MongoDB Atlas (Vector Search, Geospatial, Streams)|
| AI         | Gemini 1.5 Pro (deep analysis) + Flash (triage)   |
| Extension  | Chrome MV3 + Vite + TypeScript                    |
| Deploy     | Vultr + Docker Compose + Nginx                    |

## Quick Start (local dev)

```bash
# 1. Clone
git clone <repo>
cd HackLondon2026

# 2. Copy env files (fill in API keys later — mocks work out of the box)
cp apps/backend/.env.example apps/backend/.env

# 3. Start everything
docker compose up --build

# Frontend: http://localhost:5173
# Backend:  http://localhost:8000
# API Docs: http://localhost:8000/docs
```

## Running tests

```bash
# Backend (pytest)
cd apps/backend && pip install -r requirements.txt
pytest tests/ -v

# Frontend (vitest)
cd apps/frontend && npm install
npm run test

# Lint + typecheck
cd apps/backend && ruff check . && ruff format --check .
cd apps/frontend && npm run lint
```

## Monorepo structure

```
/
├── apps/
│   ├── frontend/     # React web app  (Leena — UI/UX)
│   ├── extension/    # Chrome Extension MV3  (Fidel)
│   └── backend/      # FastAPI backend  (Ayo — Heatmap, Ishaan — Analysis)
├── packages/
│   └── shared/       # Shared TypeScript types
├── infra/
│   ├── nginx/        # Reverse proxy configs
│   └── mongo/        # DB init scripts
├── docs/             # Architecture, API, deploy guides
│   └── developers/   # Per-developer onboarding guides
└── scripts/          # seed_db.py, dev.sh
```

## Developer Guides

Each team member has a dedicated onboarding guide:

| Developer | Area | Guide |
|-----------|------|-------|
| **Ayo** | Heatmap (live map, MongoDB geo, WebSocket) | [docs/developers/AYO.md](docs/developers/AYO.md) |
| **Ishaan** | AI Analysis (fact-check, deepfake, scam) | [docs/developers/ISHAAN.md](docs/developers/ISHAAN.md) |
| **Leena** | Landing page + UI/UX (styles, components) | [docs/developers/LEENA.md](docs/developers/LEENA.md) |
| **Fidel** | Chrome Extension (content script, popup) | [docs/developers/FIDEL.md](docs/developers/FIDEL.md) |

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Extension Guide](docs/EXTENSION.md)
- [Deploy on Vultr](docs/DEPLOY_VULTR.md)
- [Security](docs/SECURITY.md)

## Disclaimer

TruthGuard provides **probabilistic** assessments. Results are not guaranteed to be accurate and should not be the sole basis for any decision. Always verify with primary sources.

---

Built for HackLondon 2026.
