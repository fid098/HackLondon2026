/**
 * Background Service Worker — Phase 4 implementation.
 *
 * DEVELOPER: Fidel
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the extension's "backend" — a service worker that runs persistently
 * in the background. It acts as the secure message broker between content
 * scripts, the popup, and the TruthGuard API.
 *
 * RESPONSIBILITIES
 * ─────────────────
 * 1. Context menu — registers "Analyze with TruthGuard" on right-click.
 *    When triggered, calls the API and sends the result to the content script.
 * 2. Message routing — handles ANALYZE_TEXT, GET_SETTINGS, SET_SETTINGS.
 * 3. API proxy — all fetch() calls to the backend happen here, not in content scripts.
 *    Content scripts cannot call the API directly (blocked by CORS).
 * 4. Badge counter — increments the red number badge on the toolbar icon
 *    each time a flagged post is detected.
 * 5. Settings storage — reads/writes user preferences via chrome.storage.sync.
 *    chrome.storage.sync (used here) syncs across the user's devices.
 *    chrome.storage.local (not used here) stays on one device only.
 *
 * SECURITY
 * ─────────
 * - No API keys are stored here. The backend validates requests server-side.
 * - All API calls use settings.apiBase (defaults to localhost:8000).
 * - CORS is validated server-side; the extension's origin bypasses the page CORS.
 *
 * THE `return true` PATTERN (CRITICAL — do not remove)
 * ──────────────────────────────────────────────────────
 * chrome.runtime.onMessage.addListener() is synchronous by default.
 * If you return without calling sendResponse, the channel closes immediately.
 * But our API calls are ASYNC (they involve a fetch() that takes time).
 * Returning `true` from the listener tells Chrome: "I will call sendResponse
 * asynchronously — keep the channel open."
 * Without `return true`, the content script callback receives `undefined`
 * instead of the API result because Chrome closed the channel before fetch() resolved.
 *
 * See docs/developers/FIDEL.md for full architecture diagram and task list.
 */

// ── Types ──────────────────────────────────────────────────────────────────────

type Sensitivity = 'low' | 'medium' | 'high'

interface Settings {
  enabled: boolean
  sensitivity: Sensitivity
  apiBase: string
}

interface TriageResult {
  verdict: string
  confidence: number
  summary: string
}

// ── Default settings ────────────────────────────────────────────────────────────
// These are written to chrome.storage.sync on first install.
// On subsequent updates (reason === 'update'), these defaults are NOT re-applied
// so that any user customisations are preserved.
const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'medium',
  apiBase: 'http://localhost:8000',  // change to production URL for deployment
}

// ── Install / update handler ────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TruthGuard BG] Installed/updated:', details.reason)

  // Register the right-click context menu entry.
  // contexts: ['selection'] means it only appears when the user has text selected.
  chrome.contextMenus.create({
    id:       'tg-analyze-selection',
    title:    'Analyze with TruthGuard',
    contexts: ['selection'],
  })

  // Write default settings ONLY on first install (reason === 'install').
  // On updates we skip this so user's saved sensitivity/apiBase are preserved.
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS)
  }
})

// ── Context menu click handler ──────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  // Guard: ignore clicks on other menu items or if no text was selected
  if (info.menuItemId !== 'tg-analyze-selection' || !info.selectionText) return

  try {
    const result = await analyzeViaAPI(info.selectionText)
    if (tab?.id) {
      // Send the result to the content script running in that tab.
      // The content script's onMessage listener will call showResultBanner().
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', payload: result })
    }
  } catch (err) {
    console.error('[TruthGuard BG] Context menu analysis failed:', err)
  }
})

// ── Message routing ─────────────────────────────────────────────────────────────
//
// Handles three message types from content scripts and the popup:
//
//   ANALYZE_TEXT: { type, payload: string }
//     → calls analyzeViaAPI(text), replies { ok: true, data: TriageResult }
//     → return true (REQUIRED for async response — see file header)
//
//   GET_SETTINGS: { type }
//     → reads chrome.storage.sync, replies { ok: true, data: Settings }
//     → return true (storage.get is async)
//
//   SET_SETTINGS: { type, payload: Partial<Settings> }
//     → writes to chrome.storage.sync, replies { ok: true }
//     → return true (storage.set is async)

chrome.runtime.onMessage.addListener(
  (
    message: { type: string; payload?: unknown },
    _sender: chrome.runtime.MessageSender,
    sendResponse: (response: unknown) => void,
  ) => {
    if (message.type === 'ANALYZE_TEXT') {
      const text = message.payload as string
      analyzeViaAPI(text)
        .then((result) => {
          sendResponse({ ok: true, data: result })
          // Increment the toolbar badge counter for each flagged result
          updateBadge()
        })
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }))
      return true   // ← KEEP THIS: tells Chrome to wait for the async sendResponse call
    }

    if (message.type === 'GET_SETTINGS') {
      // chrome.storage.sync.get() is async — that's why return true is needed here too
      chrome.storage.sync.get(DEFAULT_SETTINGS, (s) =>
        sendResponse({ ok: true, data: s }),
      )
      return true   // ← KEEP THIS
    }

    if (message.type === 'SET_SETTINGS') {
      // Partial update — merges payload with existing storage values
      chrome.storage.sync.set(message.payload as Partial<Settings>, () =>
        sendResponse({ ok: true }),
      )
      return true   // ← KEEP THIS
    }

    // Unknown message type — reply immediately (no async needed, return false)
    sendResponse({ ok: false, error: 'Unknown message type' })
    return false
  },
)

// ── API call helper ─────────────────────────────────────────────────────────────

// Reads current settings from storage. Returns DEFAULT_SETTINGS if storage is empty.
// Wrapped in a Promise because chrome.storage.sync.get() uses callbacks, not async/await.
async function getSettings(): Promise<Settings> {
  return new Promise((resolve) =>
    chrome.storage.sync.get(DEFAULT_SETTINGS, (s) => resolve(s as Settings)),
  )
}

// Core function: sends text to the TruthGuard API and returns a TriageResult.
// Checks settings.enabled first — if the user turned scanning off, returns
// a polite UNVERIFIED result without making an API call.
async function analyzeViaAPI(text: string): Promise<TriageResult> {
  const settings = await getSettings()

  if (!settings.enabled) {
    return { verdict: 'UNVERIFIED', confidence: 0, summary: 'TruthGuard is disabled.' }
  }

  const res = await fetch(`${settings.apiBase}/api/v1/triage`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ text }),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Toolbar badge counter ───────────────────────────────────────────────────────
//
// The badge is the small red number shown on the extension icon in Chrome's toolbar.
// It increments every time a flagged post is detected anywhere in the browser.
//
// IMPORTANT: _flaggedCount is in-memory. Service workers are not persistent —
// Chrome may terminate and restart the background worker at any time.
// When restarted, _flaggedCount resets to 0. This is expected behaviour.
// To persist the count across restarts, store it in chrome.storage.local.
//
// TODO (Fidel): persist _flaggedCount to chrome.storage.local and load it on startup.

let _flaggedCount = 0

function updateBadge(): void {
  _flaggedCount += 1
  const label = _flaggedCount > 99 ? '99+' : String(_flaggedCount)
  chrome.action.setBadgeText({ text: label })
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })   // red
}

export {}
