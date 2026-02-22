# TruthGuard Web App Dockerfile
#
# Multi-stage build:
#   development  — Vite dev server with hot-reload
#   builder      — TypeScript compile + Vite production build
#   production   — Minimal Nginx container serving static files
#
# docker-compose.yml uses 'target: development'
# docker-compose.prod.yml uses 'target: production'

# ─── Development stage ───────────────────────────────────────────
FROM node:20-alpine AS development

WORKDIR /app

# Copy package files + .npmrc first for layer caching
COPY package*.json .npmrc* ./
RUN npm ci

# Source is volume-mounted in docker-compose for hot-reload
COPY . .

EXPOSE 5173

# --host 0.0.0.0 required to be accessible outside the container
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

# ─── Builder stage ───────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json .npmrc* ./
RUN npm ci
COPY . .

# Build the production bundle
RUN npm run build

# ─── Production stage ────────────────────────────────────────────
FROM nginx:1.27-alpine AS production

# Copy built assets
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx config that handles React Router (all paths → index.html)
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
