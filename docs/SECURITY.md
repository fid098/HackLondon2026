# TruthGuard Security Guide

## Secrets Management

**NEVER commit secrets.** The following are git-ignored and must be created manually:
- `apps/api/.env`

The following `.env.example` files ARE committed and document required variables:
- `apps/api/.env.example`

## API Security

### Authentication
- Phase 1 introduces JWT (HS256) with configurable expiry (default 24h)
- `JWT_SECRET` must be a long random string in production
- Generate: `python -c "import secrets; print(secrets.token_hex(32))"`

### CORS
- `CORS_ORIGINS_STR` in production should list only your actual domains
- Never use `*` in production CORS config

### Input Validation
- All request bodies validated by Pydantic v2
- File uploads: validate type + size before processing
- URL inputs: validate and sanitize before scraping

### Rate Limiting (Phase 7)
- Nginx rate limiting on `/api/` routes
- Per-user rate limits on AI endpoints (prevent cost abuse)

## Database Security

### Atlas (Production)
- Create a dedicated Atlas user with `readWrite` only (not admin)
- Enable Atlas IP Access List — add only your Vultr IP
- Enable Atlas Auditing for production
- Use Atlas Encryption at Rest (enabled by default on paid tiers)

### Local Dev
- Docker Compose mongo uses default credentials (root/devpassword)
- These are for local dev ONLY — never use in production
- The mongo container is not exposed on 0.0.0.0 — only the app network

## Extension Security

- No API keys in extension code (content, popup, background)
- All AI calls proxied through the backend
- Content scripts use `activeTab` only (no broad host permissions for storage)
- `host_permissions` limited to specific social media domains + localhost for dev

## Media Uploads (Phase 5)

- Store only minimal data — delete after analysis (TTL index: 24h)
- Validate MIME types server-side (not just Content-Type header)
- Scan for malicious content before processing (basic: file size + format validation)
- Implement `DELETE /uploads/{id}` endpoint for user-requested deletion

## Privacy

- Store only what's needed for functionality
- User content (URLs, text submitted) is stored for report retrieval
- Media files have TTL — auto-deleted after 24h
- Users can request full account deletion (Phase 1)
- Display clear disclaimer: results are probabilistic, not legal/medical advice

## Disclaimer

TruthGuard results are:
- **Probabilistic** — not guaranteed to be correct
- **Not legal advice** — do not use for legal proceedings
- **Not medical advice** — do not use for health decisions
- Based on AI analysis which can be wrong, biased, or outdated

This disclaimer must be visible in the UI and in downloaded reports.
