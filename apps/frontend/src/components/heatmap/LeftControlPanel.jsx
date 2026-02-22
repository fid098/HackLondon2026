/**
 * LeftControlPanel.jsx — Target feed, agent logs, time controls, hotspot list.
 *
 * Uses:
 *   useLiveEventFeed() — WS feed (passed in as props from Heatmap)
 *   useAgentLogs()     — internal, generates agent log stream
 *
 * Props (from Heatmap.jsx):
 *   liveFeed, totalEvents       — from useLiveEventFeed
 *   globeSpots                  — filtered hotspot array
 *   selectedHotspot             — currently selected hotspot or null
 *   setSelectedHotspot          — setter
 *   regions                     — region activity data
 *   timeRange, setTimeRange     — time window selector
 *   isPlaying, setIsPlaying     — playback toggle
 *   vizMode                     — 'volume' | 'risk'
 *   userLocation                — null | { lat, lng }
 *   enableLocation              — fn
 *   locationError               — string | null
 */

import { useRef, useEffect } from 'react'
import { useAgentLogs } from '../../hooks/useAgentLogs'

const TIME_RANGES = ['1h', '24h', '7d']

const SEV = {
  high:   { ring: '#ef4444', label: 'High'   },
  medium: { ring: '#f59e0b', label: 'Medium' },
  low:    { ring: '#10b981', label: 'Low'    },
}

// Dynamic alerts derived from real globeSpots (see buildAlerts() below).
// MOCK_ALERTS removed — alerts now come from enriched hotspot data.

// Risk level → bar/badge color
const RISK_COLOR = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#10b981',
}

// Build an alert list from enriched hotspots
function buildAlerts(globeSpots) {
  return globeSpots
    .filter(s => s.isCoordinated || s.isSpikeAnomaly || s.risk_level === 'CRITICAL')
    .sort((a, b) => (a.reality_score ?? 50) - (b.reality_score ?? 50)) // worst first
    .slice(0, 6)
    .map((s, i) => ({
      id: i,
      type: s.isCoordinated ? 'coordinated' : 'spike',
      city: s.label,
      // Use computed next_action if available, otherwise fall back to a generic message
      msg: s.next_action
        ? s.next_action.replace(/^[A-Z]+:\s*/, '')  // strip prefix like "DEPLOY: "
        : s.isSpikeAnomaly ? `Spike anomaly — ${s.category}` : `Coordinated activity — ${s.category}`,
      sev: s.severity,
      riskLevel: s.risk_level ?? (s.severity === 'high' ? 'HIGH' : 'MEDIUM'),
    }))
}

const sectionHeader = {
  fontSize: 9, fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
}
const divider = { borderBottom: '1px solid rgba(255,255,255,0.06)' }

const STATUS_COLOR = { ok: '#10b981', warn: '#f59e0b', error: '#ef4444' }

