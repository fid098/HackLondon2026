# TruthGuard Chrome Extension

A Chrome extension (Manifest V3) that detects misinformation and deepfakes in real-time across social media platforms and video conferencing applications.

---

## What It Does

TruthGuard runs in the background as you browse and:

- **Scans social media posts** for misinformation, AI-generated text, and factual inaccuracies
- **Detects deepfake video** by sampling frames from video elements on the page
- **Monitors live meeting feeds** (Google Meet, Zoom) for AI-generated video in real-time
- **Lets you highlight any text** and check it on demand
- **Lets you flag suspicious content** and submits a geolocated report to a shared heatmap

---

## Features

### Automatic Post Scanning

The content script watches for new DOM elements via `MutationObserver`. When a new post appears on a supported social media platform it:

1. Extracts the post text using platform-specific CSS selectors
2. Sends it to the backend triage API (minimum 20 characters)
3. Injects a verdict badge directly below the post if confidence ≥ 60%

Supported platforms: **X/Twitter, Instagram, Facebook, YouTube, TikTok, Telegram Web**

### Text Selection Analysis

Highlight any text on a page → a floating "Check ->" tooltip appears. Click it to:

- Run the text through the misinformation triage model
- See the verdict, confidence score, and a plain-English summary
- See phrase-level highlights marking specific segments as AI-generated, accurate, or misleading

Right-clicking selected text also exposes an **"Analyze with TruthGuard"** context menu entry.

### Deepfake Video Detection

Every 5 seconds, the content script finds all visible `<video>` elements (minimum 160×90px) and:

1. Captures a JPEG frame via an offscreen `<canvas>` at up to 640px wide
2. Sends the base64 image to the deepfake detection API
3. Averages scores across frames (with a consistency boost for repeated detections)
4. Overlays a risk badge on the video element when the score exceeds the threshold (75% for social media, 65% for meeting feeds)

Per-video statistics (sample count, average score, high-risk frame count) are tracked for the lifetime of the page.

### Meeting Mode

When enabled, Meeting Mode activates specialized deepfake scanning for live video conference feeds on **Google Meet** and **Zoom**. The popup shows:

- Whether you are the meeting host
- Number of active video feeds detected
- Total frames sampled
- Latest deepfake risk score and label

The scan interval is 2 seconds and the risk threshold is lower (65%) to be more sensitive for live communication.

### User Reporting / Heatmap Flagging

Click **"Flag suspicious meeting feed"** or **"Flag current page media"** in the popup to:

1. Attach your geolocation (requires user permission)
2. Submit a report with source URL, platform, reason, and confidence score to the heatmap API
3. Receive a confirmation with the event ID and severity classification

### Settings

All settings sync across your browser profile via `chrome.storage.sync`:

| Setting | Description |
|---|---|
| Enabled | Master switch — pauses all scanning |
| Red-Flag Mode | Enables background video deepfake protection |
| Meeting Mode | Activates live feed scanning for Meet/Zoom |
| Sensitivity | Low / Medium / High — adjusts detection thresholds |
| API Endpoint | URL of the TruthGuard backend |

---

## How It Works

### Architecture

Three components communicate via Chrome's `runtime.onMessage` API:

```
┌─────────────────────────────────────────────────────────────┐
│  Content Script (injected into page)                        │
│  - MutationObserver → finds new posts                       │
│  - mouseup → text selection tooltip                         │
│  - setInterval → video frame sampling                       │
│  - Renders badges, tooltips, highlight marks                │
└────────────────────┬────────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
┌────────────────────▼────────────────────────────────────────┐
│  Background Service Worker                                  │
│  - Receives all messages from content script & popup        │
│  - Makes all fetch() calls to the backend (CORS-safe)       │
│  - Manages chrome.storage.sync                              │
│  - Registers context menu items                             │
│  - Updates toolbar badge counter                            │
└────────────────────┬────────────────────────────────────────┘
                     │ chrome.runtime.sendMessage
┌────────────────────▼────────────────────────────────────────┐
│  Popup UI (React 18, TypeScript)                            │
│  - Status display (API health, database)                    │
│  - Toggle switches for all settings                         │
│  - Manual trigger buttons                                   │
│  - Result display with verdict and confidence               │
└─────────────────────────────────────────────────────────────┘
```

