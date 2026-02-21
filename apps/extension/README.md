# TruthGuard Chrome Extension

Chrome Extension (Manifest V3) for TruthGuard.

## Phase 0 status

Scaffold only — popup renders, content script logs on matched pages, background service worker registers.

Real functionality (DOM scanning, overlay badges, analysis) is implemented in Phase 4.

## Development setup

```bash
npm install
npm run dev    # Watch mode — rebuilds on file changes
```

Then load the extension in Chrome:
1. Open `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked" → select `apps/extension/dist/`

## Build for production

```bash
npm run build
```

Output is in `dist/` — zip it to submit to the Chrome Web Store.

## Running tests

```bash
npm run test
```

Tests cover pure utility functions. Chrome APIs are not available in the test environment.

## Security constraints

- **NO API keys in extension code** — ever
- All AI analysis goes through the backend proxy
- Content scripts only read page content, never execute arbitrary code
- `host_permissions` limited to necessary domains

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
│   └── index.ts      # Service worker (message routing)
└── test/
    ├── setup.ts
    └── content.test.ts
```
