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

## Deploy on Vultr

### 1. Create VM

- **Cloud Compute → Regular Performance**
- Recommended: **2 vCPU / 4 GB RAM** ($24/mo), Ubuntu 24.04 LTS
- Firewall: open ports **22, 80, 443**

### 2. Prepare the VM

```bash
ssh root@<your-vultr-ip>
apt update && apt upgrade -y
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker
apt install -y docker-compose-plugin git
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
```

### 3. MongoDB Atlas

1. Create a cluster at https://cloud.mongodb.com
2. **Database Access**: create a user with `readWrite` role
3. **Network Access**: add your Vultr IP (or `0.0.0.0/0` for hackathon)
4. Copy your connection string: `mongodb+srv://user:pass@cluster.mongodb.net/truthguard`

### 4. Clone & Configure

```bash
su deploy && cd ~
git clone <your-repo-url> truthguard && cd truthguard
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

Fill in `apps/api/.env`:

```bash
ENVIRONMENT=production
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/truthguard?retryWrites=true&w=majority
GEMINI_API_KEY=your-gemini-api-key
AI_MOCK_MODE=false
JWT_SECRET=<run: python -c "import secrets; print(secrets.token_hex(32))">
CORS_ORIGINS_STR=https://your-domain.com
SERPER_API_KEY=           # optional
GOOGLE_FACT_CHECK_API_KEY= # optional
```

### 5. Build & Start

```bash
docker compose -f docker-compose.prod.yml up --build -d

# Check all containers are running
docker compose -f docker-compose.prod.yml ps

# Verify the API is up
curl http://localhost/api/health
```

### 6. TLS with Let's Encrypt (recommended)

```bash
apt install -y certbot
certbot certonly --standalone -d your-domain.com

mkdir -p infra/nginx/certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem infra/nginx/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem infra/nginx/certs/

# Uncomment the TLS server blocks in infra/nginx/nginx.prod.conf, then:
docker compose -f docker-compose.prod.yml restart nginx
```

Add to crontab for automatic renewal:

```
0 3 * * * certbot renew --quiet && docker compose -f /home/deploy/truthguard/docker-compose.prod.yml restart nginx
```

### 7. DNS

Point your domain's A record to the Vultr IP:

```
A    your-domain.com     →  <vultr-ip>
A    api.your-domain.com →  <vultr-ip>   # optional
```

### Monitoring

```bash
docker compose -f docker-compose.prod.yml logs -f        # all services
docker compose -f docker-compose.prod.yml logs -f api    # backend only
docker compose -f docker-compose.prod.yml restart api    # restart a service
```

### Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ENVIRONMENT` | Yes | Set to `production` |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Yes | Google AI Studio key |
| `AI_MOCK_MODE` | Yes | Set to `false` in production |
| `JWT_SECRET` | Yes | Random 32-byte hex string — generate fresh |
| `CORS_ORIGINS_STR` | Yes | Your domain (e.g. `https://example.com`) |
| `SERPER_API_KEY` | No | Web search — degrades gracefully without it |
| `GOOGLE_FACT_CHECK_API_KEY` | No | Fact-check API |

Full guide: [docs/DEPLOY_VULTR.md](docs/DEPLOY_VULTR.md)

---

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
