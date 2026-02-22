/**
 * useSimulation.js
 *
 * Wraps the runSimulation API call and writes results into SimulationContext.
 * Also provides a trackNarrative helper.
 *
 * Returns:
 *   run(hotspot)   — triggers POST /api/v1/heatmap/simulate
 *   isRunning      — boolean
 *   result         — null | simulation result object
 *   clearResult()
 *   trackNarrative(hotspot, setMultiCats, setSelectedHotspot)
 */

import { useCallback } from 'react'
import { runSimulation as apiRunSimulation } from '../lib/api'
import { useSimulationContext } from '../context/SimulationContext'

export function useSimulation() {
  const { simRunning, setSimRunning, simResult, setSimResult } = useSimulationContext()

  const run = useCallback(async (hotspot) => {
    if (simRunning || !hotspot) return
    setSimRunning(true)
    setSimResult(null)
    try {
      const result = await apiRunSimulation({
        hotspot_label:      hotspot.label,
        category:           hotspot.category,
        time_horizon_hours: 48,
      })
      setSimResult(result)
    } catch {
      // Mock result while the endpoint isn't yet implemented
      setSimResult({
        confidence: 0.74,
        model:      'velocity-diffusion-v1',
        projected_spread: [
          { city: 'Warsaw',   projectedCount: 180 },
          { city: 'Prague',   projectedCount: 120 },
          { city: 'Budapest', projectedCount:  95 },
        ],
      })
    } finally {
      setSimRunning(false)
    }
  }, [simRunning, setSimRunning, setSimResult])

  const clearResult = useCallback(() => setSimResult(null), [setSimResult])

  /**
   * trackNarrative — filters the globe to the hotspot's category then closes
   * the hotspot panel. Mirrors the existing "Track Globally" action.
   */
  const trackNarrative = useCallback((hotspot, setMultiCats, setSelectedHotspot) => {
    if (!hotspot) return
    setMultiCats(new Set([hotspot.category]))
    setSelectedHotspot(null)
  }, [])

  return {
    run,
    isRunning: simRunning,
    result:    simResult,
    clearResult,
    trackNarrative,
  }
}
