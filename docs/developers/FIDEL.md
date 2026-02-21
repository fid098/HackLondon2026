# TruthGuard — Fidel's Developer Guide
## Area: Chrome Extension (Content Script · Popup · Background Worker)

Welcome Fidel! This guide covers the TruthGuard Chrome extension — the part that runs directly inside users' browsers.

---

## What you own

| File | What it does |
|------|-------------|
| `apps/extension/src/popup/Popup.tsx` | The 320px popup UI that appears when you click the extension icon |
| `apps/extension/src/content/index.ts` | Content script — injected into social media pages (X, Instagram, etc.) |
| `apps/extension/src/content/utils.ts` | Helper functions: platform selectors, text extraction, badge styling |
| `apps/extension/src/content/overlay.css` | CSS for badges and tooltips injected into pages |
| `apps/extension/src/background/index.ts` | Service worker — handles API calls on behalf of content scripts |
| `apps/extension/manifest.json` | Extension configuration: permissions, matched URLs, icons |

---

## How to run / install the extension

```bash
cd apps/extension
npm install
npm run build          # builds to apps/extension/dist/
```

Then in Chrome:
1. Go to `chrome://extensions/`
2. Enable **Developer mode** (top right toggle)
3. Click **"Load unpacked"**
4. Select the `apps/extension/dist/` folder

After making changes: run `npm run build` again, then click the **refresh icon** on the extension card in `chrome://extensions/`.

For development with auto-rebuild:
```bash
npm run dev    # watches files and rebuilds on save
```

You still need to manually refresh the extension in Chrome after each rebuild.

---

## Extension architecture

Chrome extensions have 3 isolated environments that communicate via message passing:

```
┌─────────────────────────────────────────────────────────────┐
│                    CHROME EXTENSION                         │
│                                                             │
│  ┌─────────────┐    messages     ┌─────────────────────┐   │
│  │   Popup.tsx  │ ◄────────────► │  background/index.ts │   │
│  │  (popup UI)  │                │  (service worker)    │   │
│  └─────────────┘                └──────────┬──────────┘   │
│                                             │               │
│                                    fetch()  │  HTTP calls   │
│                                             ▼               │
│  ┌─────────────────────────────┐   http://localhost:8000   │
│  │  content/index.ts           │                            │
│  │  (injected into web pages)  │ ◄──────────────────────   │
│  │  - scans posts              │    ANALYZE_TEXT message    │
│  │  - injects badges           │    SHOW_RESULT message     │
│  └─────────────────────────────┘                            │
└─────────────────────────────────────────────────────────────┘
```

**Why this architecture?**
- **Content scripts** can read page DOM but have limited network permissions.
- **Background workers** have full network access (can call the API).
- **Popups** run in their own iframe — separate from both.
- All three communicate via `chrome.runtime.sendMessage()`.

---

## The popup (`Popup.tsx`)

A 320px React component. Key features:

1. **Connection status** — pings `GET /health` on load to check if the backend is running.
2. **On/Off toggle** — persisted to `chrome.storage.sync` via the background worker.
3. **Sensitivity selector** — Low / Medium / High (controls `BADGE_THRESHOLD` in content script).
4. **"Analyse this page" button** — sends the current tab URL to `POST /api/v1/triage`.
5. **Result card** — shows verdict + confidence from the triage call.

Message types the popup sends to the background worker:
```ts
{ type: 'GET_SETTINGS' }         // load saved settings from chrome.storage.sync
{ type: 'SET_SETTINGS', payload: { enabled, sensitivity } }  // save settings
```

The popup talks DIRECTLY to the backend for the "Analyse this page" feature
(no background worker intermediary needed here since it's a simple fetch).

---

## The content script (`content/index.ts`)

Injected into matching pages (defined in `manifest.json` under `content_scripts.matches`).

### What it does on each matching page:

1. **Scans existing posts** (`scanPosts()`) — finds post elements using platform-specific CSS selectors.
2. **Sends each post to the background** (`sendAnalyze(text, callback)`) for triage.
3. **Injects a badge** (`injectBadge()`) on posts where `confidence >= BADGE_THRESHOLD`.
4. **Listens for text selection** — shows an "Analyze ↗" tooltip when the user highlights text.
5. **Handles new posts** — a `MutationObserver` re-runs `scanPosts()` whenever the DOM changes (infinite scroll, new tweets loading, etc.).

### Message types received from background:
```ts
{ type: 'SHOW_RESULT', payload: { verdict, confidence, summary } }
// Displays a result banner at the bottom of the page (context-menu flow)
```

### Message types sent to background:
```ts
{ type: 'ANALYZE_TEXT', payload: "the post text" }
// Background calls POST /api/v1/triage and replies with the result
```

### Platform selectors (in `utils.ts`)

```ts
// How the content script knows which elements are "posts" on each platform
export function getPostSelector(hostname: string): string | null {
  if (hostname.includes('twitter.com') || hostname.includes('x.com'))
    return 'article[data-testid="tweet"]'
  if (hostname.includes('instagram.com'))
    return 'article'
  // Add more platforms here
  return null
}
```

To add a new platform (e.g., Facebook), add a new `if` branch and find its post selector
using Chrome DevTools → Inspector on a Facebook post.

---

## The background service worker (`background/index.ts`)

Runs persistently behind the scenes. Handles:

1. **API proxy** — receives `ANALYZE_TEXT` from content scripts, calls `POST /api/v1/triage`, replies with result.
2. **Settings storage** — `GET_SETTINGS` / `SET_SETTINGS` — reads/writes `chrome.storage.sync`.
3. **Context menu** — right-click → "Analyze with TruthGuard" on selected text.

```ts
// Core message handler pattern:
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ANALYZE_TEXT') {
    fetch(`${API_BASE}/api/v1/triage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message.payload }),
    })
    .then(r => r.json())
    .then(data => sendResponse({ ok: true, data }))
    .catch(() => sendResponse({ ok: false }))
    return true  // ← IMPORTANT: return true to keep the channel open for async reply
  }
})
```

---

## The manifest (`manifest.json`)

Key sections you'll edit:

```json
{
  "manifest_version": 3,
  "permissions": ["storage", "contextMenus", "tabs", "activeTab"],

  "content_scripts": [{
    "matches": ["*://*.twitter.com/*", "*://*.x.com/*", "*://*.instagram.com/*"],
    "js": ["content/index.js"],
    "css": ["content/overlay.css"]
  }],

  "background": {
    "service_worker": "background/index.js"
  },

  "action": {
    "default_popup": "popup/index.html"
  }
}
```

To add a new matched website: add its URL pattern to `content_scripts.matches`.

---

## Badge and tooltip CSS (`overlay.css`)

The badges injected into social media pages are styled in `overlay.css`.
This file is SEPARATE from the web app's CSS — it must be self-contained
because it runs inside other websites.

```css
.tg-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 700;
  /* ... */
}

