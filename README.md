# Veryfi

> AI-powered misinformation detection, deepfake analysis, and real-time heatmaps.

## What it does

- **AI Analysis Suite**: Submit a URL, text, image, audio, or video → runs fact-check debate, deepfake detection, and scam detection.  
- **Heatmap Dashboard**: Interactive world map showing misinformation hotspots using MongoDB geospatial queries.  
- **Report Archive**: Track all analyses with full-text search, PDF/JSON export.  
- **Chrome Extension**: Highlights content on pages (e.g., X/Instagram) and provides instant credibility reports.  

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

### Running services individually

**Backend**

```bash
cd apps/backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

Expected output:
```
INFO:     Uvicorn running on http://0.0.0.0:8000 (Press CTRL+C to quit)
INFO:     Started reloader process using WatchFiles
INFO:     Starting Veryfi API (env: development)
INFO:     MongoDB connection established (db: HackLdn)
INFO:     Application startup complete.
```

**Frontend**

```bash
cd apps/frontend
npm install
npm run dev
```

Expected output:
```
  VITE v5.4.21  ready in 505 ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: http://192.168.x.x:5173/
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
│   ├── frontend/     # React web app
│   ├── extension/    # Chrome Extension MV3 
│   └── backend/      # FastAPI backend
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
| **Leena** | Landing page + UI/UX, MongoDB | [docs/developers/LEENA.md](docs/developers/LEENA.md) |
| **Fidel** | Chrome Extension (content script, popup) | [docs/developers/FIDEL.md](docs/developers/FIDEL.md) |

## Deploy on Vultr

> Full guide: [docs/DEPLOY_VULTR.md](docs/DEPLOY_VULTR.md)

### Step 1 — Create a VM

1. Go to [vultr.com](https://vultr.com) → **Cloud Compute → Regular Performance**
2. Pick **2 vCPU / 4 GB RAM** (Ubuntu 24.04 LTS)
3. Firewall: open ports **22, 80, 443**

### Step 2 — Prepare the VM

```bash
ssh root@<your-vultr-ip>
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
apt install -y docker-compose-plugin git
useradd -m -s /bin/bash deploy && usermod -aG docker deploy
```

### Step 3 — MongoDB Atlas

1. Create a cluster at [cloud.mongodb.com](https://cloud.mongodb.com)
2. **Database Access**: add a user with `readWrite` role
3. **Network Access**: allow your Vultr IP
4. Copy your connection string:
   ```
   mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/veryfi?retryWrites=true&w=majority
   ```

### Step 4 — Clone & Configure

```bash
su deploy && cd ~
git clone <your-repo-url> veryfi && cd veryfi
cp apps/backend/.env.example apps/backend/.env
nano apps/backend/.env
```

Key env vars to fill in:

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` |
| `MONGO_URI` | Your Atlas connection string |
| `GEMINI_API_KEY` | Google AI Studio key |
| `AI_MOCK_MODE` | `false` |
| `JWT_SECRET` | `python -c "import secrets; print(secrets.token_hex(32))"` |
| `CORS_ORIGINS_STR` | `https://your-domain.com` |

### Step 5 — Build & Start

```bash
docker compose -f docker-compose.prod.yml up --build -d

# Verify everything is up
docker compose -f docker-compose.prod.yml ps
curl http://localhost/api/health
```

### Step 6 — TLS (recommended)

```bash
apt install -y certbot
certbot certonly --standalone -d your-domain.com
mkdir -p infra/nginx/certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem infra/nginx/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem   infra/nginx/certs/
docker compose -f docker-compose.prod.yml restart nginx
```

Auto-renew (crontab):
```
0 3 * * * certbot renew --quiet && docker compose -f /home/deploy/veryfi/docker-compose.prod.yml restart nginx
```

### Step 7 — DNS

```
A    your-domain.com     →  <vultr-ip>
```

### Useful commands

```bash
# View all logs
docker compose -f docker-compose.prod.yml logs -f

# Restart a service
docker compose -f docker-compose.prod.yml restart api
```

---

## Docs

- [Architecture](docs/ARCHITECTURE.md)
- [API Reference](docs/API.md)
- [Extension Guide](docs/EXTENSION.md)
- [Full Vultr Deploy Guide](docs/DEPLOY_VULTR.md)
- [Security](docs/SECURITY.md)

## Disclaimer

Veryfi provides **probabilistic** assessments. Results are not guaranteed to be accurate and should not be the sole basis for any decision. Always verify with primary sources.

---

Built for HackLondon 2026.
