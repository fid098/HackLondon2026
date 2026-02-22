/**
 * useAgentLogs.js
 *
 * Generates a stream of mock AI-agent processing log entries,
 * simulating background agents continuously analysing the feed.
 *
 * Returns:
 *   agentLogs — array of { id, time, agent, action, target, ms, status }
 */

import { useState, useEffect } from 'react'

const AGENT_TEMPLATES = [
  { agent: 'NLP-Cluster',   action: 'clustering narratives',         targets: ['Health/New York', 'Health/Delhi', 'Health/London'] },
  { agent: 'VelDiffuse',    action: 'velocity diffusion model run',  targets: ['Politics/Moscow', 'Science/Beijing', 'global']      },
  { agent: 'CoordDetect',   action: 'coordination pattern scan',     targets: ['Politics/Moscow', 'Conflict/Tehran', 'Science/Beijing'] },
  { agent: 'DeepfakeScan',  action: 'media authenticity check',      targets: ['Science/Beijing', 'Politics/Los Angeles', 'Conflict/Cairo'] },
  { agent: 'SpikeWatch',    action: 'anomaly threshold evaluation',  targets: ['Health/Delhi', 'Health/London', 'Finance/Lagos']    },
  { agent: 'GeoMapper',     action: 'hotspot boundary recalculate',  targets: ['global', 'Asia Pacific', 'Middle East']             },
  { agent: 'SourceRank',    action: 'source credibility update',     targets: ['Finance/Tokyo', 'Finance/Lagos', 'Politics/São Paulo'] },
  { agent: 'ViralityEst',   action: 'virality score recalculate',    targets: ['Conflict/Tehran', 'Health/Jakarta', 'Climate/Sydney'] },
  { agent: 'GraphTrace',    action: 'network propagation trace',     targets: ['Politics/Moscow', 'global', 'Health/New York']      },
  { agent: 'TemporalDrift', action: 'temporal baseline update',      targets: ['global', 'Climate/Berlin', 'Climate/Sydney']        },
]

const STATUS_OPTIONS = ['ok', 'ok', 'ok', 'warn', 'ok', 'ok', 'error']

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}

function generateEntry(id) {
  const tpl    = pickRandom(AGENT_TEMPLATES)
  const status = pickRandom(STATUS_OPTIONS)
  const ms     = Math.floor(Math.random() * 920) + 40
  return {
    id,
    time:   new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    agent:  tpl.agent,
    action: tpl.action,
    target: pickRandom(tpl.targets),
    ms:     `${ms}ms`,
    status,
  }
}

const INITIAL_LOGS = Array.from({ length: 6 }, (_, i) => generateEntry(i + 1))

export function useAgentLogs() {
  const [agentLogs, setAgentLogs] = useState(INITIAL_LOGS)

  useEffect(() => {
    let nextId = INITIAL_LOGS.length + 1
    const id = setInterval(() => {
      setAgentLogs(prev => [...prev, generateEntry(nextId++)].slice(-30))
    }, 2800)
    return () => clearInterval(id)
  }, [])

  return { agentLogs }
}
