# TruthGuard — Ishaan's Developer Guide
## Area: AI Analysis (Fact-Check · Deepfake · Scam Detection)

Welcome Ishaan! This guide covers the entire AI analysis pipeline — the core of TruthGuard.

---

## What you own

| File | What it does |
|------|-------------|
| `apps/backend/app/routes/factcheck.py` | Multi-agent debate pipeline endpoint |
| `apps/backend/app/routes/deepfake.py` | Image / audio / video deepfake detection |
| `apps/backend/app/routes/scam.py` | Text scam & phishing classifier |
| `apps/backend/app/ai/gemini_client.py` | Wrapper around Google Gemini API (mock + real) |
| `apps/backend/app/ai/debate_pipeline.py` | Pro vs Con agent debate orchestration |
| `apps/frontend/src/pages/Analyze.jsx` | The unified analysis page (all 3 analyses in one tab) |
| `apps/frontend/src/lib/api.js` | `submitClaim()`, `analyzeDeepfake*()`, `checkScam()` |

---

## How to run locally

```bash
# Backend
cd apps/backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# Frontend (separate terminal)
cd apps/frontend
npm install && npm run dev
```

Visit http://localhost:5173 → click "Analyze"

**Mock mode** (default): All AI calls return canned JSON instantly, no real API key needed.
**Real mode**: Set `AI_MOCK_MODE=false` and `GEMINI_API_KEY=your-key` in `apps/backend/.env`.

---

## How the AI pipeline works

### Text / URL analysis

```
User submits text or URL
          │
          ▼
Analyze.jsx  →  submitClaim({ source_type, text/url })
                                │
                                ▼
              POST /api/v1/factcheck  →  factcheck.py
                                               │
                          ┌────────────────────┤
                          │                    │
                          ▼                    ▼
               content_extractor.py      (DB save)
               (fetches URL content)
                          │
                          ▼
               debate_pipeline.py
               ┌──────────────────────────┐
               │  Pro Agent (Gemini Pro)  │  argues the claim IS true
               │  Con Agent (Gemini Pro)  │  argues the claim IS false
               │  Judge Agent (Gemini Pro)│  synthesizes verdict
               └──────────────────────────┘
                          │
                          ▼
              FactCheckResponse → saved to MongoDB → returned to frontend
```

The debate pipeline is the most important part. Each agent is a separate Gemini call.
The judge reads both arguments and produces the final verdict + confidence score.

### Deepfake analysis

```
User uploads image/audio/video
          │
          ▼
Analyze.jsx  →  FileReader.readAsDataURL → strip "data:...;base64," prefix
             →  analyzeDeepfakeImage({ image_b64: "..." })
                                │
                                ▼
              POST /api/v1/deepfake/image  →  deepfake.py
                                                   │
                          Single Gemini Pro call with the base64 data
                                                   │
              { is_deepfake: bool, confidence: float, reasoning: str }
```

### Scam detection

```
User types or pastes text
          │
          ▼
Analyze.jsx  →  checkScam({ text: "..." })
                                │
                                ▼
              POST /api/v1/scam/check  →  scam.py
                                               │
                     Gemini Pro simulates a RoBERTa + XGBoost ensemble
                                               │
  { is_scam: bool, confidence: float, model_scores: {...}, scam_type: str, reasoning: str }
```

**For text/URL submissions, fact-check AND scam-check run in parallel:**
```js
// In Analyze.jsx handleAnalyse()
const [factRes, scamRes] = await Promise.allSettled([
  submitClaim({ source_type, text, url }),
  checkScam({ text: text || url })
])
```

---

## The AI client (`gemini_client.py`)

This is the single point of contact with Google Gemini. Two modes:

**Mock mode** (`AI_MOCK_MODE=true`, default):
- Returns canned JSON from `_MOCK_RESPONSES` dictionary instantly
- No network calls, no API key needed
- Use this for local development and all tests

**Real mode** (`AI_MOCK_MODE=false`):
- Calls the actual Gemini API
- `generate_with_pro()` — Gemini 1.5 Pro (used for all analysis)
- `generate_with_flash()` — Gemini Flash (used for quick triage in the extension)

Adding a new mock response (when you add a new AI feature):
```python
# In gemini_client.py, add to _MOCK_RESPONSES:
"my_new_feature": '{"result": "mock value", "confidence": 0.9}'
```

---

## The unified Analyze page (`Analyze.jsx`)

Three tabs — **URL**, **Text**, **Media** — all handled by one component.

Key state variables:
```jsx
const [tab,           setTab]           = useState('url')      // active tab
const [factResult,    setFactResult]    = useState(null)       // fact-check result card
const [scamResult,    setScamResult]    = useState(null)       // scam check result card
const [deepfakeResult,setDeepfakeResult]= useState(null)       // deepfake result card
const [mediaKind,     setMediaKind]     = useState(null)       // 'image'|'audio'|'video'
```

Sub-components inside Analyze.jsx:
- `FactCard` — shows verdict badge, confidence ring, pro/con debate summary
- `ScamCard` — shows is_scam verdict, RoBERTa/XGBoost score bars
- `DeepfakeCard` — shows is_deepfake verdict, confidence ring, reasoning
- `ConfidenceMeter` — SVG circular progress ring (reused by all cards)
- `ScoreBar` — horizontal progress bar (used in ScamCard)

---

