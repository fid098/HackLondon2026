/**
 * RightSimulationPanel.jsx — Hotspot detail, simulation controls, filters, narratives.
 *
 * Uses:
 *   useSimulation() — reads/writes SimulationContext for run/result state
 *
 * Props (from Heatmap.jsx):
 *   selectedHotspot, setSelectedHotspot
 *   multiCats, toggleCat, catActive
 *   filteredNarratives
 *   timeRange
 *   setMultiCats
 */

import { useState } from 'react'
import { useSimulation } from '../../hooks/useSimulation'

const CATEGORIES = ['All', 'Health', 'Politics', 'Finance', 'Science', 'Conflict', 'Climate']
const TIME_RANGES = ['1h', '24h', '7d']

const SEV = {
  high: { ring: '#ef4444', label: 'High' },
  medium: { ring: '#f59e0b', label: 'Medium' },
  low: { ring: '#10b981', label: 'Low' },
}

const actionMap = {
  Health: "Draft Public Health Advisory",
  Politics: "Draft Fact-Check Statement",
  Finance: "Draft Market Reassurance",
  Climate: "Draft Scientific Rebuttal",
  Conflict: "Draft De-escalation Memo"
}

// Risk level → display properties
const RISK = {
  CRITICAL: { color: '#ef4444', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.30)', label: 'CRITICAL' },
  HIGH:     { color: '#f97316', bg: 'rgba(249,115,22,0.10)', border: 'rgba(249,115,22,0.30)', label: 'HIGH' },
  MEDIUM:   { color: '#f59e0b', bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', label: 'MEDIUM' },
  LOW:      { color: '#10b981', bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.25)', label: 'LOW' },
}

// Stability score → gauge fill color (mirrors risk_level thresholds)
function scoreColor(s) {
  if (s < 40) return '#ef4444'
  if (s < 60) return '#f97316'
  if (s < 80) return '#f59e0b'
  return '#10b981'
}

const sectionHeader = {
  fontSize: 9, fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
}
const divider = { borderBottom: '1px solid rgba(255,255,255,0.06)' }

// Category → pill colour for the narratives table
const CAT_PILL_COLOR = {
  Health:   { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.25)'   },
  Politics: { bg: 'rgba(249,115,22,0.12)',  color: '#fb923c', border: 'rgba(249,115,22,0.25)'  },
  Finance:  { bg: 'rgba(234,179,8,0.12)',   color: '#facc15', border: 'rgba(234,179,8,0.25)'   },
  Science:  { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)'  },
  Conflict: { bg: 'rgba(239,68,68,0.12)',   color: '#f87171', border: 'rgba(239,68,68,0.25)'   },
  Climate:  { bg: 'rgba(16,185,129,0.12)',  color: '#34d399', border: 'rgba(16,185,129,0.25)'  },
}

// Synthetic threat level derived from narrative volume + trend direction
function narrativeThreat(n) {
  if (n.volume > 10000) return 'CRITICAL'
  if (n.volume > 6000 || n.trend === 'up') return 'HIGH'
  if (n.volume > 3000) return 'MEDIUM'
  return 'LOW'
}

export default function RightSimulationPanel({
  selectedHotspot, setSelectedHotspot,
  multiCats, toggleCat, catActive,
  filteredNarratives,
  timeRange,
  setMultiCats,
}) {
  const { run, isRunning, result, clearResult, trackNarrative } = useSimulation()
  const [isGenerating, setIsGenerating] = useState(false)
  const [mitigationPlan, setMitigationPlan] = useState(null)

  function handleClose() {
    setSelectedHotspot(null)
    clearResult()
    setMitigationPlan(null)
  }

  function handleGenerateCounterNarrative() {
    setIsGenerating(true)
    // Simulate LLM generation time
    setTimeout(() => {
      setMitigationPlan(`Strategic counter-narrative tailored for ${selectedHotspot.label} focusing on ${selectedHotspot.category} misinformation. Releasing via official channels on ${selectedHotspot.platforms?.[0]?.name || 'Social Media'}.`)
      setIsGenerating(false)
    }, 1500)
  }

  return (
    <div style={{
      width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
      borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto',
      background: 'rgba(8,12,22,0.92)',
    }}>

      {/* ── Panel header ── */}
      <div style={{
        padding: '9px 15px', ...divider,
        fontSize: 10, fontWeight: 700, color: '#3b82f6',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span>Intelligence Panel</span>
        {multiCats.size > 0 && (
          <span style={{ fontSize: 9, color: '#3b82f6', background: 'rgba(59,130,246,0.12)', padding: '2px 6px', borderRadius: 3 }}>
            {multiCats.size} filter{multiCats.size > 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* ── Hotspot detection panel ── */}
      {selectedHotspot && (
        <div style={{
          margin: '10px 12px 0',
          padding: '10px 12px', borderRadius: 8,
          background: 'rgba(20,30,50,0.6)',
          border: `1px solid ${SEV[selectedHotspot.severity].ring}40`,
        }}>

          {/* Header */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 3 }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: '#e2e8f0' }}>{selectedHotspot.label}</span>
                <span style={{
                  fontSize: 9, padding: '2px 6px', borderRadius: 3, fontWeight: 700,
                  background: `${SEV[selectedHotspot.severity].ring}20`,
                  color: SEV[selectedHotspot.severity].ring,
                }}>
                  {selectedHotspot.severity.toUpperCase()}
                </span>
              </div>
              <span style={{ fontSize: 9, color: '#334155' }}>{selectedHotspot.category}</span>
            </div>
            <button onClick={handleClose} style={{
              background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1,
            }}>×</button>
          </div>

          {/* ── Reality Stability Intelligence block ── */}
          {selectedHotspot.reality_score != null && (() => {
            const score = selectedHotspot.reality_score
            const risk  = selectedHotspot.risk_level ?? 'MEDIUM'
            const riskStyle = RISK[risk] ?? RISK.MEDIUM
            const fillPct = score  // score IS 0-100
            const col = scoreColor(score)
            return (
              <div style={{
                marginBottom: 9, padding: '9px 10px', borderRadius: 6,
                background: riskStyle.bg, border: `1px solid ${riskStyle.border}`,
              }}>
                {/* Score gauge + risk badge row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 7 }}>
                  {/* Circular-ish score badge */}
                  <div style={{
                    width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                    background: `conic-gradient(${col} ${fillPct * 3.6}deg, rgba(255,255,255,0.06) 0deg)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: `0 0 14px ${col}44`,
                    position: 'relative',
                  }}>
                    {/* Inner circle (creates ring effect) */}
                    <div style={{
                      width: 38, height: 38, borderRadius: '50%',
                      background: 'rgba(8,12,22,0.95)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 14, fontWeight: 900, color: col, lineHeight: 1 }}>{score}</span>
                    </div>
                  </div>
                  {/* Labels */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                      Reality Stability
                    </p>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 4 }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800, padding: '2px 7px', borderRadius: 4,
                        background: riskStyle.bg, color: riskStyle.color,
                        border: `1px solid ${riskStyle.border}`, letterSpacing: '0.05em',
                      }}>
                        {risk}
                      </span>
                      <span style={{ fontSize: 8, color: '#334155' }}>RISK LEVEL</span>
                    </div>
                    {/* Mini score bar */}
                    <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{
                        height: '100%', borderRadius: 2,
                        width: `${fillPct}%`,
                        background: `linear-gradient(90deg, ${col}, ${col}bb)`,
                        transition: 'width 0.6s ease',
                      }} />
                    </div>
                  </div>
                </div>
                {/* Next action recommendation */}
                {selectedHotspot.next_action && (
                  <div style={{
                    padding: '5px 8px', borderRadius: 4,
                    background: 'rgba(0,0,0,0.25)', borderLeft: `2px solid ${riskStyle.color}`,
                  }}>
                    <p style={{ fontSize: 8, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
                      Recommended Action
                    </p>
                    <p style={{ fontSize: 10, color: riskStyle.color, fontWeight: 600, lineHeight: 1.4 }}>
                      {selectedHotspot.next_action}
                    </p>
                  </div>
                )}
              </div>
            )
          })()}

          {/* Score cards */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            {[
              { label: 'Confidence', value: `${Math.round((selectedHotspot.confidence_score ?? 0) * 100)}%`, color: '#60a5fa' },
              { label: 'Virality', value: `${(selectedHotspot.virality_score ?? 0).toFixed(1)}×`, color: '#f59e0b' },
              {
                label: 'Trend',
                value: selectedHotspot.trend === 'up' ? '↑' : selectedHotspot.trend === 'down' ? '↓' : '–',
                color: selectedHotspot.trend === 'up' ? '#ef4444' : selectedHotspot.trend === 'down' ? '#10b981' : '#475569',
              },
            ].map(s => (
              <div key={s.label} style={{ flex: 1, background: 'rgba(255,255,255,0.04)', borderRadius: 5, padding: '5px 0', textAlign: 'center' }}>
                <p style={{ fontSize: 8, color: '#334155', marginBottom: 2, textTransform: 'uppercase' }}>{s.label}</p>
                <p style={{ fontSize: 15, fontWeight: 900, color: s.color, lineHeight: 1 }}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Alert flags */}
          {(selectedHotspot.isCoordinated || selectedHotspot.isSpikeAnomaly) && (
            <div style={{ display: 'flex', gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
              {selectedHotspot.isCoordinated && (
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(245,158,11,0.12)', color: '#f59e0b', fontWeight: 700 }}>
                  ⚡ Coordinated Activity
                </span>
              )}
              {selectedHotspot.isSpikeAnomaly && (
                <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 3, background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontWeight: 700 }}>
                  ↑ Spike Anomaly
                </span>
              )}
            </div>
          )}

          {/* Platform breakdown */}
          {selectedHotspot.platforms && (
            <div style={{ marginBottom: 9 }}>
              <p style={{ ...sectionHeader, marginBottom: 5 }}>Platform Spread</p>
              {selectedHotspot.platforms.map(p => (
                <div key={p.name} style={{ marginBottom: 5 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                    <span style={{ fontSize: 9, color: '#475569' }}>{p.name}</span>
                    <span style={{ fontSize: 9, color: '#334155', fontFamily: 'monospace' }}>{p.pct}%</span>
                  </div>
                  <div style={{ height: 2, borderRadius: 1, background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{ height: '100%', borderRadius: 1, width: `${p.pct}%`, background: '#3b82f6', transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Top claims */}
          {selectedHotspot.topClaims && (
            <div style={{ marginBottom: 9 }}>
              <p style={{ ...sectionHeader, marginBottom: 5 }}>Top Claims</p>
              {selectedHotspot.topClaims.map((claim, i) => (
                <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 5 }}>
                  <span style={{ fontSize: 9, color: '#3b82f6', fontFamily: 'monospace', flexShrink: 0 }}>0{i + 1}</span>
                  <p style={{ fontSize: 10, color: '#475569', lineHeight: 1.4 }}>{claim}</p>
                </div>
              ))}
            </div>
          )}

          {/* Time breakdown */}
          {selectedHotspot.timeData && (
            <div style={{ display: 'flex', gap: 5, paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              {TIME_RANGES.map(r => (
                <div key={r} style={{
                  flex: 1, textAlign: 'center', borderRadius: 4, padding: '4px 0',
                  background: timeRange === r ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${timeRange === r ? 'rgba(59,130,246,0.3)' : 'rgba(255,255,255,0.05)'}`,
                }}>
                  <p style={{ fontSize: 7, color: '#334155', textTransform: 'uppercase', marginBottom: 2 }}>{r}</p>
                  <p style={{ fontSize: 11, fontWeight: 700, color: timeRange === r ? '#60a5fa' : '#475569', fontFamily: 'monospace' }}>
                    {(selectedHotspot.timeData[r] ?? 0).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}

          {/* Simulation result */}
          {result && (
            <div style={{ padding: '7px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...sectionHeader, marginBottom: 5, color: '#10b981' }}>Projected Impact Assessment</p>
              <p style={{ fontSize: 9, color: '#334155', marginBottom: 4 }}>
                If unmitigated, spread will reach <span style={{ color: '#ef4444', fontWeight: 700 }}>~4.5M</span> views in 24h.
                <br />Action taken now restricts spread to <span style={{ color: '#10b981', fontWeight: 700 }}>~300k</span>.
              </p>
            </div>
          )}

          {/* AI generated Mitigation Plan */}
          {mitigationPlan && (
            <div style={{ padding: '7px 0 9px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
              <p style={{ ...sectionHeader, marginBottom: 5, color: '#8b5cf6' }}>✨ AI Counter-Narrative Ready</p>
              <p style={{ fontSize: 10, color: '#cbd5e1', lineHeight: 1.4, background: 'rgba(139,92,246,0.1)', padding: '6px 8px', borderRadius: 4, borderLeft: '2px solid #8b5cf6' }}>
                {mitigationPlan}
              </p>
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button style={{
                  flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', background: '#3b82f6', color: 'white', border: 'none'
                }}>
                  Deploy via API
                </button>
                <button style={{
                  flex: 1, padding: '5px 0', borderRadius: 4, fontSize: 9, fontWeight: 700,
                  cursor: 'pointer', background: 'transparent', color: '#64748b', border: '1px solid #475569'
                }}>
                  Edit Draft
                </button>
              </div>
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 6, paddingTop: 8, flexDirection: 'column' }}>
            <button onClick={() => run(selectedHotspot)} disabled={isRunning} style={{
              flex: 1, padding: '8px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
              cursor: isRunning ? 'wait' : 'pointer',
              border: `1px solid ${isRunning ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.3)'}`,
              background: isRunning ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.07)',
              color: isRunning ? '#f59e0b' : '#10b981', transition: 'all 0.15s',
            }}>
              {isRunning ? '⏳ Simulating Impact…' : '▶ Simulate Spread Impact'}
            </button>

            <button onClick={handleGenerateCounterNarrative} disabled={isGenerating || mitigationPlan !== null} style={{
              flex: 1, padding: '8px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
              cursor: (isGenerating || mitigationPlan) ? 'not-allowed' : 'pointer', border: '1px solid rgba(139,92,246,0.5)',
              background: 'rgba(139,92,246,0.15)', color: '#c084fc', transition: 'all 0.15s',
              boxShadow: '0 0 10px rgba(139,92,246,0.2)'
            }}>
              {isGenerating ? '✨ Generating AI Plan...' : `✨ ${actionMap[selectedHotspot.category] || "Generate Counter-Narrative"}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Category filter ── */}
      <div style={{ padding: '11px 15px', ...divider }}>
        <p style={sectionHeader}>Category Filter</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
          {CATEGORIES.map(c => (
            <button key={c} onClick={() => toggleCat(c)} style={{
              padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
              cursor: 'pointer', transition: 'all 0.15s', outline: 'none',
              background: catActive(c) ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
              color: catActive(c) ? '#60a5fa' : '#475569',
              border: `1px solid ${catActive(c) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
            }}>
              {c}
            </button>
          ))}
        </div>
        {multiCats.size > 0 && (
          <p style={{ fontSize: 9, color: '#334155', marginTop: 6 }}>
            Click active filters to deselect · &quot;All&quot; clears all
          </p>
        )}
      </div>

      {/* ── Trending narratives ── */}
      <div style={{ padding: '11px 15px', flex: 1 }}>
        <p style={sectionHeader}>Trending Narratives</p>
        {filteredNarratives.length === 0 ? (
          <p style={{ fontSize: 11, color: '#1e293b', padding: '24px 0', textAlign: 'center' }}>
            No narratives in this category.
          </p>
        ) : (() => {
          const maxVol = Math.max(...filteredNarratives.map(n => n.volume), 1)
          return filteredNarratives.map(n => {
            const threat = narrativeThreat(n)
            const tStyle = RISK[threat] ?? RISK.MEDIUM
            const catSty = CAT_PILL_COLOR[n.category] ?? {
              bg: 'rgba(255,255,255,0.06)', color: '#64748b', border: 'rgba(255,255,255,0.10)',
            }
            const volPct = Math.round((n.volume / maxVol) * 100)
            return (
              <div key={n.rank} style={{
                padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', gap: 8, alignItems: 'flex-start',
              }}>
                {/* Rank */}
                <span style={{ fontSize: 10, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0, width: 14, paddingTop: 1 }}>
                  {n.rank}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Title */}
                  <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45, marginBottom: 5 }}>{n.title}</p>
                  {/* Meta row */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5, flexWrap: 'wrap' }}>
                    {/* Category pill */}
                    <span style={{
                      fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 700,
                      background: catSty.bg, color: catSty.color, border: `1px solid ${catSty.border}`,
                    }}>
                      {n.category}
                    </span>
                    {/* Threat badge */}
                    <span style={{
                      fontSize: 8, padding: '1px 6px', borderRadius: 3, fontWeight: 800,
                      background: tStyle.bg, color: tStyle.color, border: `1px solid ${tStyle.border}`,
                      letterSpacing: '0.04em',
                    }}>
                      {threat}
                    </span>
                    {/* Volume */}
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#475569', fontFamily: 'monospace' }}>
                      {(n.volume / 1000).toFixed(1)}k
                    </span>
                    {/* Trend arrow */}
                    <span style={{
                      fontSize: 12, fontWeight: 700, marginLeft: 'auto',
                      color: n.trend === 'up' ? '#ef4444' : n.trend === 'down' ? '#10b981' : '#334155',
                    }}>
                      {n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '–'}
                    </span>
                  </div>
                  {/* Relative volume bar */}
                  <div style={{ height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.05)' }}>
                    <div style={{
                      height: '100%', borderRadius: 2, width: `${volPct}%`,
                      background: `linear-gradient(90deg, ${tStyle.color}, ${tStyle.color}88)`,
                      transition: 'width 0.6s ease',
                    }} />
                  </div>
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* ── Footer ── */}
      <div style={{ padding: '9px 15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
        <p style={{ fontSize: 9, color: '#1e293b', textAlign: 'center', lineHeight: 1.7 }}>
          MongoDB Atlas · Change Streams · 30 s refresh
        </p>
      </div>

    </div>
  )
}