### Message Types

| Message | Direction | Purpose |
|---|---|---|
| `ANALYZE_TEXT` | Content → Background | Run text through triage API |
| `ANALYZE_VIDEO_FRAME` | Content → Background | Analyze a captured video frame |
| `FLAG_VIDEO` | Popup → Background | Submit a user report to heatmap |
| `GET_SETTINGS` | Any → Background | Read current settings |
| `SET_SETTINGS` | Popup → Background | Write settings to storage |
| `SHOW_RESULT` | Background → Content | Display result banner on page |
| `APPLY_PAGE_HIGHLIGHTS` | Background → Content | Apply phrase-level text highlights |
| `TG_GET_MEETING_STATUS` | Popup → Content | Get live meeting scan statistics |
| `TG_SET_MEETING_MODE` | Popup → Content | Enable/disable meeting scanning |
| `TG_FORCE_SCAN_MEETING` | Popup → Content | Immediately scan all meeting videos |
| `TG_SETTINGS_PATCH` | Background → Content | Apply partial settings update |

### Backend API Endpoints

All API calls are made from the service worker — never directly from the content script.

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/v1/triage` | POST | Misinformation & AI text analysis |
| `/api/v1/deepfake/image` | POST | Deepfake detection from image frame |
| `/api/v1/heatmap/flags` | POST | Submit user report with location |
| `/health` or `/api/health` | GET | Backend connectivity check |

### Verdict Types

| Verdict | Colour | Meaning |
|---|---|---|
| `TRUE` | Green | Content appears accurate |
| `FALSE` | Red | Content appears false |
| `MISLEADING` | Amber | Content is partially or contextually misleading |
| `AI_GENERATED` | Orange | Text is likely AI-written |
| `UNVERIFIED` | Indigo | Cannot be verified either way |
| `SATIRE` | Purple | Content is satirical |

---

## Project Structure

```
src/
├── popup/
│   ├── index.html        # Popup HTML shell (340px wide)
│   ├── main.tsx          # React entry point
│   └── Popup.tsx         # Full popup UI (toggles, status, results)
├── content/
│   ├── index.ts          # Content script — DOM scanning, video capture, overlays
│   └── overlay.css       # Styles for all injected UI elements
├── background/
│   └── index.ts          # Service worker — message broker, API proxy
└── test/
    ├── setup.ts
    └── content.test.ts   # Unit tests for pure utility functions
```

---

## Development Setup

```bash
npm install
npm run dev       # Watch mode — rebuilds on file changes
npm run build     # Production build → dist/
npm run test      # Run unit tests (Vitest)
npm run lint      # ESLint
npm run typecheck # TypeScript type checking
```

Load the extension in Chrome:

1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `apps/extension/dist/`

To submit to the Chrome Web Store, zip the `dist/` directory.

---

## Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read current tab URL and metadata |
| `storage` | Sync settings across browser profiles |
| `contextMenus` | Right-click "Analyze with TruthGuard" |
| `geolocation` | Attach location to user-submitted flags (opt-in prompt) |
| `https://*/*`, `http://*/*` | Inject content script into matched pages |

---

## Security

- **No API keys in extension code** — all AI calls go through the backend proxy
- **Service worker acts as CORS proxy** — content scripts never call external APIs directly
- **Content scripts are read-only** — they read DOM content and render overlays; no arbitrary code execution
- **Canvas taint protection** — gracefully handles protected video streams that block frame capture
- **Geolocation is opt-in** — users are prompted before location is attached to any report
- **Orphaned script detection** — content script checks `chrome.runtime.id` to detect extension reloads and stops safely
