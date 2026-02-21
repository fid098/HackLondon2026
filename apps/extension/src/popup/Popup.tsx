/**
 * Popup.tsx — Chrome Extension Popup — Phase 4.
 *
 * Features:
 *   - API connectivity status badge
 *   - On/Off toggle (persisted via chrome.storage.sync)
 *   - Sensitivity selector: Low / Medium / High
 *   - "Analyze this page" button (triggers quick triage on current-tab URL)
 *   - Result card showing verdict + confidence + summary
 *   - Link to TruthGuard web app
 *
 * Security: No API keys stored here. All AI calls go through the background worker.
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

const DEFAULT_SETTINGS: Settings = {
  enabled: true,
  sensitivity: 'medium',
  apiBase: 'http://localhost:8000',
}

// ── Inline styles (no Tailwind in popup to keep bundle small) ─────────────────

const C = {
  bg:       '#0f172a',
  surface:  'rgba(255,255,255,0.04)',
  border:   'rgba(255,255,255,0.08)',
  text:     '#f1f5f9',
  muted:    '#64748b',
  accent:   '#34d399',
  violet:   '#818cf8',
  red:      '#ef4444',
  amber:    '#f59e0b',
} as const

const VERDICT_COLORS: Record<string, string> = {
  TRUE:       '#10b981',
  FALSE:      '#ef4444',
  MISLEADING: '#f59e0b',
  UNVERIFIED: '#6366f1',
  SATIRE:     '#8b5cf6',
}

export default function Popup() {
  const [status,      setStatus]      = useState<ConnectionStatus>('checking')
  const [dbStatus,    setDbStatus]    = useState('')
  const [settings,    setSettings]    = useState<Settings>(DEFAULT_SETTINGS)
  const [analysing,   setAnalysing]   = useState(false)
  const [result,      setResult]      = useState<TriageResult | null>(null)

  // ── Load connection status + settings ──────────────────────────────────────
  useEffect(() => {
    // Health check
    fetch(`${DEFAULT_SETTINGS.apiBase}/health`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((data: { status: string; database: string }) => {
        setStatus('connected')
        setDbStatus(data.database)
      })
      .catch(() => setStatus('disconnected'))

    // Load persisted settings
    chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }, (res) => {
      if (res?.ok) setSettings(res.data as Settings)
    })
  }, [])

  // ── Toggle enabled ─────────────────────────────────────────────────────────
  function toggleEnabled(): void {
    const next = { ...settings, enabled: !settings.enabled }
    setSettings(next)
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { enabled: next.enabled } })
  }

  // ── Change sensitivity ─────────────────────────────────────────────────────
  function changeSensitivity(s: Sensitivity): void {
    const next = { ...settings, sensitivity: s }
    setSettings(next)
    chrome.runtime.sendMessage({ type: 'SET_SETTINGS', payload: { sensitivity: s } })
  }

  // ── Analyse current tab URL ────────────────────────────────────────────────
  function analyseCurrentTab(): void {
    setAnalysing(true)
    setResult(null)
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const url = tabs[0]?.url ?? ''
      if (!url || url.startsWith('chrome://')) {
        setResult({ verdict: 'UNVERIFIED', confidence: 0, summary: 'Cannot analyse this page.' })
        setAnalysing(false)
        return
      }
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

  const statusLabel = {
    checking:     'Connecting…',
    connected:    `API connected · DB ${dbStatus}`,
    disconnected: 'API unreachable',
  }[status]

  const vColor = result ? (VERDICT_COLORS[result.verdict] ?? C.muted) : C.muted

  return (
    <div style={{ width: 320, padding: 16, fontFamily: 'system-ui,-apple-system,sans-serif', background: C.bg, color: C.text, minHeight: 220 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={C.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={{ fontSize: 17, fontWeight: 700, color: C.accent }}>TruthGuard</span>

        {/* On/Off toggle — right-aligned */}
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

      {/* Connection status */}
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

      {/* Sensitivity */}
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

      {/* Analyse current tab */}
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

      {/* Result card */}
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

      {/* Hint */}
      {!result && (
        <p style={{ fontSize: 11, color: C.muted, lineHeight: 1.55 }}>
          Highlight text on any page and right-click → <em style={{ color: '#94a3b8' }}>Analyze with TruthGuard</em>.
        </p>
      )}

      {/* Footer */}
      <div style={{ fontSize: 10, color: '#334155', borderTop: '1px solid #1e293b', paddingTop: 8, marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
        <span>Phase 4 · v0.1.0</span>
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
