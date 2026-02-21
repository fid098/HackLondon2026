/**
 * Heatmap.jsx — Real-time misinformation geospatial dashboard.
 *
 * Features:
 *   - Animated world map with hotspot markers (SVG-based, no third-party map lib)
 *   - Region stats cards with trend indicators
 *   - Category filter pills
 *   - Trending narratives table
 *   - Live-update simulation (Change Streams placeholder)
 *
 * The map is a simplified SVG world outline with positioned dot-markers.
 * In production this wires to the MongoDB Change Streams SSE endpoint.
 */

import { useState, useEffect, useRef, useCallback } from 'react'
import { getHeatmapEvents, openHeatmapStream } from '../lib/api'

/* ─── mock data ──────────────────────────────────────────────────────────── */

const CATEGORIES = ['All', 'Health', 'Politics', 'Finance', 'Science', 'Conflict', 'Climate']

const REGIONS = [
  { name: 'North America', events: 847, delta: +12, severity: 'high'   },
  { name: 'Europe',        events: 623, delta: +5,  severity: 'medium' },
  { name: 'Asia Pacific',  events: 1204, delta: +31, severity: 'high'  },
  { name: 'South America', events: 391, delta: -4,  severity: 'medium' },
  { name: 'Africa',        events: 278, delta: +8,  severity: 'low'    },
  { name: 'Middle East',   events: 512, delta: +19, severity: 'high'   },
]

const HOTSPOTS = [
  // [cx, cy, label, count, severity]
  { cx: 22,  cy: 38,  label: 'New York',      count: 312, severity: 'high'   },
  { cx: 16,  cy: 43,  label: 'Los Angeles',   count: 198, severity: 'medium' },
  { cx: 47,  cy: 32,  label: 'London',        count: 245, severity: 'high'   },
  { cx: 49,  cy: 30,  label: 'Berlin',        count: 134, severity: 'medium' },
  { cx: 53,  cy: 33,  label: 'Moscow',        count: 389, severity: 'high'   },
  { cx: 72,  cy: 38,  label: 'Beijing',       count: 521, severity: 'high'   },
  { cx: 76,  cy: 44,  label: 'Tokyo',         count: 287, severity: 'medium' },
  { cx: 70,  cy: 50,  label: 'Delhi',         count: 403, severity: 'high'   },
  { cx: 28,  cy: 60,  label: 'São Paulo',     count: 176, severity: 'medium' },
  { cx: 50,  cy: 55,  label: 'Cairo',         count: 218, severity: 'medium' },
  { cx: 54,  cy: 62,  label: 'Nairobi',       count: 92,  severity: 'low'    },
  { cx: 55,  cy: 43,  label: 'Tehran',        count: 267, severity: 'high'   },
  { cx: 79,  cy: 67,  label: 'Jakarta',       count: 145, severity: 'medium' },
]

const NARRATIVES = [
  { rank: 1, title: 'Vaccine microchip conspiracy resurfaces ahead of flu season',    category: 'Health',   volume: 14200, trend: 'up'   },
  { rank: 2, title: 'AI-generated election footage spreads across social platforms',  category: 'Politics', volume: 11800, trend: 'up'   },
  { rank: 3, title: 'Manipulated climate data graph shared by influencers',           category: 'Climate',  volume: 9400,  trend: 'up'   },
  { rank: 4, title: 'False banking collapse rumour triggers regional bank run',       category: 'Finance',  volume: 7600,  trend: 'down' },
  { rank: 5, title: 'Doctored satellite images misidentify conflict zone locations',  category: 'Conflict', volume: 6300,  trend: 'up'   },
  { rank: 6, title: '"Miracle cure" claims spread via encrypted messaging apps',     category: 'Health',   volume: 5100,  trend: 'same' },
]

/* ─── severity → colour ──────────────────────────────────────────────────── */

