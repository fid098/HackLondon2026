/**
 * TopControlBar.jsx — Agentic Command Center top bar.
 *
 * Props:
 *   vizMode               string   'volume' | 'risk'
 *   setVizMode            fn
 *   now                   Date
 *   maxSeverity           string   'HIGH' | 'MEDIUM' | 'LOW'   (legacy, kept for fallback)
 *   maxSevColor           string   hex                          (legacy, kept for fallback)
 *   totalEvents           number
 *   globalStabilityScore  number|null   0–100 weighted-average of region reality_scores
 *   globalRiskLevel       string        'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 */

const RISK_STYLE = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.35)' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.35)' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.35)' },
  LOW:      { color: '#10b981', bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)' },
}

function stabilityColor(score) {
  if (score == null) return '#475569'
  if (score < 40) return '#ef4444'
  if (score < 60) return '#f97316'
  if (score < 80) return '#f59e0b'
  return '#10b981'
}

export default function TopControlBar({
  vizMode, setVizMode, now, maxSeverity, maxSevColor, totalEvents,
  globalStabilityScore, globalRiskLevel,
}) {
  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  const riskKey  = globalRiskLevel ?? maxSeverity
  const rStyle   = RISK_STYLE[riskKey] ?? RISK_STYLE.HIGH
  const stabCol  = stabilityColor(globalStabilityScore)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', height: 48,
      background: 'rgba(4,7,15,0.98)',
      borderBottom: '1px solid rgba(255,255,255,0.07)',
      flexShrink: 0, gap: 16, zIndex: 20,
    }}>

      {/* ── Left: branding ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
          <span style={{ color: '#818cf8' }}>ver</span>ify
        </span>
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
        <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>Intelligence Heatmap</span>

        {/* Active agents indicator */}
        <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.06)' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#334155' }}>
          <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 5px #10b981' }} />
          <span style={{ color: '#475569' }}>10 agents active</span>
        </div>
      </div>

      {/* ── Center: live monitoring status ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '4px 13px', borderRadius: 6,
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
          fontSize: 11, fontWeight: 600, color: '#60a5fa',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', animation: 'pulse 1.5s infinite' }} />
          Live Monitoring
        </div>

        {/* Total events */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 13px', borderRadius: 6,
          background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          fontSize: 11, color: '#475569',
        }}>
          <span style={{ fontSize: 13, fontWeight: 800, color: '#94a3b8', fontFamily: 'monospace' }}>
            {(totalEvents ?? 0).toLocaleString()}
          </span>
          <span style={{ fontSize: 9, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em' }}>events</span>
        </div>
      </div>

      {/* ── Right: controls ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>

        {/* Volume / Risk toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
          {['volume', 'risk'].map(m => (
            <button key={m} onClick={() => setVizMode(m)} style={{
              padding: '3px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
              cursor: 'pointer', border: 'none', textTransform: 'uppercase', letterSpacing: '0.06em',
              background: vizMode === m ? 'rgba(59,130,246,0.25)' : 'transparent',
              color:      vizMode === m ? '#60a5fa' : '#475569',
              transition: 'all 0.15s',
            }}>
              {m === 'volume' ? 'Volume' : 'Risk'}
            </button>
          ))}
        </div>

        {/* Global Stability gauge */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 11px', borderRadius: 6,
          background: rStyle.bg, border: `1px solid ${rStyle.border}`,
        }}>
          {/* Score circle */}
          <div style={{
            width: 26, height: 26, borderRadius: '50%', flexShrink: 0,
            background: `conic-gradient(${stabCol} ${(globalStabilityScore ?? 0) * 3.6}deg, rgba(255,255,255,0.07) 0deg)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'rgba(4,7,15,0.95)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 7, fontWeight: 900, color: stabCol, lineHeight: 1 }}>
                {globalStabilityScore ?? '—'}
              </span>
            </div>
          </div>
          {/* Labels */}
          <div>
            <p style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
              Global Stability
            </p>
            <span style={{
              fontSize: 9, fontWeight: 800, color: rStyle.color, letterSpacing: '0.05em',
            }}>
              {riskKey}
            </span>
          </div>
        </div>

        {/* Clock */}
        <span style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace' }}>
          <span style={{ color: '#64748b' }}>{timeStr}</span>
        </span>
      </div>

    </div>
  )
}
