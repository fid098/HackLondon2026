# TruthGuard Chrome Extension

Chrome Extension (Manifest V3) for TruthGuard — real-time misinformation and deepfake detection across social media and video conferencing.

## Features

- **Automatic post scanning** — detects new posts on X/Twitter, Instagram, Facebook, YouTube, TikTok, Telegram Web and injects verdict badges
- **Text selection analysis** — highlight any text → floating tooltip → click to analyse
- **Deepfake video detection** — samples frames from video elements every 5 seconds, overlays a risk badge when confidence exceeds threshold
- **Meeting mode** — lower-threshold deepfake scanning for Google Meet and Zoom live feeds
- **User reporting** — flag suspicious content with geolocation to the shared heatmap
- **Context menu** — right-click selected text → "Analyze with TruthGuard"

## Development setup

```bash
npm install
npm run dev    # Watch mode — rebuilds on file changes
```

Then load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked** → select `apps/extension/dist/`

## Build for production

```bash
npm run build
```

Expected output:
```
vite v5.4.21 building for production...
✓ 34 modules transformed.
dist/src/popup/index.html    0.57 kB │ gzip:  0.39 kB
dist/background/index.js     3.47 kB │ gzip:  1.46 kB
dist/content/index.js       10.37 kB │ gzip:  3.87 kB
dist/popup/index.js        156.94 kB │ gzip: 50.62 kB
✓ built in ~900ms
```

Output is in `dist/` — zip it to submit to the Chrome Web Store.

## Running tests

```bash
npm run test
```

Tests cover pure utility functions. Chrome APIs are not available in the test environment.

## Other commands

```bash
npm run lint      # ESLint
npm run typecheck # TypeScript type checking
```

## How it works

Three components communicate via `chrome.runtime.sendMessage`:

| Component | Role |
|---|---|
| **Content script** (`src/content/index.ts`) | Watches DOM, samples video frames, renders badges and tooltips |
| **Background service worker** (`src/background/index.ts`) | Routes messages, makes all API calls (CORS-safe proxy), manages storage |
| **Popup** (`src/popup/Popup.tsx`) | React UI — toggles, status display, manual triggers |

All AI calls go through the backend — the extension never calls external APIs directly.

## Project structure

```
src/
├── popup/
│   ├── index.html    # Popup HTML shell
│   ├── main.tsx      # React entry point
│   └── Popup.tsx     # Popup UI component
├── content/
│   ├── index.ts      # Content script (injected into web pages)
│   └── overlay.css   # Styles for injected UI elements
├── background/
│   └── index.ts      # Service worker (message routing + API proxy)
└── test/
    ├── setup.ts
    └── content.test.ts
```

## Security constraints

- **No API keys in extension code** — ever
- All AI analysis goes through the backend proxy
- Content scripts only read page content, never execute arbitrary code
- `host_permissions` limited to necessary domains
- Geolocation is opt-in — user is prompted before any report is submitted
