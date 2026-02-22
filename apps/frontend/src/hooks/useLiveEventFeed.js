/**
 * useLiveEventFeed.js
 *
 * Manages WebSocket connection to /api/v1/heatmap/stream and the
 * resulting live-feed state. Falls back to a mock interval when the
 * backend is unavailable.
 *
 * Returns:
 *   liveFeed   — string, latest event text
 *   feedHistory — array of feed entries (max 200)
 *   totalEvents — number, cumulative event count
 *   autoScroll  — boolean
 *   setAutoScroll
 */

import { useState, useEffect, useRef } from 'react'
import { openHeatmapStream } from '../lib/api'

const FEED_ITEMS = [
  'New event detected · Health · Jakarta',
  'Spike alert · Politics · Washington DC (+34%)',
  'Cluster identified · Finance · London',
  'Narrative variant · Climate · Berlin',
  'Agent verdict: FALSE · Health · New York',
  'Trending narrative · Science · Tokyo',
]

const INITIAL_FEED_HISTORY = [
  { id: 1,  time: '04:58:09', msg: 'Deepfake audio campaign detected',   city: 'Moscow',    category: 'Politics', sev: 'high'   },
  { id: 2,  time: '04:59:41', msg: 'Narrative variant spreading',        city: 'New York',  category: 'Health',   sev: 'high'   },
  { id: 3,  time: '05:01:14', msg: 'Coordinated amplification active',   city: 'Beijing',   category: 'Science',  sev: 'high'   },
  { id: 4,  time: '05:02:58', msg: 'Climate data manipulation detected', city: 'Berlin',    category: 'Climate',  sev: 'medium' },
  { id: 5,  time: '05:04:22', msg: 'Finance rumour gaining traction',    city: 'Tokyo',     category: 'Finance',  sev: 'medium' },
  { id: 6,  time: '05:06:47', msg: 'Conflict footage misattributed',     city: 'Tehran',    category: 'Conflict', sev: 'high'   },
  { id: 7,  time: '05:09:03', msg: 'Spike anomaly: +145% in last hour', city: 'Delhi',     category: 'Health',   sev: 'medium' },
  { id: 8,  time: '05:11:55', msg: 'State-linked network activity',      city: 'Moscow',    category: 'Politics', sev: 'high'   },
  { id: 9,  time: '05:14:28', msg: 'Coordinated campaign forming',       city: 'London',    category: 'Health',   sev: 'high'   },
  { id: 10, time: '05:17:12', msg: 'Agent verdict: FALSE',               city: 'São Paulo', category: 'Politics', sev: 'medium' },
]

export function useLiveEventFeed() {
  const [liveFeed,    setLiveFeed]    = useState(FEED_ITEMS[0])
  const [totalEvents, setTotalEvents] = useState(55234)
  const [feedHistory, setFeedHistory] = useState(INITIAL_FEED_HISTORY)
  const [autoScroll,  setAutoScroll]  = useState(true)
  const wsRef = useRef(null)

  useEffect(() => {
    let fallbackId
    try {
      const ws = openHeatmapStream((msg) => {
        if (msg.message) setLiveFeed(msg.message)
        if (msg.delta)   setTotalEvents(n => n + msg.delta)
        if (msg.message) {
          setFeedHistory(prev => [...prev, {
            id:       Date.now(),
            time:     new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            msg:      msg.message,
            city:     msg.city     ?? '—',
            category: msg.category ?? 'Unknown',
            sev:      msg.severity ?? 'medium',
          }].slice(-200))
        }
      })
      wsRef.current = ws
    } catch {
      let idx = 0
      fallbackId = setInterval(() => {
        idx = (idx + 1) % FEED_ITEMS.length
        const raw   = FEED_ITEMS[idx]
        const parts = raw.split(' · ')
        setLiveFeed(raw)
        setTotalEvents(n => n + Math.floor(Math.random() * 8))
        setFeedHistory(prev => [...prev, {
          id:       Date.now(),
          time:     new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
          msg:      parts[0] ?? raw,
          city:     parts[2] ?? '—',
          category: parts[1] ?? 'Unknown',
          sev:      raw.includes('Spike') || raw.includes('FALSE') || raw.includes('alert') ? 'high' : 'medium',
        }].slice(-200))
      }, 3000)
    }
    return () => {
      wsRef.current?.close()
      if (fallbackId) clearInterval(fallbackId)
    }
  }, [])

  return { liveFeed, feedHistory, totalEvents, autoScroll, setAutoScroll }
}
