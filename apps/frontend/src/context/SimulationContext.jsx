/**
 * SimulationContext.jsx
 *
 * Manages simulation-specific state only. Globe state, filter state,
 * and live feed state remain in Heatmap.jsx.
 *
 * Provided values:
 *   simRunning   — boolean, simulation API call in progress
 *   setSimRunning
 *   simResult    — null | { confidence, model, projected_spread }
 *   setSimResult
 */

import { createContext, useContext, useState } from 'react'

const SimulationContext = createContext(null)

export function SimulationProvider({ children }) {
  const [simRunning, setSimRunning] = useState(false)
  const [simResult,  setSimResult]  = useState(null)

  return (
    <SimulationContext.Provider value={{ simRunning, setSimRunning, simResult, setSimResult }}>
      {children}
    </SimulationContext.Provider>
  )
}

export function useSimulationContext() {
  const ctx = useContext(SimulationContext)
  if (!ctx) throw new Error('useSimulationContext must be used inside <SimulationProvider>')
  return ctx
}
