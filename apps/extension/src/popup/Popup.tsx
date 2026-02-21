/**
 * Popup.tsx — Chrome extension popup UI.
 *
 * Phase 0: Shows API connectivity status and a brief description.
 * Phase 4: Will add:
 *   - Analysis result for the current tab's URL
 *   - Quick triage badge (flagged / clean)
 *   - Link to detailed report in the web app
 *   - Settings toggle (on/off, sensitivity)
 *
 * Security note: No API keys here. All AI calls go through the backend proxy.
 * The API_BASE_URL is configurable via extension storage (Phase 4).
 */

import { useEffect, useState } from 'react'

// Default to localhost for development; Phase 4 makes this configurable
const API_BASE_URL = 'http://localhost:8000'

type ConnectionStatus = 'checking' | 'connected' | 'disconnected'

const styles = {
  container: {
    width: 320,
    padding: 16,
    fontFamily: 'system-ui, -apple-system, sans-serif',
    backgroundColor: '#0f172a',
    color: '#f1f5f9',
    minHeight: 200,
  } as React.CSSProperties,

  header: {
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  } as React.CSSProperties,

  title: {
    fontSize: 18,
    fontWeight: 700,
    color: '#34d399',
  } as React.CSSProperties,

  subtitle: {
    fontSize: 12,
    color: '#64748b',
    marginBottom: 16,
  } as React.CSSProperties,

  statusBadge: (status: ConnectionStatus) =>
    ({
      display: 'inline-flex',
      alignItems: 'center',
      gap: 6,
      padding: '6px 10px',
      borderRadius: 6,
      fontSize: 12,
      marginBottom: 16,
      backgroundColor:
        status === 'connected' ? '#064e3b' : status === 'checking' ? '#1e293b' : '#450a0a',
      color:
        status === 'connected' ? '#34d399' : status === 'checking' ? '#94a3b8' : '#fca5a5',
      border: '1px solid',
      borderColor:
        status === 'connected' ? '#065f46' : status === 'checking' ? '#334155' : '#7f1d1d',
    }) as React.CSSProperties,

  dot: (status: ConnectionStatus) =>
    ({
      width: 6,
      height: 6,
      borderRadius: '50%',
      backgroundColor:
        status === 'connected' ? '#34d399' : status === 'checking' ? '#94a3b8' : '#f87171',
      animation: status === 'checking' ? 'pulse 1s infinite' : 'none',
    }) as React.CSSProperties,

  description: {
    fontSize: 12,
    color: '#64748b',
    lineHeight: 1.6,
    marginBottom: 12,
  } as React.CSSProperties,

  phaseTag: {
    fontSize: 10,
    color: '#475569',
    borderTop: '1px solid #1e293b',
    paddingTop: 8,
    marginTop: 8,
  } as React.CSSProperties,
} as const

export default function Popup() {
  const [status, setStatus] = useState<ConnectionStatus>('checking')
  const [dbStatus, setDbStatus] = useState<string>('')

  useEffect(() => {
    fetch(`${API_BASE_URL}/health`, { signal: AbortSignal.timeout(5000) })
      .then((r) => r.json())
      .then((data: { status: string; database: string }) => {
        setStatus('connected')
        setDbStatus(data.database)
      })
      .catch(() => setStatus('disconnected'))
  }, [])

  const statusLabel = {
    checking: 'Connecting...',
    connected: `API connected · DB ${dbStatus}`,
    disconnected: 'API unreachable',
  }[status]

  return (
    <div style={styles.container}>
      {/* Header */}
      <div style={styles.header}>
        {/* Inline shield icon */}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#34d399"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        <span style={styles.title}>TruthGuard</span>
      </div>
      <div style={styles.subtitle}>Misinformation &amp; Deepfake Detection</div>

      {/* API status */}
      <div style={styles.statusBadge(status)}>
        <div style={styles.dot(status)} />
        {statusLabel}
      </div>

      {/* Usage hint */}
      <p style={styles.description}>
        Highlight any text on a webpage and right-click to analyze it with TruthGuard.
      </p>

      <p style={styles.description}>
        Phase 4 will add automatic misinformation flags on X and Instagram posts.
      </p>

      <div style={styles.phaseTag}>Phase 0 — Scaffold · v0.1.0</div>
    </div>
  )
}
