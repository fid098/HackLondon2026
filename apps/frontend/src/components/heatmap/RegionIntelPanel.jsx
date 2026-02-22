/**
 * RegionIntelPanel.jsx — Regional Intelligence overlay.
 *
 * Rendered as an absolute-positioned overlay inside the globe container
 * when a country polygon is clicked. Shows intelligence data for:
 *   - The clicked country (name + centroid proximity)
 *   - The macro-region it belongs to (aggregated reality_score, risk_level)
 *   - The nearest hotspot + its scoring
 *   - Hotspot cluster within the region
 *
 * Props:
 *   data    {object|null}  — { countryName, centroid, nearestHotspot,
 *                              region, hotspotCluster }
 *   onClose {function}     — called when × is pressed
 */

/* ── Style helpers ───────────────────────────────────────────────────────── */

const RISK = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)' },
  LOW:      { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)' },
}

const RISK_COLOR = {
  CRITICAL: '#ef4444', HIGH: '#f97316', MEDIUM: '#f59e0b', LOW: '#10b981',
}

function scoreColor(s) {
  if (s == null) return '#475569'
  if (s < 40) return '#ef4444'
  if (s < 60) return '#f97316'
  if (s < 80) return '#f59e0b'
  return '#10b981'
}

const sectionHeader = {
  fontSize: 8, fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
}

/* ── Sub-components ──────────────────────────────────────────────────────── */

function MiniGauge({ score, size = 42 }) {
  const col = scoreColor(score)
  const inner = Math.round(size * 0.68)
  return (
    <div style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: `conic-gradient(${col} ${(score ?? 0) * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 0 12px ${col}44`,
    }}>
      <div style={{
        width: inner, height: inner, borderRadius: '50%',
        background: 'rgba(6,10,22,0.97)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span style={{ fontSize: Math.round(size * 0.26), fontWeight: 900, color: col, lineHeight: 1 }}>
          {score ?? '—'}
        </span>
      </div>
    </div>
  )
}

function RiskBadge({ level }) {
  if (!level) return null
  const s = RISK[level] ?? RISK.MEDIUM
  return (
    <span style={{
      fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: '0.05em',
    }}>
      {level}
    </span>
  )
}

function ViralityBar({ index }) {
  // index is 0-10
  const pct = Math.min(100, ((index ?? 0) / 10) * 100)
  const col = pct > 70 ? '#ef4444' : pct > 40 ? '#f59e0b' : '#10b981'
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
        <div style={{
          height: '100%', borderRadius: 2, width: `${pct}%`,
          background: `linear-gradient(90deg, ${col}, ${col}aa)`,
          transition: 'width 0.6s ease',
        }} />
      </div>
      <span style={{ fontSize: 10, fontWeight: 700, color: col, fontFamily: 'monospace', flexShrink: 0 }}>
        {(index ?? 0).toFixed(1)}<span style={{ fontSize: 8, color: '#334155' }}>/10</span>
      </span>
    </div>
  )
}

/* ── Main component ──────────────────────────────────────────────────────── */

