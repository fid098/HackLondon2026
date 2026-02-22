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

const MOCK_ALERTS = [
  { id: 1, type: 'coordinated', city: 'Moscow',   msg: 'Coordinated campaign — 94% confidence', sev: 'high',   time: '1m ago'  },
  { id: 2, type: 'spike',       city: 'London',   msg: 'Spike anomaly: +187% vs 7-day baseline', sev: 'high',   time: '3m ago'  },
  { id: 3, type: 'coordinated', city: 'Beijing',  msg: 'Coordinated amplification detected',     sev: 'high',   time: '6m ago'  },
  { id: 4, type: 'spike',       city: 'Delhi',    msg: 'Event surge: +145% in last hour',        sev: 'medium', time: '11m ago' },
  { id: 5, type: 'coordinated', city: 'Tehran',   msg: 'State-linked network activity',          sev: 'high',   time: '14m ago' },
  { id: 6, type: 'spike',       city: 'New York', msg: 'Health narrative spike detected',        sev: 'medium', time: '22m ago' },
]

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
  const logsEndRef = useRef(null)

  // Auto-scroll agent log to newest entry
  useEffect(() => {
    logsEndRef.current?.scrollIntoView({ behavior: 'smooth' })
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
                <span style={{
                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                  background: SEV[spot.severity].ring,
                  boxShadow: `0 0 ${spot.isCoordinated || spot.isSpikeAnomaly ? '8px' : '4px'} ${SEV[spot.severity].ring}`,
                }} />
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
              <span style={{ fontSize: 10, fontWeight: 700, color: SEV[spot.severity].ring, fontFamily: 'monospace', flexShrink: 0, marginLeft: 4 }}>
                {spot.displayCount.toLocaleString()}
              </span>
            </div>
          ))}
          {globeSpots.length === 0 && (
            <p style={{ fontSize: 10, color: '#1e293b' }}>No hotspots match this filter.</p>
          )}
        </div>
      </div>

      {/* ── Region activity bars ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={sectionHeader}>Region Activity</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {regions.map(r => (
            <div key={r.name}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                <span style={{ fontSize: 10, color: '#475569' }}>{r.name}</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 9, fontWeight: 700, color: SEV[r.severity].ring }}>{r.events.toLocaleString()}</span>
                  <span style={{ fontSize: 9, color: r.delta >= 0 ? '#ef4444' : '#10b981' }}>
                    {r.delta >= 0 ? `+${r.delta}` : r.delta}%
                  </span>
                </div>
              </div>
              <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)' }}>
                <div style={{
                  height: '100%', borderRadius: 1, background: SEV[r.severity].ring,
                  width: `${Math.min(100, (r.events / 1300) * 100)}%`,
                  boxShadow: `0 0 4px ${SEV[r.severity].ring}`, transition: 'width 0.7s ease',
                }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Active alerts ── */}
      <div style={{ padding: '10px 15px', ...divider }}>
        <p style={{ ...sectionHeader, color: '#ef4444' }}>⚠ Active Alerts ({MOCK_ALERTS.length})</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {MOCK_ALERTS.map(a => (
            <div key={a.id} style={{
              padding: '6px 8px', borderRadius: 5,
              background: a.sev === 'high' ? 'rgba(239,68,68,0.07)' : 'rgba(245,158,11,0.06)',
              border: `1px solid ${a.sev === 'high' ? 'rgba(239,68,68,0.18)' : 'rgba(245,158,11,0.18)'}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                <span style={{ fontSize: 9, fontWeight: 800, color: a.sev === 'high' ? '#ef4444' : '#f59e0b', textTransform: 'uppercase' }}>
                  {a.type === 'coordinated' ? '⚡ Coordinated' : '↑ Spike'}
                </span>
                <span style={{ fontSize: 9, color: '#1e293b' }}>{a.time}</span>
              </div>
              <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{a.msg}</p>
              <p style={{ fontSize: 9, color: '#334155', marginTop: 2 }}>{a.city}</p>
            </div>
          ))}
        </div>
      </div>

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
        <div style={{ maxHeight: 160, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
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
          <div ref={logsEndRef} />
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