export default function LeftControlPanel({
  liveFeed, globeSpots, selectedHotspot, setSelectedHotspot,
  regions, timeRange, setTimeRange, isPlaying, setIsPlaying,
  vizMode, userLocation, enableLocation, locationError,
}) {
  const { agentLogs } = useAgentLogs()
  const logsContainerRef = useRef(null)

  // Auto-scroll ONLY the inner log box to the newest entry.
  // Using scrollTop directly (instead of scrollIntoView) prevents the effect
  // from propagating to the outer sidebar, so the user can scroll the panel
  // freely after page load.
  useEffect(() => {
    const el = logsContainerRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [agentLogs])

  return (
    <div style={{
      width: 258, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderRight: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto',
      background: 'rgba(8,12,22,0.92)',
    }}>

      {/* ── Panel header ── */}
      <div style={{
        padding: '9px 15px', ...divider,
        fontSize: 10, fontWeight: 700, color: '#3b82f6',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', gap: 7,
      }}>
        <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 5px #3b82f6' }} />
        Target + Live Feed
      </div>

      {/* ── Latest event ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={sectionHeader}>Latest Event</p>
        <p key={liveFeed} style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>{liveFeed}</p>
      </div>

      {/* ── Feature 2: Time Window ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={sectionHeader}>Time Window</p>
        <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
          {TIME_RANGES.map(r => (
            <button key={r} onClick={() => { setTimeRange(r); setIsPlaying(false) }} style={{
              flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
              cursor: 'pointer',
              border: `1px solid ${timeRange === r ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.07)'}`,
              background: timeRange === r ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
              color:      timeRange === r ? '#60a5fa' : '#475569', transition: 'all 0.15s',
            }}>
              {r}
            </button>
          ))}
          <button onClick={() => setIsPlaying(p => !p)} title={isPlaying ? 'Pause' : 'Animate'} style={{
            padding: '5px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
            border:      `1px solid ${isPlaying ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
            background:  isPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
            color:       isPlaying ? '#ef4444' : '#475569',
          }}>
            {isPlaying ? '⏸' : '▶'}
          </button>
        </div>
        <p style={{ fontSize: 9, color: '#1e293b' }}>
          {timeRange} · <span style={{ color: '#334155' }}>{vizMode === 'risk' ? 'Risk-weighted' : 'Raw volume'}</span>
        </p>
      </div>

      {/* ── Active hotspots list ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={sectionHeader}>Active Hotspots ({globeSpots.length})</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {globeSpots.map(spot => (
            <div
              key={spot.label}
              onClick={() => setSelectedHotspot(prev => prev?.label === spot.label ? null : spot)}
              style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                cursor: 'pointer', padding: '3px 5px', borderRadius: 4, transition: 'background 0.1s',
                background: selectedHotspot?.label === spot.label ? 'rgba(59,130,246,0.1)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                {(() => {
                  const dotCol = spot.risk_level ? (RISK_COLOR[spot.risk_level] ?? SEV[spot.severity]?.ring) : SEV[spot.severity]?.ring ?? '#60a5fa'
                  return (
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: dotCol,
                      boxShadow: `0 0 ${spot.isCoordinated || spot.isSpikeAnomaly ? '8px' : '4px'} ${dotCol}`,
                    }} />
                  )
                })()}
                <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {spot.label}
                </span>
                {spot.isSpikeAnomaly && (
                  <span style={{ fontSize: 7, padding: '1px 3px', borderRadius: 2, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>↑</span>
                )}
                {spot.isCoordinated && (
                  <span style={{ fontSize: 7, padding: '1px 3px', borderRadius: 2, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>⚡</span>
                )}
              </div>
              <span style={{
                fontSize: 10, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0, marginLeft: 4,
                color: spot.risk_level ? (RISK_COLOR[spot.risk_level] ?? SEV[spot.severity]?.ring) : SEV[spot.severity]?.ring ?? '#60a5fa',
              }}>
                {spot.displayCount.toLocaleString()}
              </span>
            </div>
          ))}
          {globeSpots.length === 0 && (
            <p style={{ fontSize: 10, color: '#1e293b' }}>No hotspots match this filter.</p>
          )}
        </div>
      </div>

      {/* ── Region activity bars (sorted worst stability first) ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={sectionHeader}>Region Activity</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {[...regions]
            .sort((a, b) => (a.reality_score ?? 50) - (b.reality_score ?? 50))
            .map(r => {
              const barColor = r.risk_level ? (RISK_COLOR[r.risk_level] ?? SEV[r.severity]?.ring) : SEV[r.severity]?.ring ?? '#60a5fa'
              const hasScore = r.reality_score != null
              return (
                <div key={r.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <span style={{ fontSize: 10, color: '#475569' }}>{r.name}</span>
                      {r.risk_level && (
                        <span style={{
                          fontSize: 7, padding: '1px 4px', borderRadius: 2, fontWeight: 700,
                          color: barColor, background: `${barColor}18`, letterSpacing: '0.04em',
                        }}>
                          {r.risk_level}
                        </span>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      {hasScore && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: barColor, fontFamily: 'monospace' }}>
                          {r.reality_score}
                        </span>
                      )}
                      <span style={{ fontSize: 9, color: r.delta >= 0 ? '#ef4444' : '#10b981' }}>
                        {r.delta >= 0 ? `+${r.delta}` : r.delta}%
                      </span>
                    </div>
                  </div>
                  {/* Stability bar — fill represents reality_score (higher = more stable = wider) */}
                  <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{
                      height: '100%', borderRadius: 1,
                      background: barColor,
                      width: hasScore ? `${r.reality_score}%` : `${Math.min(100, (r.events / 1300) * 100)}%`,
                      boxShadow: `0 0 4px ${barColor}`,
                      transition: 'width 0.7s ease',
                    }} />
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {/* ── Active alerts (derived from real enriched hotspot data) ── */}
      {(() => {
        const alerts = buildAlerts(globeSpots)
        if (!alerts.length) return null
        return (
          <div style={{ padding: '10px 15px', ...divider }}>
            <p style={{ ...sectionHeader, color: '#ef4444' }}>⚠ Active Alerts ({alerts.length})</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {alerts.map(a => {
                const col = RISK_COLOR[a.riskLevel] ?? '#ef4444'
                return (
                  <div key={a.id} style={{
                    padding: '6px 8px', borderRadius: 5,
                    background: `${col}0d`,
                    border: `1px solid ${col}30`,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span style={{ fontSize: 9, fontWeight: 800, color: col, textTransform: 'uppercase' }}>
                        {a.type === 'coordinated' ? '⚡ Coordinated' : '↑ Spike'} · {a.riskLevel}
                      </span>
                      <span style={{ fontSize: 8, color: '#1e293b', padding: '1px 4px', borderRadius: 2, background: `${col}18` }}>LIVE</span>
                    </div>
                    <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4, marginBottom: 2 }}>{a.msg}</p>
                    <p style={{ fontSize: 9, color: col, fontWeight: 600 }}>{a.city}</p>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* ── Agent Log ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <p style={{ ...sectionHeader, marginBottom: 0 }}>AI Agent Log</p>
          <span style={{
            fontSize: 8, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(16,185,129,0.12)', color: '#10b981',
            fontWeight: 700, letterSpacing: '0.06em',
          }}>
            LIVE
          </span>
        </div>
        <div ref={logsContainerRef} style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {agentLogs.map(log => (
            <div key={log.id} style={{
              display: 'flex', gap: 5, alignItems: 'flex-start',
              padding: '3px 5px', borderRadius: 3,
              background: log.status === 'error' ? 'rgba(239,68,68,0.05)' : log.status === 'warn' ? 'rgba(245,158,11,0.04)' : 'transparent',
            }}>
              <span style={{ fontSize: 8, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0, marginTop: 1, width: 44 }}>{log.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', gap: 4, alignItems: 'center', marginBottom: 1 }}>
                  <span style={{
                    fontSize: 8, fontWeight: 700, color: STATUS_COLOR[log.status] ?? '#475569',
                    fontFamily: 'monospace', flexShrink: 0,
                  }}>
                    [{log.agent}]
                  </span>
                  <span style={{ fontSize: 8, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0 }}>{log.ms}</span>
                </div>
                <p style={{ fontSize: 9, color: '#334155', lineHeight: 1.4, marginBottom: 0 }}>
                  {log.action} · <span style={{ color: '#1e293b' }}>{log.target}</span>
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Location button ── */}
      <div style={{ padding: '10px 15px', marginTop: 'auto' }}>
        <button onClick={enableLocation} style={{
          width: '100%', padding: '7px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
          cursor: 'pointer',
          border:      `1px solid ${userLocation ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.25)'}`,
          background:  userLocation ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.07)',
          color:       userLocation ? '#10b981' : '#60a5fa', transition: 'all 0.2s',
        }}>
          {userLocation ? '📍 Location Active — Refocus' : '📍 Focus My Location'}
        </button>
        {locationError && (
          <p style={{ fontSize: 9, color: '#ef4444', marginTop: 4, textAlign: 'center' }}>{locationError}</p>
        )}
      </div>

    </div>
  )
}
