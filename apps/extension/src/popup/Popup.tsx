/**
 * Popup.tsx — Chrome Extension Popup — Phase 4.
 *
 * DEVELOPER: Fidel
 * ─────────────────────────────────────────────────────────────────────────────
 * This is the 320px React component that appears when a user clicks the
 * TruthGuard shield icon in Chrome's toolbar.
 *
 * FEATURES
 * ─────────
 * - API connectivity status badge (checks GET /health on mount)
 * - On/Off toggle (persisted via chrome.storage.sync through the background worker)
 * - Sensitivity selector: Low / Medium / High (also persisted)
 * - "Analyse this page" button (calls POST /api/v1/triage with the current tab URL)
 * - Result card showing verdict + confidence + summary from triage
 * - Link to the TruthGuard web app
 *
 * WHY INLINE STYLES (no Tailwind)?
 * ──────────────────────────────────
 * Tailwind CSS is compiled for the main web app (apps/frontend). The popup
 * runs in its own isolated HTML page (popup/index.html) and is bundled
 * separately. Adding Tailwind to the popup would increase bundle size
 * significantly — inline styles keep the popup bundle under 20 KB.
 * The colour constants in `C` replace CSS variables.
 *
 * COMMUNICATION PATTERNS USED HERE
 * ──────────────────────────────────
 * 1. Direct fetch for health check and "Analyse this page":
 *    The popup CAN make direct fetch() calls to the API because it runs
 *    in its own extension context (not the page's security context).
 *    Content scripts CANNOT do this — they must go through the background worker.
 *
 * 2. chrome.runtime.sendMessage() for settings:
 *    Settings are persisted via chrome.storage.sync (synced across devices).
 *    The background worker owns storage — the popup delegates to it.
 *    GET_SETTINGS → returns { ok: true, data: Settings }
 *    SET_SETTINGS → saves partial settings update, returns { ok: true }
 *
 * 3. chrome.tabs.query() to get the current tab URL:
 *    { active: true, currentWindow: true } always returns the foreground tab.
 *    We guard against chrome:// URLs because those cannot be analysed.
 *
 * WHAT TO IMPROVE (your tasks as Fidel)
 * ────────────────────────────────────────
 * - Add a "History" tab showing the last 10 analyses (from chrome.storage.local).
 * - Show the badge count (number of flagged posts on the current page).
 * - Add a loading skeleton while the health check runs instead of "Connecting…".
 * - Make the web app link dynamic — use the apiBase setting so it points to
 *   the correct web app URL (currently hardcoded to localhost:5173).
 *
 * See docs/developers/FIDEL.md for full task list and extension architecture.
 */

import { useEffect, useState } from 'react'

type ConnectionStatus = 'checking' | 'connected' | 'disconnected'
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

// Default settings used before chrome.storage.sync has been loaded.
// Also used as the fallback if storage returns nothing (fresh install).
const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'medium',
  apiBase: 'http://localhost:8000',  // change to production URL for deployment
}

// ── Colour constants (replaces Tailwind/CSS variables in popup context) ────────

const C = {
  bg:       '#0f172a',           // page background
  surface:  'rgba(255,255,255,0.04)',
  border:   'rgba(255,255,255,0.08)',
  text:     '#f1f5f9',           // primary text
  muted:    '#64748b',           // secondary text
  accent:   '#34d399',           // emerald green — used for "ON" state and brand
  violet:   '#818cf8',           // indigo — used for "Analyse" button
  red:      '#ef4444',           // red — used for "OFF" state and errors
  amber:    '#f59e0b',           // amber — unused currently, available for warnings
} as const

// Maps verdict strings from the API to highlight colours in the result card
const VERDICT_COLORS: Record<string, string> = {
  TRUE:       '#10b981',
  FALSE:      '#ef4444',
  MISLEADING: '#f59e0b',
  UNVERIFIED: '#6366f1',
  SATIRE:     '#8b5cf6',
}