export default function RegionIntelPanel({ data, onClose }) {
  if (!data) return null

  const { countryName, nearestHotspot, region, hotspotCluster } = data

  // Primary score source: prefer nearest hotspot, fall back to macro-region
  const primaryScore     = nearestHotspot?.reality_score ?? region?.reality_score
  const primaryRisk      = nearestHotspot?.risk_level    ?? region?.risk_level
  const primaryAction    = nearestHotspot?.next_action   ?? region?.next_action
  const viralityIndex    = nearestHotspot?.virality_index ?? null
  const dominantCategory = nearestHotspot?.category ?? null
  const rStyle           = RISK[primaryRisk] ?? RISK.MEDIUM

  return (
    <div style={{
      position: 'absolute', bottom: 18, right: 18,
      width: 280, zIndex: 20,
      background: 'rgba(4,7,15,0.96)',
      border: `1px solid ${rStyle.border}`,
      borderRadius: 10,
      backdropFilter: 'blur(12px)',
      boxShadow: `0 8px 40px rgba(0,0,0,0.6), 0 0 24px ${rStyle.color}22`,
      // Slide-in animation via CSS transform (no extra lib)
      animation: 'slideInRight 0.2s ease-out',
      overflow: 'hidden',
    }}>

      {/* ── Header ── */}
      <div style={{
        padding: '9px 12px 8px',
        borderBottom: `1px solid ${rStyle.border}`,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
        background: rStyle.bg,
      }}>
        <div>
          <p style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
            Region Intelligence
          </p>
          <p style={{ fontSize: 14, fontWeight: 800, color: '#e2e8f0', lineHeight: 1.2 }}>
            {countryName}
          </p>
          {region && (
            <p style={{ fontSize: 9, color: '#475569', marginTop: 2 }}>{region.name}</p>
          )}
        </div>
        <button onClick={onClose} style={{
          background: 'none', border: 'none', color: '#475569',
          cursor: 'pointer', fontSize: 18, lineHeight: 1, padding: '0 2px',
        }}>×</button>
      </div>

      <div style={{ padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>

        {/* ── Reality Stability Score ── */}
        <div>
          <p style={sectionHeader}>Reality Stability Score</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <MiniGauge score={primaryScore} size={48} />
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <RiskBadge level={primaryRisk} />
                <span style={{ fontSize: 8, color: '#334155' }}>RISK LEVEL</span>
              </div>
              {/* Score bar */}
              <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{
                  height: '100%', borderRadius: 2,
                  width: `${primaryScore ?? 0}%`,
                  background: scoreColor(primaryScore),
                  transition: 'width 0.6s ease',
                }} />
              </div>
              {region && (
                <p style={{ fontSize: 8, color: '#334155', marginTop: 4 }}>
                  Region: {region.events?.toLocaleString()} events
                  <span style={{ color: region.delta >= 0 ? '#ef4444' : '#10b981', marginLeft: 5 }}>
                    {region.delta >= 0 ? `+${region.delta}` : region.delta}%
                  </span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── Dominant Narrative Category ── */}
        {dominantCategory && (
          <div style={{
            padding: '7px 9px', borderRadius: 5,
            background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
          }}>
            <p style={sectionHeader}>Dominant Narrative Category</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{
                fontSize: 11, fontWeight: 700,
                padding: '3px 9px', borderRadius: 4,
                background: 'rgba(99,102,241,0.12)', color: '#818cf8',
                border: '1px solid rgba(99,102,241,0.25)',
              }}>
                {dominantCategory}
              </span>
              {nearestHotspot?.label && (
                <span style={{ fontSize: 9, color: '#334155' }}>
                  via {nearestHotspot.label}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── Virality Index ── */}
        {viralityIndex != null && (
          <div>
            <p style={sectionHeader}>Virality Index</p>
            <ViralityBar index={viralityIndex} />
          </div>
        )}

        {/* ── Recommended Action ── */}
        {primaryAction && (
          <div style={{
            padding: '7px 9px', borderRadius: 5,
            background: 'rgba(0,0,0,0.3)', borderLeft: `2px solid ${rStyle.color}`,
          }}>
            <p style={sectionHeader}>Recommended Action</p>
            <p style={{ fontSize: 10, color: rStyle.color, fontWeight: 600, lineHeight: 1.5 }}>
              {primaryAction}
            </p>
          </div>
        )}

        {/* ── Hotspot cluster ── */}
        {hotspotCluster && hotspotCluster.length > 0 && (
          <div>
            <p style={sectionHeader}>Hotspots in Region ({hotspotCluster.length})</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {hotspotCluster.slice(0, 5).map(h => {
                const col = RISK_COLOR[h.risk_level] ?? '#475569'
                return (
                  <span key={h.label} style={{
                    fontSize: 9, padding: '2px 7px', borderRadius: 4,
                    background: `${col}15`, color: col,
                    border: `1px solid ${col}35`, fontWeight: 600,
                  }}>
                    {h.label}
                  </span>
                )
              })}
              {hotspotCluster.length > 5 && (
                <span style={{ fontSize: 9, color: '#334155', padding: '2px 4px' }}>
                  +{hotspotCluster.length - 5} more
                </span>
              )}
            </div>
          </div>
        )}

      </div>

      {/* ── Footer ── */}
      <div style={{
        padding: '6px 12px', borderTop: '1px solid rgba(255,255,255,0.05)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <p style={{ fontSize: 8, color: '#1e293b' }}>Click a hotspot point for full analysis</p>
        <span style={{ fontSize: 8, color: '#1e293b' }}>30 s refresh</span>
      </div>

      {/* Slide-in keyframe (injected once, idempotent) */}
      <style>{`
        @keyframes slideInRight {
          from { opacity: 0; transform: translateX(20px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}