.tg-badge.tg-true        { background: rgba(16,185,129,0.15); color: #10b981; }
.tg-badge.tg-false       { background: rgba(239,68,68,0.15);  color: #ef4444; }
.tg-badge.tg-misleading  { background: rgba(245,158,11,0.15); color: #f59e0b; }
```

---

## Your next tasks

### Task 1 — Add Facebook support
In `content/utils.ts`, add Facebook post selectors:
```ts
if (hostname.includes('facebook.com'))
  return '[data-ad-preview="message"], .x193iq5w'  // inspect FB posts to find selector
```
Then add `"*://*.facebook.com/*"` to `manifest.json` content_scripts matches.

### Task 2 — Add YouTube comment detection
YouTube comments load dynamically. Use a `MutationObserver` targeting `#comments yt-formatted-string`.

### Task 3 — Improve the badge design
Edit `overlay.css` and the `injectBadge()` function to make badges smaller and less intrusive.
Consider replacing the text badge with just a small coloured dot on posts.

### Task 4 — Add a keyboard shortcut
In `manifest.json`, add:
```json
"commands": {
  "analyze-selection": {
    "suggested_key": { "default": "Ctrl+Shift+A" },
    "description": "Analyze selected text with TruthGuard"
  }
}
```
Then listen for it in the background worker and trigger the analysis flow.

### Task 5 — Persist results in extension storage
Store the last 10 analysis results in `chrome.storage.local` so users can
see their analysis history in the popup.

---

## Running tests

```bash
cd apps/extension
npm install
npm test           # runs vitest

# Watch mode
npm run test -- --watch
```

Tests are in `apps/extension/src/test/content.test.ts`.

---

## Debugging the extension

**Popup**: Right-click the extension icon → "Inspect popup" → DevTools opens for the popup.

**Content script**: Open DevTools on any matched page (e.g., twitter.com).
The content script's console.log messages appear in the regular page console,
filtered by source. Look for `content/index.ts` entries.

**Background worker**: Go to `chrome://extensions/` → click "Service Worker" link
under the TruthGuard card. This opens a dedicated DevTools for the background worker.

**View injected badges**: Open DevTools → Elements panel → search for `tg-badge`.

---

## Key files reference

```
apps/extension/
  manifest.json                    ← Extension config (permissions, matches, icons)
  src/popup/
    Popup.tsx                      ← YOUR MAIN FILE (popup React component)
    index.html                     ← Popup HTML shell
    main.tsx                       ← React root mount
  src/content/
    index.ts                       ← YOUR MAIN FILE (page injection logic)
    utils.ts                       ← Platform selectors + text helpers
    overlay.css                    ← Injected badge/tooltip styles
  src/background/
    index.ts                       ← Service worker (API proxy + storage + context menu)
  src/test/
    content.test.ts                ← Content script tests
    setup.ts                       ← Test environment setup (mocks chrome.* APIs)
  vite.config.ts                   ← Build config (outputs to dist/)
```

---

## Common questions

**Q: Why can't the content script call the API directly?**
Content scripts run with the page's security context. Cross-origin fetch to
`localhost:8000` would be blocked by CORS. The background worker has access
to the extension's own origin, which bypasses this restriction.

**Q: What is `return true` in the message handler?**
Chrome's message passing API is synchronous by default. Returning `true` from
the `onMessage` listener tells Chrome to keep the response channel open so
you can call `sendResponse` asynchronously (after the `fetch` completes).
Without it, the channel closes and the content script never receives the result.

**Q: What is Manifest V3?**
Chrome's current extension platform (replaced MV2 in 2023). Key differences:
- Background pages → service workers (no persistent state; wake up on demand)
- More limited permissions
- No `eval()` or remote code execution

**Q: How do I change the API URL from localhost?**
In `Popup.tsx`, `DEFAULT_SETTINGS.apiBase` is set to `http://localhost:8000`.
For production, this should be the deployed API URL. Wire this to an environment
variable by passing it through `vite.config.ts`:
```ts
define: { 'import.meta.env.VITE_API_URL': JSON.stringify(process.env.VITE_API_URL) }
```