## Rate limits (Phase 7)

All AI endpoints are rate limited to prevent abuse:

| Endpoint | Limit |
|----------|-------|
| `POST /api/v1/factcheck` | 20 requests/minute per IP |
| `POST /api/v1/deepfake/image` | 20 requests/minute per IP |
| `POST /api/v1/deepfake/audio` | 20 requests/minute per IP |
| `POST /api/v1/deepfake/video` | 20 requests/minute per IP |
| `POST /api/v1/scam/check` | 30 requests/minute per IP |

If exceeded, the API returns HTTP 429 with `{"error": "Rate limit exceeded: ..."}`.

---

## Your next tasks

### Task 1 — Improve the debate pipeline verdict logic
In `debate_pipeline.py`, the judge agent produces the verdict.
You can tune the prompt to make it more nuanced or add more agent turns.

### Task 2 — Add source citations to fact-check results
The `FactCheckResponse` already has a `sources` field.
Wire the Serper web search adapter (`serper_adapter.py`) to pass real web results
to the Pro and Con agents so they can cite actual sources.

To enable: Set `SERPER_API_KEY=your-key` in `apps/backend/.env`.

### Task 3 — Improve the deepfake confidence calibration
The deepfake endpoints send only the first 500 chars of base64 to Gemini.
For real media analysis, you'd need to send actual binary data or use a
specialist vision API. Consider integrating a real deepfake model here.

### Task 4 — Add a feedback loop to improve results
Users can thumbs-up/down any result. This data goes to `POST /api/v1/feedback`.
Wire this up to actually retrain or tune the prompts based on user corrections.

---

## Running tests

```bash
cd apps/backend
source .venv/bin/activate

# Run just the analysis-related tests
pytest tests/test_factcheck.py tests/test_deepfake.py tests/test_scam.py -v

# Run all backend tests
pytest tests/ -q
```

Frontend tests:
```bash
cd apps/frontend
npm run test
```

---

## Key API endpoints

```bash
# Fact-check a URL
curl -X POST http://localhost:8000/api/v1/factcheck \
  -H "Content-Type: application/json" \
  -d '{"source_type": "url", "url": "https://example.com/article"}'

# Fact-check text
curl -X POST http://localhost:8000/api/v1/factcheck \
  -H "Content-Type: application/json" \
  -d '{"source_type": "text", "text": "The Earth is flat."}'

# Scam check
curl -X POST http://localhost:8000/api/v1/scam/check \
  -H "Content-Type: application/json" \
  -d '{"text": "URGENT: Your account has been suspended. Click here now!"}'

# Deepfake image (base64 required)
curl -X POST http://localhost:8000/api/v1/deepfake/image \
  -H "Content-Type: application/json" \
  -d '{"image_b64": "'"$(base64 < some-image.jpg)"'"}'

# See all API docs interactively
open http://localhost:8000/docs
```

---

## Key files reference

```
apps/backend/
  app/routes/factcheck.py        ← Fact-check endpoint + DB persistence
  app/routes/deepfake.py         ← Image/audio/video deepfake endpoints
  app/routes/scam.py             ← Scam + feedback endpoints
  app/routes/triage.py           ← Quick triage (used by Chrome extension)
  app/ai/gemini_client.py        ← Google Gemini wrapper (mock + real)
  app/ai/debate_pipeline.py      ← Pro vs Con vs Judge agent orchestration
  app/ai/factcheck_adapter.py    ← Google Fact Check Tools API adapter
  app/ai/serper_adapter.py       ← Serper web search adapter
  app/models/report.py           ← FactCheckRequest/Response Pydantic models
  app/models/deepfake.py         ← Deepfake request/response models
  app/models/scam.py             ← Scam check + feedback models
  app/core/rate_limit.py         ← Rate limiter singleton (slowapi)
  tests/test_factcheck.py        ← Tests for fact-check endpoint
  tests/test_deepfake.py         ← Tests for deepfake endpoints
  tests/test_scam.py             ← Tests for scam + feedback endpoints
  tests/test_rate_limit.py       ← Tests for rate limiting (429 responses)

apps/frontend/
  src/pages/Analyze.jsx          ← The unified analysis page (ALL analysis UI)
  src/lib/api.js                 ← submitClaim(), analyzeDeepfake*(), checkScam()
```

---

## Common questions

**Q: How do I switch from mock to real Gemini?**
```bash
# In apps/backend/.env:
AI_MOCK_MODE=false
GEMINI_API_KEY=AIza...your-key-here
```
Get a free key at https://aistudio.google.com/

**Q: The AI returns weird/malformed JSON. What happens?**
Each route has a JSON parser (`_parse_scam_json`, `_parse_json`) that uses regex
to extract JSON from the raw AI response. If parsing fails, the endpoint returns
a safe fallback response (e.g., `confidence=0.5, reasoning="Unable to parse..."`).

**Q: What is Promise.allSettled vs Promise.all?**
`Promise.allSettled` waits for ALL promises but doesn't fail if one rejects.
This means if fact-check fails, scam-check still shows its result (and vice versa).
`Promise.all` would cancel everything if any one call fails.

**Q: What does the `@limiter.limit("20/minute")` decorator do?**
It wraps the endpoint with slowapi rate limiting. The decorator must go BELOW
`@router.post(...)` (not above it) — otherwise FastAPI registers the unwrapped
function and the rate limit never fires.
