# TruthGuard — Architecture

## System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                           CLIENTS                                 │
│  ┌──────────────────────┐   ┌──────────────────────────────────┐ │
│  │     Web App          │   │    Chrome Extension (MV3)        │ │
│  │  React 18 + Vite     │   │  Popup + Content + Background SW │ │
│  │  TailwindCSS         │   │                                  │ │
│  │  React Router v6     │   │  content.js → scans DOM          │ │
│  │  Axios               │   │  background.js → routes messages │ │
│  └─────────┬────────────┘   └───────────────┬──────────────────┘ │
└────────────┼───────────────────────────────── ┼──────────────────┘
             │ HTTP / WebSocket                 │ HTTP (backend proxy)
             ▼                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                   FastAPI Backend (:8000)                         │
│                                                                   │
│  Routes (phase-by-phase):                                         │
│  ┌──────────┐  ┌─────────────┐  ┌──────────┐  ┌─────────────┐  │
│  │  /health │  │ /factcheck  │  │/deepfake │  │    /scam    │  │
│  │  /auth   │  │ /reports    │  │ /audio   │  │  /feedback  │  │
│  └──────────┘  └─────────────┘  └──────────┘  └─────────────┘  │
│                                                                   │
│  AI Module:                                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  GeminiClient(Pro=deep/Flash=triage)                     │   │
│  │  SerperAdapter (web search — optional)                   │   │
│  │  FactCheckAdapter (Google Fact Check — optional)         │   │
│  │  Mock mode when keys not set                             │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────┬───────────────────────────────────┘
                               │ Motor (async)
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│         MongoDB Atlas (prod) / Docker mongo (local dev)          │
│                                                                   │
│  Collections:                                                     │
│    users        — auth, profiles                                  │
│    preferences  — per-user settings                               │
│    reports      — fact-check results + debate artifacts           │
│    claims_vectors — embeddings for vector search                  │
│    events       — geo-tagged misinfo events (heatmap)             │
│    feedback     — thumbs up/down on verdicts                      │
│                                                                   │
│  Features used:                                                   │
│    Vector Search  — similarity search on claims                   │
│    Geospatial     — 2dsphere index for heatmap queries            │
│    Aggregations   — region stats, trending narratives             │
│    Change Streams — real-time dashboard updates via WebSocket     │
└──────────────────────────────────────────────────────────────────┘

Deploy: Vultr VM → Docker Compose (prod) → Nginx reverse proxy
```

## Data Flow: Fact Check

```
User submits URL / text
        │
        ▼
POST /factcheck
        │
        ├─▶ Content extraction
        │     Web page: httpx + readability
        │     YouTube: transcript API / yt-dlp fallback
        │
        ▼
Claim identification (Gemini Pro)
        │
        ├─▶ Vector search: similar past claims? (Atlas Vector Search)
        ├─▶ Fact Check API: known verdicts? (Google Fact Check Tools)
        │
        ▼
AI Agent Debate
        │
        ├─▶ Agent A (PRO): Serper search + Gemini Pro → supporting arguments
        ├─▶ Agent B (CON): Serper search + Gemini Pro → counter arguments
        └─▶ Judge: synthesize → verdict + confidence + sources (Gemini Pro)
        │
        ▼
Store report + embeddings + event (with geo)
        │
        ▼
Return report ID → user retrieves / downloads
```

## AI Agent Debate Detail

```
Input: claim text

Agent A (Pro-side):
  1. Search for supporting evidence (Serper)
  2. Prompt: "You are arguing this claim is TRUE. Research and argue..."
  3. Gemini Pro → pro_argument + sources

Agent B (Con-side):
  1. Search for counter evidence (Serper)
  2. Prompt: "You are arguing this claim is FALSE. Research and argue..."
  3. Gemini Pro → con_argument + sources

Judge:
  1. Receives both arguments + sources
  2. Prompt: "As an impartial judge, evaluate both sides..."
  3. Gemini Pro → verdict + confidence + explanation + cited sources
```

## Deepfake Detection Pipeline (Phase 5)

```
Image:
  1. Baseline CNN/autoencoder → score
  2. HuggingFace deepfake model → score
  3. Gemini 1.5 Pro VLM → score + reasoning
  → Combined weighted score + explanation

Audio:
  1. SVM baseline (MFCC features) → score
  2. Gemini 1.5 Pro → auxiliary reasoning
  → Combined score

Video:
  1. Frame sampling (every N frames)
  2. Apply image pipeline to each frame
  3. Gemini 1.5 Pro context check (does content match speaker's history?)
  → Temporal consistency score + flagged frames
```

## MongoDB Collections

| Collection | Phase | Purpose | Key Indexes |
|---|---|---|---|
| `users` | 1 | Auth + profiles | `email` (unique) |
| `preferences` | 1 | User settings | `user_id` |
| `reports` | 2 | Fact-check reports + debates | `url`, `user_id + created_at` |
| `claims_vectors` | 2 | Claim embeddings | Vector Search index |
| `events` | 3 | Geo-tagged misinfo events | `location` (2dsphere), `category + timestamp` |
| `feedback` | 6 | User verdict feedback | `report_id`, `user_id` |

## Extension Architecture (Phase 4)

```
Browser Tab (X, Instagram, etc.)
        │
content/index.js        ← injected by Chrome
  │  Scans DOM for post text
  │  Highlights selection
  │  Sends message to background
        │
        │  chrome.runtime.sendMessage
        ▼
background/index.js     ← service worker
  │  Receives messages
  │  Calls FastAPI proxy (no keys exposed)
  │  Caches results in chrome.storage
        │
        │  fetch to backend
        ▼
FastAPI /factcheck (Gemini Flash triage)
  → Returns: { flagged: bool, confidence: float, report_id: string }
        │
        ▼
background sends result back to content script
content script injects overlay badge on post
```

## Technology Choices

| Decision | Choice | Rationale |
|---|---|---|
| Frontend framework | React 18 | Largest ecosystem, Vite DX |
| Styling | TailwindCSS v3 | Fast hackathon UI, utility-first |
| API framework | FastAPI | Best Python async, auto OpenAPI docs |
| DB driver | Motor (async) | Non-blocking MongoDB for FastAPI |
| AI SDK | google-generativeai | Direct Gemini access |
| Extension bundler | Vite multi-page | No heavy plugins needed for MV3 |
| Container | Docker + Compose | Reproducible dev + prod |