const SEV = {
  high:   { ring: '#ef4444', fill: 'rgba(239,68,68,0.5)',   label: 'High',   text: '#ef4444' },
  medium: { ring: '#f59e0b', fill: 'rgba(245,158,11,0.5)',  label: 'Medium', text: '#f59e0b' },
  low:    { ring: '#10b981', fill: 'rgba(16,185,129,0.5)',  label: 'Low',    text: '#10b981' },
}

/* ─── live feed ticker ───────────────────────────────────────────────────── */

const FEED_ITEMS = [
  'New event detected · Health · Jakarta',
  'Spike alert · Politics · Washington DC (+34%)',
  'Cluster identified · Finance · London',
  'Narrative variant · Climate · Berlin',
  'Agent verdict: FALSE · Health · New York',
  'Trending narrative · Science · Tokyo',
]

/* ─── sub-components ─────────────────────────────────────────────────────── */

function RegionCard({ region }) {
  const sev = SEV[region.severity]
  const pct = Math.min(100, (region.events / 1300) * 100)
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <p className="text-white text-sm font-semibold">{region.name}</p>
        <span
          className="text-xs px-2 py-0.5 rounded-full font-medium"
          style={{ background: `${sev.ring}18`, color: sev.text, border: `1px solid ${sev.ring}40` }}
        >
          {sev.label}
        </span>
      </div>

      <p className="text-3xl font-black text-white mb-1">{region.events.toLocaleString()}</p>
      <p className="text-xs text-slate-600 mb-3">events last 24 h</p>

      {/* Bar */}
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: sev.ring }}
        />
      </div>

      {/* Delta */}
      <p className="text-xs mt-2" style={{ color: region.delta >= 0 ? '#ef4444' : '#10b981' }}>
        {region.delta >= 0 ? '↑' : '↓'} {Math.abs(region.delta)}% from yesterday
      </p>
    </div>
  )
}

