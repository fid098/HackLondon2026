# Deploy TruthGuard on Vultr

## Prerequisites

- Vultr account: https://vultr.com
- Domain name (optional but recommended for TLS)
- MongoDB Atlas account: https://cloud.mongodb.com

---

## Step 1: Create a Vultr VM

1. Choose **Cloud Compute** → **Regular Performance**
2. Recommended: **2 vCPU / 4 GB RAM** ($24/mo) or **4 vCPU / 8 GB** for heavier AI load
3. OS: **Ubuntu 24.04 LTS**
4. Enable firewall: allow ports 22, 80, 443
5. Add SSH key for access

---

## Step 2: Prepare the VM

```bash
# SSH in
ssh root@<your-vultr-ip>

# Update system
apt update && apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker && systemctl start docker

# Install Docker Compose plugin
apt install -y docker-compose-plugin

# Install Git
apt install -y git

# Create app user (don't run as root in prod)
useradd -m -s /bin/bash deploy
usermod -aG docker deploy
```

---

## Step 3: MongoDB Atlas Setup

1. Create a free (M0) or paid cluster at https://cloud.mongodb.com
2. In **Database Access**: create a user with `readWrite` role
3. In **Network Access**: allow your Vultr IP (or 0.0.0.0/0 for hackathon)
4. Get the connection string:
   ```
   mongodb+srv://<user>:<password>@<cluster>.mongodb.net/truthguard?retryWrites=true&w=majority
   ```
5. Enable **Vector Search** in the Atlas UI (required for Phase 2+)
6. Create a **2dsphere** index on `events.location` (required for Phase 3)

---

## Step 4: Clone and Configure

```bash
su deploy
cd ~

# Clone the repo
git clone <your-repo-url> truthguard
cd truthguard

# Create the production env file
cp apps/api/.env.example apps/api/.env
nano apps/api/.env
```

Fill in `apps/api/.env`:
```bash
ENVIRONMENT=production
MONGO_URI=mongodb+srv://user:password@cluster.mongodb.net/truthguard?retryWrites=true&w=majority
GEMINI_API_KEY=your-gemini-api-key
AI_MOCK_MODE=false
JWT_SECRET=<generate: python -c "import secrets; print(secrets.token_hex(32))">
CORS_ORIGINS_STR=https://your-domain.com
SERPER_API_KEY=           # Optional
GOOGLE_FACT_CHECK_API_KEY= # Optional
```

---

## Step 5: Build and Start

```bash
# Build and start all production services
docker compose -f docker-compose.prod.yml up --build -d

# Check status
docker compose -f docker-compose.prod.yml ps

# Check API health
curl http://localhost/api/health
```

---

## Step 6: TLS with Let's Encrypt (Recommended)

```bash
# Install certbot
apt install -y certbot

# Get certificate (stops nginx first, then restarts)
certbot certonly --standalone -d your-domain.com

# Copy certs to infra/nginx/certs/
mkdir -p infra/nginx/certs
cp /etc/letsencrypt/live/your-domain.com/fullchain.pem infra/nginx/certs/
cp /etc/letsencrypt/live/your-domain.com/privkey.pem infra/nginx/certs/

# Uncomment TLS blocks in infra/nginx/nginx.prod.conf
# Rebuild nginx container
docker compose -f docker-compose.prod.yml restart nginx
```

Auto-renewal (add to crontab):
```
0 3 * * * certbot renew --quiet && docker compose -f /home/deploy/truthguard/docker-compose.prod.yml restart nginx
```

---

## Step 7: DNS

In your DNS provider, create:
```
A    your-domain.com    →  <vultr-ip>
A    api.your-domain.com →  <vultr-ip>  (optional)
```

---

## Monitoring

```bash
# View logs
docker compose -f docker-compose.prod.yml logs -f

# View specific service
docker compose -f docker-compose.prod.yml logs -f api

# Restart a service
docker compose -f docker-compose.prod.yml restart api
```

---

## Environment Variables Reference

| Variable | Required | Description |
|---|---|---|
| `ENVIRONMENT` | Yes | `production` |
| `MONGO_URI` | Yes | MongoDB Atlas connection string |
| `GEMINI_API_KEY` | Yes | Google AI Studio key |
| `AI_MOCK_MODE` | Yes | `false` in production |
| `JWT_SECRET` | Yes | Long random string — generate fresh |
| `CORS_ORIGINS_STR` | Yes | Your domain |
| `SERPER_API_KEY` | No | Web search (degrades without it) |
| `GOOGLE_FACT_CHECK_API_KEY` | No | Fact check API |

---

## Scaling

For higher traffic on Vultr:
1. Increase `--workers` in API CMD (Dockerfile production stage)
2. Upgrade VM size or add a load balancer
3. Use Vultr Managed Databases for MongoDB (or upgrade Atlas tier)
4. Add Redis for caching AI responses (reduces API costs)
