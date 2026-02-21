# TruthGuard API

FastAPI backend for the TruthGuard platform.

## Local development

```bash
# Install dependencies (Python 3.11+)
pip install -r requirements.txt

# Copy env file
cp .env.example .env

# Run with hot-reload
uvicorn app.main:app --reload --port 8000

# API docs: http://localhost:8000/docs
```

## With Docker

```bash
# From repo root:
docker compose up api
```

## Running tests

```bash
pytest tests/ -v
```

Expected output: all tests pass, database shows "disconnected" (no real Mongo in unit tests).

## Lint + format

```bash
ruff check .           # lint
ruff format --check .  # format check
ruff format .          # auto-format
```

## Environment variables

See `.env.example` for the full list. Key vars:

| Variable | Default | Purpose |
|---|---|---|
| `MONGO_URI` | Docker Compose default | MongoDB connection string |
| `GEMINI_API_KEY` | (empty) | Google Gemini API key |
| `AI_MOCK_MODE` | `true` | Use mock AI responses |
| `JWT_SECRET` | (weak default) | JWT signing secret — **change in prod** |

## Project structure

```
app/
├── main.py           # FastAPI app + lifespan
├── core/
│   ├── config.py     # Pydantic settings (env vars)
│   └── database.py   # MongoDB connection + get_db() dependency
├── routes/
│   └── health.py     # GET /health
└── ai/
    ├── gemini_client.py      # Gemini Pro + Flash wrapper
    ├── serper_adapter.py     # Web search (Serper.dev)
    └── factcheck_adapter.py  # Google Fact Check API
tests/
├── conftest.py       # Shared fixtures (mock DB)
├── test_health.py    # /health endpoint tests
└── test_ai.py        # AI module unit tests
```