export default function Popup() {
  const [status,    setStatus]    = useState<ConnectionStatus>('checking')
  const [dbStatus,  setDbStatus]  = useState('')
  const [settings,  setSettings]  = useState<Settings>(DEFAULT_SETTINGS)
  const [analysing, setAnalysing] = useState(false)
  const [result,    setResult]    = useState<TriageResult | null>(null)

  // ── Load connection status + user settings on popup open ─────────────────────
  useEffect(() => {
    // 1. Health check — direct fetch to the backend /health endpoint.
    //    AbortSignal.timeout(5000) cancels the request after 5 seconds
    //    so the popup doesn't hang if the API is slow.
    //    The /health endpoint returns { status: 'ok', database: 'connected'|'disconnected' }.
    fetch(`${DEFAULT_SETTINGS.apiBase}/health`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((data: { status: string; database: string }) => {
        setStatus('connected')
        setDbStatus(data.database)   // shown in the status badge: "API connected · DB connected"
      })
      .catch(() => setStatus('disconnected'))

    // 2. Load persisted settings from chrome.storage.sync via the background worker.
    //    The background worker reads storage and replies with { ok: true, data: Settings }.
    //    We use the background worker rather than calling chrome.storage.sync directly
    //    here because it centralises storage access in one place.
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res?.ok) setSettings(res.data as Settings)
    })
  }, [])

  // ── Toggle scanning on/off ────────────────────────────────────────────────────
  // Optimistic update: update local state immediately, then persist to storage.
  // This makes the toggle feel instant even if storage is slightly slow.
  function toggleEnabled(): void {
    const next = { ...settings, enabled: !settings.enabled }
    setSettings(next)
    // SET_SETTINGS in the background worker calls chrome.storage.sync.set()
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { enabled: next.enabled } })
  }

  // ── Change scan sensitivity ────────────────────────────────────────────────────
  // Sensitivity controls BADGE_THRESHOLD in content/index.ts:
  //   low    = badge only when confidence ≥ 80%
  //   medium = badge when confidence ≥ 60%  (default)
  //   high   = badge when confidence ≥ 40%
  // The actual threshold logic lives in content/index.ts — this just persists the setting.
  function changeSensitivity(s: Sensitivity): void {
    const next = { ...settings, sensitivity: s }
    setSettings(next)
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { sensitivity: s } })
  }

  // ── Analyse the current browser tab ──────────────────────────────────────────
  function analyseCurrentTab(): void {
    setAnalysing(true)
    setResult(null)

    // chrome.tabs.query({ active: true, currentWindow: true }) returns the single
    // tab that is currently visible in the foreground window.
    // tabs[0]?.url is the URL of that tab — we pass it to POST /api/v1/triage.
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ''

      // Guard: chrome:// and edge:// URLs are internal browser pages that cannot
      // be analysed (they don't contain public content).
      if (!url || url.startsWith('chrome://')) {
        setResult({ verdict: 'UNVERIFIED', confidence: 0, summary: 'Cannot analyse this page.' })
        setAnalysing(false)
        return
      }

      // Direct fetch to the triage endpoint — the popup has permission to do this
      // directly without going through the background worker.
      // /api/v1/triage uses Gemini Flash (fast) — ideal for the popup's quick-check use case.
      fetch(`${settings.apiBase}/api/v1/triage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: `URL: ${url}` }),
      })
        .then((r) => r.json())
        .then((data: TriageResult) => { setResult(data); setAnalysing(false) })
        .catch(() => {
          setResult({ verdict: 'UNVERIFIED', confidence: 0, summary: 'API unreachable.' })
          setAnalysing(false)
        })
    })
  }

  // Status badge label — changes depending on connection state
  const statusLabel = {
    checking:     'Connecting…',
    connected:    `API connected · DB ${dbStatus}`,
    disconnected: 'API unreachable',
  }[status]

  // Colour for the result card border/background — based on verdict
  const vColor = result ? (VERDICT_COLORS[result.verdict] ?? C.muted) : C.muted

  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg, color: C.text, minHeight: 220 }}>

      {/* ── Header: logo + title + ON/OFF toggle ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        {/* Shield SVG icon */}
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.accent }}>TruthGuard</span>

        {/* ON/OFF toggle — right-aligned with marginLeft: auto */}
        <button
          onClick={toggleEnabled}
          title={settings.enabled ? 'Disable scanning' : 'Enable scanning'}
          style={{
            marginLeft: 'auto',
            padding: '3px 10px',
            borderRadius: 12,
            fontSize: 11,
            fontWeight: 700,
            background: settings.enabled ? 'rgba(16,185,129,0.15)' : 'rgba(239,68,68,0.12)',
            color:      settings.enabled ? C.accent : C.red,
            border:     `1px solid ${settings.enabled ? 'rgba(16,185,129,0.35)' : 'rgba(239,68,68,0.3)'}`,
            cursor: 'pointer',
          }}
        >
          {settings.enabled ? 'ON' : 'OFF'}
        </button>
      </div>

      <div style={{ fontSize: 11, color: C.muted, marginBottom: 12 }}>Misinformation &amp; Deepfake Detection</div>

      {/* ── Connection status badge ──
           Green = API connected, grey = still checking, red = unreachable */}
      <div style={{
        display: 'inline-flex', alignItems: 'center', gap: 6,
        padding: '5px 9px', borderRadius: 6, fontSize: 11, marginBottom: 12,
        background: status === 'connected' ? '#064e3b' : status === 'checking' ? '#1e293b' : '#450a0a',
        color:      status === 'connected' ? C.accent  : status === 'checking' ? C.muted   : '#fca5a5',
        border: '1px solid',
        borderColor: status === 'connected' ? '#065f46' : status === 'checking' ? '#334155' : '#7f1d1d',
      }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: status === 'connected' ? C.accent : status === 'checking' ? C.muted : '#f87171' }} />
        {statusLabel}
      </div>

      {/* ── Sensitivity selector ── */}
      <div style={{ marginBottom: 12 }}>
        <p style={{ fontSize: 11, color: C.muted, marginBottom: 6 }}>Scan sensitivity</p>
        <div style={{ display: 'flex', gap: 6 }}>
          {(['low', 'medium', 'high'] as Sensitivity[]).map((s) => (
            <button
              key={s}
              onClick={() => changeSensitivity(s)}
              style={{
                flex: 1, padding: '4px 0', borderRadius: 5, fontSize: 11, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
                background: settings.sensitivity === s ? 'rgba(99,102,241,0.2)' : C.surface,
                color:      settings.sensitivity === s ? C.violet : C.muted,
                border:     `1px solid ${settings.sensitivity === s ? 'rgba(99,102,241,0.4)' : C.border}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* ── "Analyse this page" button ──
           Disabled if: currently analysing, scanning is OFF, or API is unreachable.
           The button uses the current tab URL and calls POST /api/v1/triage directly. */}
      <button
        onClick={analyseCurrentTab}
        disabled={analysing || !settings.enabled || status !== 'connected'}
        style={{
          width: '100%', padding: '7px 0', borderRadius: 7, fontSize: 12,
          fontWeight: 600, cursor: analysing ? 'wait' : 'pointer',
          background: 'rgba(99,102,241,0.15)', color: C.violet,
          border: '1px solid rgba(99,102,241,0.35)', marginBottom: 10,
          opacity: (analysing || !settings.enabled || status !== 'connected') ? 0.45 : 1,
        }}
      >
        {analysing ? 'Analysing…' : '🔍 Analyse this page'}
      </button>

      {/* ── Result card (shown after a successful triage call) ── */}
      {result && (
        <div style={{
          padding: '10px 12px', borderRadius: 8,
          background: `rgba(${vColor === C.accent ? '16,185,129' : '99,102,241'},0.08)`,
          border: `1px solid ${vColor}40`,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: vColor, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {result.verdict}
            </span>
            <span style={{ fontSize: 11, color: C.muted }}>{result.confidence}% confidence</span>
          </div>
          <p style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5, margin: 0 }}>{result.summary}</p>
        </div>
      )}

      {/* ── Usage hint (shown when no result yet) ── */}
      {!result && (
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
          Highlight text on any page and right-click → <em style={{ color: '#94a3b8' }}>Analyze with TruthGuard</em>.
        </p>
      )}

      {/* ── Footer ── */}
      <div style={{ fontSize: 10, color: '#334155', borderTop: '1px solid #1e293b', paddingTop: 8, marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
        <span>Phase 4 · v0.1.0</span>
        {/* TODO: Make this dynamic — derive from settings.apiBase */}
        <a
          href="http://localhost:5173"
          target="_blank"
          rel="noreferrer"
          style={{ color: C.violet, textDecoration: 'none' }}
        >
          Open Web App ↗
        </a>
      </div>
    </div>
  )
}
