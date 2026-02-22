/**
 * GlobeOverlayLayer.jsx — HTML overlay badges for simulation results.
 *
 * Renders absolutely-positioned badges over the globe container showing
 * projected spread cities from the latest simulation.
 *
 * CRITICAL: Does NOT touch the Globe component or its Three.js internals.
 * It is an HTML layer that sits in the same parent div as the Globe.
 *
 * Uses:
 *   useSimulationContext() — reads simResult and simRunning
 */

import { useSimulationContext } from '../../context/SimulationContext'

export default function GlobeOverlayLayer() {
  const { simResult, simRunning } = useSimulationContext()

  // Running indicator — top right of globe
  if (simRunning) {
    return (
      <div style={{
        position: 'absolute', top: 14, right: 14, zIndex: 15,
        padding: '5px 12px', borderRadius: 7,
        background: 'rgba(245,158,11,0.15)', border: '1px solid rgba(245,158,11,0.35)',
        backdropFilter: 'blur(8px)',
        display: 'flex', alignItems: 'center', gap: 7,
        fontSize: 10, fontWeight: 700, color: '#f59e0b',
        animation: 'fadeIn 0.2s ease',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#f59e0b', opacity: 0.9 }} />
        Simulation running…
      </div>
    )
  }

  if (!simResult) return null

  const { confidence, model, projected_spread } = simResult
  if (!projected_spread?.length) return null

  return (
    <>
      {/* Simulation result panel — top right */}
      <div style={{
        position: 'absolute', top: 14, right: 14, zIndex: 15,
        padding: '10px 14px', borderRadius: 8, width: 210,
        background: 'rgba(4,7,15,0.93)', border: '1px solid rgba(16,185,129,0.3)',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 0 20px rgba(16,185,129,0.1)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981', boxShadow: '0 0 6px #10b981' }} />
            <span style={{ fontSize: 9, fontWeight: 700, color: '#10b981', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              Spread Simulation
            </span>
          </div>
          <span style={{
            fontSize: 8, padding: '1px 5px', borderRadius: 3,
            background: 'rgba(96,165,250,0.12)', color: '#60a5fa', fontWeight: 700,
          }}>
            {Math.round((confidence ?? 0) * 100)}% conf.
          </span>
        </div>

        {/* Model */}
        <p style={{ fontSize: 8, color: '#1e293b', marginBottom: 8, fontFamily: 'monospace' }}>
          model: <span style={{ color: '#334155' }}>{model ?? 'velocity-diffusion'}</span>
        </p>

        {/* Projected cities */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {projected_spread.map((p, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '4px 7px', borderRadius: 5,
              background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.12)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 8, fontWeight: 700, color: '#334155', fontFamily: 'monospace',
                  width: 14, textAlign: 'right',
                }}>
                  {String(i + 1).padStart(2, '0')}
                </span>
                <span style={{ fontSize: 10, color: '#64748b', fontWeight: 600 }}>→ {p.city}</span>
              </div>
              <span style={{ fontSize: 10, fontWeight: 700, color: '#10b981', fontFamily: 'monospace' }}>
                ~{(p.projectedCount ?? 0).toLocaleString()}
              </span>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p style={{ fontSize: 8, color: '#1e293b', marginTop: 8, lineHeight: 1.5 }}>
          Projected over 48 h · velocity-diffusion model
        </p>
      </div>
    </>
  )
}
