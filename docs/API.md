# TruthGuard API Reference

Interactive docs available at http://localhost:8000/docs (Swagger UI) when running locally.

## Base URL

- Local dev: `http://localhost:8000`
- Production: `https://your-domain.com/api`

## Authentication

Phase 1 adds JWT auth. Include in header:
```
Authorization: Bearer <token>
```

---

## Phase 0 — Available Now

### `GET /`
Returns API metadata.

**Response:**
```json
{
  "name": "TruthGuard API",
  "version": "0.1.0",
  "status": "running",
  "environment": "development",
  "docs": "/docs"
}
```

### `GET /health`
Liveness + DB connectivity check. Used by Docker healthchecks and monitoring.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "database": "connected",
  "environment": "development"
}
```

`database` is `"connected"` or `"disconnected"`. The HTTP status is always 200 if the API process is alive.

---

## Phase 1 — Auth + Users (Coming)

### `POST /auth/register`
```json
{ "email": "user@example.com", "password": "securepassword" }
```

### `POST /auth/login`
```json
{ "email": "user@example.com", "password": "securepassword" }
```
Returns: `{ "access_token": "...", "token_type": "bearer" }`

### `GET /auth/me`
Returns current user profile.

### `GET /users/preferences`
### `PUT /users/preferences`

---

## Phase 2 — Fact Check + Reports (Coming)

### `POST /factcheck`
Submit a URL or text for fact-checking.

**Request:**
```json
{
  "url": "https://example.com/article",
  "text": "Optional additional context",
  "attachment_ids": []
}
```

**Response:**
```json
{
  "report_id": "64abc123...",
  "status": "processing"
}
```

### `GET /reports/{id}`
Retrieve a completed report.

**Response:**
```json
{
  "id": "64abc123",
  "url": "https://example.com/article",
  "verdict": "false",
  "confidence": 0.87,
  "summary": "...",
  "claims": [{ "text": "...", "confidence": 0.9, "sources": [] }],
  "debate": {
    "agent_pro": "...",
    "agent_con": "...",
    "judge_verdict": "...",
    "sources": []
  },
  "created_at": "2026-02-21T10:00:00Z"
}
```

### `GET /reports/{id}/download?format=pdf|json`

---

## Phase 3 — Heatmap (Coming)

### `GET /heatmap/events`
Query params: `category`, `verdict`, `date_from`, `date_to`, `country_code`

### `GET /heatmap/regions`
Aggregated stats per region.

### `WS /heatmap/stream`
WebSocket — pushes new events as they arrive (Change Streams).

---

## Phase 5 — Deepfake (Coming)

### `POST /deepfake/image`
### `POST /deepfake/audio`
### `POST /deepfake/video`

---

## Phase 6 — Scam + Feedback (Coming)

### `POST /scam/check`
```json
{ "text": "You have won a million dollars! Click here to claim..." }
```

### `POST /feedback`
```json
{ "report_id": "...", "rating": "thumbs_up", "notes": "Accurate verdict" }
```

---

## Error Responses

```json
{
  "detail": "Error message here"
}
```

| Status | Meaning |
|---|---|
| 400 | Bad request / validation error |
| 401 | Unauthorized (missing/invalid JWT) |
| 404 | Resource not found |
| 422 | Pydantic validation error |
| 500 | Server error (check API logs) |
