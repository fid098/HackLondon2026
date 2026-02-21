# TruthGuard

> AI-powered misinformation detection, deepfake analysis, and real-time heatmaps.

## What it does

- **Fact Check**: Submit a URL or text → AI Agent Debate (Pro vs Con Gemini agents) → Verdict with sources
- **Deepfake Detection**: Upload image/audio/video → triple-check pipeline → confidence score
- **Heatmap Dashboard**: World map of misinformation hotspots powered by MongoDB geospatial queries
- **Chrome Extension**: Non-disruptive flags on X/Instagram; highlight text → instant analysis
- **Scam Detector**: RoBERTa + XGBoost scam/phishing classifier

## Stack

| Layer     | Tech                                               |
| --------- | -------------------------------------------------- |
| Frontend  | React 18 + TypeScript + Vite + TailwindCSS         |
| Backend   | FastAPI + Pydantic v2 + Motor (async MongoDB)      |
| Database  | MongoDB Atlas (Vector Search, Geospatial, Streams) |
| AI        | Gemini 1.5 Pro (deep analysis) + Flash (triage)    |
| Extension | Chrome MV3 + Vite + TypeScript                     |
| Deploy    | Vultr + Docker Compose + Nginx                     |

## Quick Start (local dev)

```bash
# 1. Clone
git clone <repo>
cd HackLondon2026

# 2. Copy env files (fill in API keys later — mocks work out of the box)
cp apps/api/.env.example apps/api/.env

# 3. Start everything
docker compose up --build

# Web:  http://localhost:5173
# API:  http://localhost:8000
# Docs: http://localhost:8000/docs
```

## Running tests

```bash
# API (pytest)
cd apps/api && pip install -r requirements.txt
pytest tests/ -v

# Web (vitest)
cd apps/web && npm install
npm run test

# Lint + typecheck
cd apps/api && ruff check . && ruff format --check .
cd apps/web && npm run lint && npm run typecheck
```

## Monorepo structure

```
/
├── apps/
│   ├── web/          # React web app
│   ├── extension/    # Chrome Extension (MV3)
│   └── api/          # FastAPI backend
├── packages/
│   └── shared/       # Shared TypeScript types
├── infra/
│   ├── nginx/        # Reverse proxy configs
│   └── mongo/        # DB init scripts
├── docs/             # Architecture, API, deploy guides
└── scripts/          # seed_db.py, dev.sh
```

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
