# TruthGuard Chrome Extension Guide

## Phase 0 Status

Scaffold complete. The extension:
- Has a working popup showing API connectivity
- Has a content script that loads on X/Instagram/Facebook
- Has a background service worker
- Builds successfully with Vite

## Development Setup

```bash
cd apps/extension
npm install
npm run dev      # Watch mode — auto-rebuilds on save
```

Load in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode** (top right)
3. Click **Load unpacked** → select `apps/extension/dist/`

After code changes, click the refresh icon on the extension card.

## Build for Production

```bash
npm run build
# Output: apps/extension/dist/
```

Zip `dist/` to submit to the Chrome Web Store.

## Security Architecture

```
BROWSER PAGE                EXTENSION CONTEXT           BACKEND
-----------                 -----------------           -------
content.js                  background.js               FastAPI
(reads DOM only)  ───────▶  (message router) ─────────▶ /factcheck
(no API keys)     messages  (no API keys)    HTTP        (has keys)
```

**Rules that must never be violated:**
1. API keys NEVER go in extension code (content, background, popup)
2. All AI calls go through the backend proxy
3. Content scripts only read, never write to page state unless user-initiated
4. `host_permissions` covers only necessary domains

## Phase 4 Implementation Plan

When Phase 4 begins, the content script will:

1. **DOM Scanning** — identify post/tweet text by platform-specific selectors:
   - X/Twitter: `[data-testid="tweetText"]`
   - Instagram: `._a9zs` (verify — changes frequently)

2. **Quick Triage** — send post text to backend `/factcheck` (Gemini Flash):
   - `{ text: "...", mode: "quick" }` → `{ flagged: bool, confidence: float }`

3. **Overlay Badge** — inject a small, non-disruptive badge on flagged posts:
   - Shows `⚠ Check` with confidence percentage
   - Click → opens full report in web app tab

4. **Selection Analysis** — right-click on highlighted text → "Analyze with TruthGuard":
   - Sends selection to backend for full Gemini Pro analysis
   - Returns a report link

## Extension Settings (Phase 4)

Stored in `chrome.storage.sync`:
```json
{
  "enabled": true,
  "sensitivity": "medium",
  "api_base_url": "https://your-domain.com",
  "show_overlays": true
}
```

## Testing

```bash
npm run test
```

Unit tests cover pure functions (DOM extraction, text processing).
Chrome APIs (`chrome.runtime`, `chrome.storage`) are NOT available in Vitest — test only pure functions.

For integration testing, load the extension manually in Chrome and test on live pages.