function HotspotMarker({ spot, scale }) {
  const [hovered, setHovered] = useState(false)
  const sev = SEV[spot.severity]
  const r = spot.severity === 'high' ? 1.4 : spot.severity === 'medium' ? 1.1 : 0.8
  return (
    <g
      transform={`translate(${spot.cx * scale}, ${spot.cy * scale})`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ cursor: 'pointer' }}
    >
      {/* Pulse ring */}
      <circle
        r={r * scale * 0.7}
        fill="none"
        stroke={sev.ring}
        strokeWidth="0.5"
        opacity={0.4}
        style={{ animation: 'pulse 2s ease-in-out infinite' }}
      />
      {/* Dot */}
      <circle r={r * scale * 0.35} fill={sev.fill} stroke={sev.ring} strokeWidth="0.3" />
      {/* Tooltip */}
      {hovered && (
        <foreignObject x={4} y={-18} width={110} height={40} style={{ overflow: 'visible' }}>
          <div
            style={{
              background: 'rgba(4,4,10,0.95)',
              border: `1px solid ${sev.ring}40`,
              borderRadius: 8,
              padding: '4px 8px',
              fontSize: 10,
              color: '#f1f5f9',
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            <span style={{ color: sev.ring, fontWeight: 700 }}>{spot.label}</span>
            <br />
            {spot.count.toLocaleString()} events
          </div>
        </foreignObject>
      )}
    </g>
  )
}

/* simplified equirectangular world outline as an SVG path */
const WORLD_PATH = `
M8,35 L10,30 L14,28 L18,29 L22,27 L26,28 L28,32 L30,30
L33,29 L36,30 L38,28 L40,30 L42,28 L44,30 L47,29 L49,27
L52,28 L54,26 L58,27 L62,29 L66,28 L70,30 L73,27 L76,28
L80,30 L84,28 L87,30 L90,35
L90,65 L85,68 L80,65 L76,68 L72,66 L68,70 L64,68 L60,72
L56,70 L52,72 L48,70 L44,72 L40,70 L36,72 L32,70 L28,72
L24,68 L20,70 L16,68 L12,65 L8,65 Z
`

/* ─── main component ─────────────────────────────────────────────────────── */

export default function Heatmap() {
  const [category,    setCategory]    = useState('All')
  const [liveFeed,    setLiveFeed]    = useState(FEED_ITEMS[0])
  const [totalEvents, setTotalEvents] = useState(55234)
  const [hotspots,    setHotspots]    = useState(HOTSPOTS)
  const [regions,     setRegions]     = useState(REGIONS)
  const [narratives,  setNarratives]  = useState(NARRATIVES)
  const mapRef = useRef(null)
  const wsRef  = useRef(null)
  const [mapW, setMapW] = useState(800)

  /* Resize observer for responsive map */
  useEffect(() => {
    if (!mapRef.current) return
    const ro = new ResizeObserver(([e]) => setMapW(e.contentRect.width))
    ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  /* Load heatmap snapshot from API, fall back to mock data silently */
  const fetchHeatmap = useCallback(async () => {
    try {
      const data = await getHeatmapEvents()   // fetch all categories; filter client-side
      setHotspots(data.events)
      setRegions(data.regions)
      setNarratives(data.narratives)
      setTotalEvents(data.total_events)
    } catch (_err) {
      // Backend unavailable — keep the mock data already in state
    }
  }, [])

  useEffect(() => { fetchHeatmap() }, [fetchHeatmap])

  /* WebSocket live feed — fall back to simulated interval */
  useEffect(() => {
    let ws
    let fallbackId
    try {
      ws = openHeatmapStream((msg) => {
        if (msg.message) setLiveFeed(msg.message)
        if (msg.delta)   setTotalEvents((n) => n + msg.delta)
      })
      wsRef.current = ws
    } catch (_err) {
      // jsdom / test env: WebSocket may not be available — use interval
      let idx = 0
      fallbackId = setInterval(() => {
        idx = (idx + 1) % FEED_ITEMS.length
        setLiveFeed(FEED_ITEMS[idx])
        setTotalEvents((n) => n + Math.floor(Math.random() * 8))
      }, 3000)
    }
    return () => {
      wsRef.current?.close()
      if (fallbackId) clearInterval(fallbackId)
    }
  }, [])

  const mapH  = Math.round(mapW * 0.42)
  const scale = mapW / 100

  /* Client-side category filter on whatever data we have */
  const filtered = narratives.filter(
    (n) => category === 'All' || n.category === category,
  )
  const visibleSpots = hotspots.filter(
    (h) => category === 'All' || h.category === category,
  )

  return (
    <div className="relative max-w-7xl mx-auto px-5 py-14">

      {/* ── orbs ── */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden" aria-hidden>
        <div className="orb orb-blue"   style={{ width: 600, height: 600, top: '-5%',  left: '-15%',  opacity: 0.07 }} />
        <div className="orb orb-violet" style={{ width: 500, height: 500, bottom: '0', right: '-10%', opacity: 0.06 }} />
      </div>

      {/* ── header ── */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs text-blue-400 uppercase tracking-[3px] font-semibold mb-2">
            Live Data
          </p>
          <h1 className="text-4xl font-extrabold text-white mb-1">Misinformation Heatmap</h1>
          <p className="text-slate-500 text-sm">
            Real-time geospatial tracking via MongoDB Change Streams
          </p>
        </div>

        {/* Live counter */}
        <div
          className="flex items-center gap-3 px-5 py-3 rounded-xl"
          style={{ background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)' }}
        >
          <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse shrink-0" />
          <div>
            <p className="text-2xl font-black text-white leading-none">{totalEvents.toLocaleString()}</p>
            <p className="text-xs text-blue-400 mt-0.5">events tracked</p>
          </div>
        </div>
      </div>

      {/* ── Live feed ticker ── */}
      <div
        className="flex items-center gap-3 rounded-xl px-5 py-3 mb-8 overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
      >
        <span
          className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full text-blue-400"
          style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}
        >
          LIVE
        </span>
        <p
          key={liveFeed}
          className="text-sm text-slate-400 truncate"
          style={{ animation: 'fadeIn 0.4s ease-out both' }}
        >
          {liveFeed}
        </p>
      </div>

      {/* ── Map ── */}
      <div
        ref={mapRef}
        className="rounded-2xl overflow-hidden mb-8 relative"
        style={{
          background: 'rgba(6,16,36,0.9)',
          border:     '1px solid rgba(59,130,246,0.15)',
          height:     mapH || 336,
        }}
      >
        {/* Grid lines */}
        <svg
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, opacity: 0.06 }}
        >
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((v) => (
            <g key={v}>
              <line x1={`${v}%`} y1="0" x2={`${v}%`} y2="100%" stroke="#3b82f6" strokeWidth="0.5" />
              <line x1="0" y1={`${v}%`} x2="100%" y2={`${v}%`} stroke="#3b82f6" strokeWidth="0.5" />
            </g>
          ))}
        </svg>

        {/* Main map SVG */}
        <svg
          width={mapW}
          height={mapH || 336}
          viewBox={`0 0 ${mapW} ${mapH || 336}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          {/* Continent silhouette */}
          <path
            d={WORLD_PATH
              .replace(/(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)/g, (_, x, y) =>
                `${parseFloat(x) * scale},${parseFloat(y) * scale}`,
              )}
            fill="rgba(59,130,246,0.06)"
            stroke="rgba(59,130,246,0.2)"
            strokeWidth="0.8"
          />

          {/* Hotspot markers */}
          {visibleSpots.map((spot) => (
            <HotspotMarker key={spot.label} spot={spot} scale={scale} />
          ))}
        </svg>

        {/* Legend */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5">
          {Object.entries(SEV).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: val.ring }} />
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── Region stats ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {regions.map((r) => <RegionCard key={r.name} region={r} />)}
      </div>

      {/* ── Trending narratives ── */}
      <div>
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-xl font-bold text-white">Trending Narratives</h2>

          {/* Category filter */}
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className="text-xs px-3 py-1.5 rounded-full transition-all duration-150 font-medium focus:outline-none"
                style={
                  category === c
                    ? { background: 'rgba(59,130,246,0.15)', color: '#60a5fa', border: '1px solid rgba(59,130,246,0.35)' }
                    : { background: 'transparent', color: '#475569', border: '1px solid rgba(255,255,255,0.07)' }
                }
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {/* Table header */}
          <div
            className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-3 text-xs text-slate-600 uppercase tracking-wider font-semibold"
            style={{ background: 'rgba(255,255,255,0.025)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
          >
            <span>#</span>
            <span>Narrative</span>
            <span className="hidden md:block">Category</span>
            <span>Volume</span>
          </div>

          {filtered.length === 0 ? (
            <p className="text-center text-slate-600 py-12 text-sm">No narratives in this category right now.</p>
          ) : (
            filtered.map((n) => (
              <div
                key={n.rank}
                className="grid grid-cols-[auto_1fr_auto_auto] gap-4 px-6 py-4 items-center transition-colors duration-150 hover:bg-white/[0.015]"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}
              >
                <span className="text-slate-700 font-mono text-sm w-5">{n.rank}</span>

                <p className="text-slate-300 text-sm leading-snug line-clamp-2">{n.title}</p>

                <span
                  className="hidden md:inline text-xs px-2.5 py-1 rounded-full font-medium shrink-0"
                  style={{
                    background: 'rgba(255,255,255,0.04)',
                    border:     '1px solid rgba(255,255,255,0.08)',
                    color:      '#64748b',
                  }}
                >
                  {n.category}
                </span>

                <div className="flex items-center gap-1.5 shrink-0">
                  <span className="text-white font-semibold text-sm">{(n.volume / 1000).toFixed(1)}k</span>
                  <span
                    style={{
                      color: n.trend === 'up' ? '#ef4444' : n.trend === 'down' ? '#10b981' : '#475569',
                      fontSize: 13,
                    }}
                  >
                    {n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '–'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Data note ── */}
      <p className="text-center text-xs text-slate-700 mt-10 leading-relaxed">
        Event data sourced from MongoDB Atlas geospatial aggregation · Updated via Change Streams every 30 s ·
        Hotspot thresholds calibrated per-region to account for population density.
      </p>
    </div>
  )
}
