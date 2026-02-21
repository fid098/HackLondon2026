/**
 * Background Service Worker — Phase 4 implementation.
 *
 * Acts as the secure message broker between content scripts, popup, and the API.
 *
 * Responsibilities:
 *   1. Context menu — registers "Analyze with TruthGuard" on text selection.
 *   2. Message routing — ANALYZE_TEXT, GET_SETTINGS, SET_SETTINGS.
 *   3. API proxy — calls POST /api/v1/triage; API keys never touch content scripts.
 *   4. Badge counter — increments the action-icon badge on each flagged post.
 *   5. Settings storage — persists user prefs via chrome.storage.sync.
 *
 * Security:
 *   - API key is NEVER stored here or in any extension file.
 *   - All calls use the backend proxy URL from settings.
 *   - CORS headers are validated server-side.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Default settings ───────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'medium',
  apiBase: 'http://localhost:8000',
}

// ── Install / update ──────────────────────────────────────────────────────────

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[TruthGuard BG] Installed/updated:', details.reason)

  // Register the right-click context menu
  chrome.contextMenus.create({
    id: 'tg-analyze-selection',
    title: 'Analyze with TruthGuard',
    contexts: ['selection'],
  })

  // Write default settings on first install (don't overwrite on update)
  if (details.reason === 'install') {
    chrome.storage.sync.set(DEFAULT_SETTINGS)
  }
})

// ── Context menu handler ───────────────────────────────────────────────────────

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'tg-analyze-selection' || !info.selectionText) return

  try {
    const result = await analyzeViaAPI(info.selectionText)
    if (tab?.id) {
      chrome.tabs.sendMessage(tab.id, { type: 'SHOW_RESULT', payload: result })
    }
  } catch (err) {
    console.error('[TruthGuard BG] Context menu analysis failed:', err)
  }
})

// ── Message routing ────────────────────────────────────────────────────────────

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
          updateBadge()
        })
        .catch((err: Error) => sendResponse({ ok: false, error: err.message }))
      return true  // keep message channel open for async response
    }

    if (message.type === 'GET_SETTINGS') {
      chrome.storage.sync.get(DEFAULT_SETTINGS, (s) =>
        sendResponse({ ok: true, data: s }),
      )
      return true
    }

    if (message.type === 'SET_SETTINGS') {
      chrome.storage.sync.set(message.payload as Partial<Settings>, () =>
        sendResponse({ ok: true }),
      )
      return true
    }

    sendResponse({ ok: false, error: 'Unknown message type' })
    return false
  },
)

// ── API call ───────────────────────────────────────────────────────────────────

async function getSettings(): Promise<Settings> {
  return new Promise((resolve) =>
    chrome.storage.sync.get(DEFAULT_SETTINGS, (s) => resolve(s as Settings)),
  )
}

async function analyzeViaAPI(text: string): Promise<TriageResult> {
  const settings = await getSettings()

  if (!settings.enabled) {
    return { verdict: 'UNVERIFIED', confidence: 0, summary: 'TruthGuard is disabled.' }
  }

  const res = await fetch(`${settings.apiBase}/api/v1/triage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })

  if (!res.ok) throw new Error(`API error ${res.status}`)
  return res.json()
}

// ── Badge counter ──────────────────────────────────────────────────────────────

let _flaggedCount = 0

function updateBadge(): void {
  _flaggedCount += 1
  const label = _flaggedCount > 99 ? '99+' : String(_flaggedCount)
  chrome.action.setBadgeText({ text: label })
  chrome.action.setBadgeBackgroundColor({ color: '#ef4444' })
}

export {}
