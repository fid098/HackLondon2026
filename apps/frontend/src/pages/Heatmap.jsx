/**
 * Heatmap.jsx — Misinformation ops-center dashboard.
 * DEVELOPER: Ayo
 *
 * Layout: fixed full-screen 3-column
 *   LEFT  (258px) — live feed, time controls, active hotspots, alert feed, location
 *   CENTER (flex)  — 3D globe with view/viz mode overlays
 *   RIGHT (300px)  — hotspot detection panel, category filter, trending narratives
 *
 * Features implemented:
 *   1. Geospatial Heat Layer  — view modes (Global / Country / City), intensity-based sizing
 *   2. Time Intelligence      — 1h / 24h / 7d selector + animated playback
 *   3. Multi-select Filters   — Set-based multi-select category pills
 *   4. Confidence Mode        — Volume vs Risk (count × confidence × virality)
 *   5. Hotspot Detection Panel— click globe point → details slide into right panel
 *   6. Real-time Updates      — coordinated / spike hotspots pulse faster + badge
 *   7. Alert Layer            — active alert feed in left panel
 *   8. Personalization Mode   — browser geolocation → auto-focus globe
 *
 * Data flow:
 *   fetchHeatmap()       → GET /api/v1/heatmap every 30 s
 *   openHeatmapStream()  → WebSocket /api/v1/heatmap/stream (LIVE ticker)
 *   Fallback mock data shown when backend is unavailable.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getHeatmapEvents, openHeatmapStream } from '../lib/api'
import Globe from 'react-globe.gl'

/* ─── Constants ──────────────────────────────────────────────────────────── */

const CATEGORIES = ['All', 'Health', 'Politics', 'Finance', 'Science', 'Conflict', 'Climate']

const REGIONS = [
  { name: 'North America', events: 847,  delta: +12, severity: 'high'   },
  { name: 'Europe',        events: 623,  delta: +5,  severity: 'medium' },
  { name: 'Asia Pacific',  events: 1204, delta: +31, severity: 'high'   },
  { name: 'South America', events: 391,  delta: -4,  severity: 'medium' },
  { name: 'Africa',        events: 278,  delta: +8,  severity: 'low'    },
  { name: 'Middle East',   events: 512,  delta: +19, severity: 'high'   },
]

/**
 * HOTSPOTS — enriched mock data.
 * API INTEGRATION: Replace with response from GET /api/v1/heatmap
 * Required fields per hotspot:
 *   confidence_score  (0–1)    — model confidence in misinfo classification
 *   virality_score    (float)  — spread rate multiplier vs baseline
 *   trend             (string) — 'up' | 'down' | 'same'
 *   platforms         (array)  — [{ name, pct }] breakdown by platform
 *   topClaims         (array)  — top 2–3 claim text strings
 *   timeData          (object) — { '1h': n, '24h': n, '7d': n }
 *   isCoordinated     (bool)   — coordinated inauthentic behaviour flag
 *   isSpikeAnomaly    (bool)   — statistical anomaly vs 7-day baseline flag
 */
const HOTSPOTS = [
  {
    cx: 22, cy: 38, label: 'New York', count: 312, severity: 'high', category: 'Health',
    confidence_score: 0.87, virality_score: 1.4, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 45 }, { name: 'Facebook', pct: 30 }, { name: 'Telegram', pct: 25 }],
    topClaims: ['Vaccine microchip conspiracy resurfaces', 'Hospital overflow claims spreading'],
    timeData: { '1h': 42, '24h': 312, '7d': 1840 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    cx: 16, cy: 43, label: 'Los Angeles', count: 198, severity: 'medium', category: 'Politics',
    confidence_score: 0.74, virality_score: 1.1, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 55 }, { name: 'Reddit', pct: 30 }, { name: 'TikTok', pct: 15 }],
    topClaims: ['AI-generated election footage shared', 'Voter fraud claims resurface'],
    timeData: { '1h': 18, '24h': 198, '7d': 940 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 47, cy: 32, label: 'London', count: 245, severity: 'high', category: 'Health',
    confidence_score: 0.91, virality_score: 1.6, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 40 }, { name: 'WhatsApp', pct: 35 }, { name: 'Facebook', pct: 25 }],
    topClaims: ['NHS collapse false reports', '5G health conspiracy gaining traction'],
    timeData: { '1h': 31, '24h': 245, '7d': 1620 },
    isCoordinated: true, isSpikeAnomaly: true,
  },
  {
    cx: 49, cy: 30, label: 'Berlin', count: 134, severity: 'medium', category: 'Climate',
    confidence_score: 0.68, virality_score: 0.9, trend: 'same',
    platforms: [{ name: 'Twitter/X', pct: 35 }, { name: 'Telegram', pct: 40 }, { name: 'YouTube', pct: 25 }],
    topClaims: ['Manipulated climate data graph circulating', 'Fake IPCC report screenshots'],
    timeData: { '1h': 11, '24h': 134, '7d': 720 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 53, cy: 33, label: 'Moscow', count: 389, severity: 'high', category: 'Politics',
    confidence_score: 0.94, virality_score: 2.1, trend: 'up',
    platforms: [{ name: 'Telegram', pct: 60 }, { name: 'VKontakte', pct: 25 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['State-linked narrative amplification', 'Conflict zone footage misattributed'],
    timeData: { '1h': 55, '24h': 389, '7d': 2340 },
    isCoordinated: true, isSpikeAnomaly: true,
  },
  {
    cx: 72, cy: 38, label: 'Beijing', count: 521, severity: 'high', category: 'Science',
    confidence_score: 0.82, virality_score: 1.8, trend: 'up',
    platforms: [{ name: 'WeChat', pct: 50 }, { name: 'Weibo', pct: 35 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['Lab origin claims resurface', 'Fabricated research paper spreads'],
    timeData: { '1h': 68, '24h': 521, '7d': 3120 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    cx: 76, cy: 44, label: 'Tokyo', count: 287, severity: 'medium', category: 'Finance',
    confidence_score: 0.71, virality_score: 1.2, trend: 'down',
    platforms: [{ name: 'Twitter/X', pct: 50 }, { name: 'LINE', pct: 30 }, { name: 'Reddit', pct: 20 }],
    topClaims: ['False banking collapse rumour', 'Yen manipulation conspiracy'],
    timeData: { '1h': 22, '24h': 287, '7d': 1540 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 70, cy: 50, label: 'Delhi', count: 403, severity: 'high', category: 'Health',
    confidence_score: 0.85, virality_score: 1.5, trend: 'up',
    platforms: [{ name: 'WhatsApp', pct: 55 }, { name: 'Facebook', pct: 30 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['"Miracle cure" claims via WhatsApp', 'Hospital queue footage misused'],
    timeData: { '1h': 48, '24h': 403, '7d': 2210 },
    isCoordinated: false, isSpikeAnomaly: true,
  },
  {
    cx: 28, cy: 60, label: 'São Paulo', count: 176, severity: 'medium', category: 'Politics',
    confidence_score: 0.72, virality_score: 1.0, trend: 'same',
    platforms: [{ name: 'WhatsApp', pct: 60 }, { name: 'Facebook', pct: 25 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['Election fraud claims re-circulating', 'Deepfake political speech spreading'],
    timeData: { '1h': 14, '24h': 176, '7d': 890 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 50, cy: 55, label: 'Cairo', count: 218, severity: 'medium', category: 'Conflict',
    confidence_score: 0.78, virality_score: 1.3, trend: 'up',
    platforms: [{ name: 'Facebook', pct: 45 }, { name: 'Twitter/X', pct: 30 }, { name: 'YouTube', pct: 25 }],
    topClaims: ['Conflict footage misattributed', 'Civilian casualty numbers inflated'],
    timeData: { '1h': 19, '24h': 218, '7d': 1100 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 54, cy: 62, label: 'Nairobi', count: 92, severity: 'low', category: 'Health',
    confidence_score: 0.61, virality_score: 0.7, trend: 'down',
    platforms: [{ name: 'WhatsApp', pct: 65 }, { name: 'Facebook', pct: 25 }, { name: 'Twitter/X', pct: 10 }],
    topClaims: ['Unverified herbal cure claims', 'Epidemic severity overstated'],
    timeData: { '1h': 6, '24h': 92, '7d': 480 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    cx: 55, cy: 43, label: 'Tehran', count: 267, severity: 'high', category: 'Conflict',
    confidence_score: 0.89, virality_score: 1.7, trend: 'up',
    platforms: [{ name: 'Telegram', pct: 55 }, { name: 'Instagram', pct: 30 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['State-backed disinformation campaign', 'Protest footage misrepresented'],
    timeData: { '1h': 38, '24h': 267, '7d': 1760 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    cx: 79, cy: 67, label: 'Jakarta', count: 145, severity: 'medium', category: 'Health',
    confidence_score: 0.69, virality_score: 1.1, trend: 'same',
    platforms: [{ name: 'WhatsApp', pct: 50 }, { name: 'Twitter/X', pct: 30 }, { name: 'TikTok', pct: 20 }],
    topClaims: ['Supplement claims trending', 'Dengue statistics manipulated'],
    timeData: { '1h': 12, '24h': 145, '7d': 730 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
]

/**
 * MOCK_ALERTS — Feature 7: Alert feed.
 * API INTEGRATION: Replace with GET /api/v1/alerts or subscribe to WS /api/v1/alerts/stream
 * Alert shape: { id, type: 'coordinated'|'spike', city, msg, sev: 'high'|'medium', time }
 */
const MOCK_ALERTS = [
  { id: 1, type: 'coordinated', city: 'Moscow',    msg: 'Coordinated campaign — 94% confidence', sev: 'high',   time: '1m ago'  },
  { id: 2, type: 'spike',       city: 'London',    msg: 'Spike anomaly: +187% vs 7-day baseline', sev: 'high',   time: '3m ago'  },
  { id: 3, type: 'coordinated', city: 'Beijing',   msg: 'Coordinated amplification detected',     sev: 'high',   time: '6m ago'  },
  { id: 4, type: 'spike',       city: 'Delhi',     msg: 'Event surge: +145% in last hour',         sev: 'medium', time: '11m ago' },
  { id: 5, type: 'coordinated', city: 'Tehran',    msg: 'State-linked network activity',           sev: 'high',   time: '14m ago' },
  { id: 6, type: 'spike',       city: 'New York',  msg: 'Health narrative spike detected',         sev: 'medium', time: '22m ago' },
]

const NARRATIVES = [
  { rank: 1, title: 'Vaccine microchip conspiracy resurfaces ahead of flu season',   category: 'Health',   volume: 14200, trend: 'up'   },
  { rank: 2, title: 'AI-generated election footage spreads across social platforms', category: 'Politics', volume: 11800, trend: 'up'   },
  { rank: 3, title: 'Manipulated climate data graph shared by influencers',          category: 'Climate',  volume: 9400,  trend: 'up'   },
  { rank: 4, title: 'False banking collapse rumour triggers regional bank run',      category: 'Finance',  volume: 7600,  trend: 'down' },
  { rank: 5, title: 'Doctored satellite images misidentify conflict zone locations', category: 'Conflict', volume: 6300,  trend: 'up'   },
  { rank: 6, title: '"Miracle cure" claims spread via encrypted messaging apps',    category: 'Health',   volume: 5100,  trend: 'same' },
]

const FEED_ITEMS = [
  'New event detected · Health · Jakarta',
  'Spike alert · Politics · Washington DC (+34%)',
  'Cluster identified · Finance · London',
  'Narrative variant · Climate · Berlin',
  'Agent verdict: FALSE · Health · New York',
  'Trending narrative · Science · Tokyo',
]

const SEV = {
  high:   { ring: '#ef4444', label: 'High',   text: '#ef4444' },
  medium: { ring: '#f59e0b', label: 'Medium', text: '#f59e0b' },
  low:    { ring: '#10b981', label: 'Low',    text: '#10b981' },
}

const POLITICAL_COLORS = [
  'rgba(235,200,160,0.65)', 'rgba(175,210,180,0.65)', 'rgba(190,215,245,0.65)',
  'rgba(245,235,170,0.65)', 'rgba(215,195,235,0.65)', 'rgba(240,195,190,0.65)',
  'rgba(180,225,225,0.65)', 'rgba(225,245,195,0.65)',
]

const TIME_RANGES = ['1h', '24h', '7d']
const VIEW_MODES  = ['Global', 'Country', 'City']

/* ─── Helpers ────────────────────────────────────────────────────────────── */

function getCountryColor(feat) {
  const name = feat.properties?.ADMIN || ''
  let h = 0
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h)
  return POLITICAL_COLORS[Math.abs(h) % POLITICAL_COLORS.length]
}

function computeCentroid(feature) {
  try {
    const geom = feature.geometry
    if (!geom) return null
    let ring
    if (geom.type === 'Polygon') {
      ring = geom.coordinates[0]
    } else if (geom.type === 'MultiPolygon') {
      ring = geom.coordinates.reduce(
        (best, poly) => (poly[0].length > best.length ? poly[0] : best),
        geom.coordinates[0][0],
      )
    } else return null
    const lats = ring.map(c => c[1])
    const lngs = ring.map(c => c[0])
    return {
      lat: (Math.min(...lats) + Math.max(...lats)) / 2,
      lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
    }
  } catch { return null }
}

/**
 * getDisplayCount — Feature 4: Confidence Mode.
 * Volume mode: raw event count for selected time range.
 * Risk mode:   count × confidence_score × virality_score (risk-weighted).
 * API INTEGRATION: confidence_score + virality_score from /api/v1/heatmap response per hotspot.
 */
function getDisplayCount(spot, vizMode, timeRange) {
  const base = spot.timeData?.[timeRange] ?? spot.count
  if (vizMode === 'risk') {
    return Math.round(base * (spot.confidence_score ?? 1) * (spot.virality_score ?? 1))
  }
  return base
}

/* ─── Shared inline style objects ───────────────────────────────────────── */

const sectionHeader = {
  fontSize: 9, fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
}
const panelBg = { background: 'rgba(8,12,22,0.92)', borderColor: 'rgba(255,255,255,0.07)' }
const divider  = { borderBottom: '1px solid rgba(255,255,255,0.06)' }

/* ─── Main component ─────────────────────────────────────────────────────── */

export default function Heatmap() {

  /* ── Existing state ── */
  const [liveFeed,    setLiveFeed]    = useState(FEED_ITEMS[0])
  const [totalEvents, setTotalEvents] = useState(55234)
  const [hotspots,    setHotspots]    = useState(HOTSPOTS)
  const [regions,     setRegions]     = useState(REGIONS)
  const [narratives,  setNarratives]  = useState(NARRATIVES)
  const [mapW,        setMapW]        = useState(0)
  const [mapH,        setMapH]        = useState(0)
  const [countries,   setCountries]   = useState({ features: [] })
  const [now,         setNow]         = useState(new Date())

  /* ── Feature 2: Time Intelligence ── */
  const [timeRange, setTimeRange] = useState('24h')
  const [isPlaying, setIsPlaying] = useState(false)

  /* ── Feature 1: View mode (Global / Country / City) ── */
  const [viewMode, setViewMode] = useState('Global')

  /* ── Feature 4: Visualization mode (volume vs risk-weighted) ── */
  const [vizMode, setVizMode] = useState('volume')

  /* ── Feature 3: Multi-select categories (empty Set = All) ── */
  const [multiCats, setMultiCats] = useState(new Set())

  /* ── Feature 5: Hotspot Detection Panel ── */
  const [selectedHotspot, setSelectedHotspot] = useState(null)

  /* ── Feature 8: Personalization / Geolocation ── */
  const [userLocation,  setUserLocation]  = useState(null)
  const [locationError, setLocationError] = useState(null)

  const mapRef   = useRef(null)
  const globeRef = useRef(null)
  const wsRef    = useRef(null)

  /* ── Live clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /* ── Country GeoJSON for polygon + label layers ── */
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  /* ── Track globe container dimensions ── */
  useEffect(() => {
    if (!mapRef.current) return
    const ro = new ResizeObserver(([e]) => {
      setMapW(e.contentRect.width)
      setMapH(e.contentRect.height)
    })
    ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  /* ── Periodic heatmap API fetch ──
   * API INTEGRATION: getHeatmapEvents() → GET /api/v1/heatmap
   * Response shape: { events: Hotspot[], regions: Region[], narratives: Narrative[], total_events: number }
   * Add ?timeRange=1h|24h|7d to filter by time window server-side.
   */
  const fetchHeatmap = useCallback(async () => {
    try {
      const data = await getHeatmapEvents()
      setHotspots(data.events)
      setRegions(data.regions)
      setNarratives(data.narratives)
      setTotalEvents(data.total_events)
    } catch (_) { /* keep mock data */ }
  }, [])

  useEffect(() => {
    fetchHeatmap()
    const id = setInterval(fetchHeatmap, 30000)
    return () => clearInterval(id)
  }, [fetchHeatmap])

  /* ── WebSocket live ticker ──
   * API INTEGRATION: openHeatmapStream() → WS /api/v1/heatmap/stream
   * Message shape: { message?: string, delta?: number }
   */
  useEffect(() => {
    let fallbackId
    try {
      const ws = openHeatmapStream((msg) => {
        if (msg.message) setLiveFeed(msg.message)
        if (msg.delta)   setTotalEvents(n => n + msg.delta)
      })
      wsRef.current = ws
    } catch {
      let idx = 0
      fallbackId = setInterval(() => {
        idx = (idx + 1) % FEED_ITEMS.length
        setLiveFeed(FEED_ITEMS[idx])
        setTotalEvents(n => n + Math.floor(Math.random() * 8))
      }, 3000)
    }
    return () => { wsRef.current?.close(); if (fallbackId) clearInterval(fallbackId) }
  }, [])

  /* ── Feature 2: Playback — cycle through time ranges every 2 s ── */
  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => {
      setTimeRange(prev => {
        const idx = TIME_RANGES.indexOf(prev)
        return TIME_RANGES[(idx + 1) % TIME_RANGES.length]
      })
    }, 2000)
    return () => clearInterval(id)
  }, [isPlaying])

  /* ── Feature 8: Focus globe when user location set ── */
  useEffect(() => {
    if (!userLocation || !globeRef.current) return
    globeRef.current.pointOfView({ lat: userLocation.lat, lng: userLocation.lng, altitude: 1.5 }, 1200)
  }, [userLocation])

  /* ── Feature 8: Geolocation request ──
   * API INTEGRATION: persist location preference via POST /api/v1/user/location
   * Body: { lat: number, lng: number }
   */
  const enableLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError('Not supported'); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(null) },
      ()  => setLocationError('Permission denied'),
    )
  }, [])

  /* ── Feature 1: View mode → change camera altitude ── */
  const applyViewMode = useCallback((mode) => {
    setViewMode(mode)
    if (!globeRef.current) return
    const altMap = { Global: 2.0, Country: 1.5, City: 1.0 }
    const cur = globeRef.current.pointOfView()
    globeRef.current.pointOfView({ ...cur, altitude: altMap[mode] }, 800)
  }, [])

  /* ── Feature 3: Multi-select toggle ── */
  const toggleCat = useCallback((c) => {
    if (c === 'All') { setMultiCats(new Set()); return }
    setMultiCats(prev => {
      const next = new Set(prev)
      next.has(c) ? next.delete(c) : next.add(c)
      return next
    })
  }, [])

  const catActive = useCallback((c) => {
    if (c === 'All') return multiCats.size === 0
    return multiCats.has(c)
  }, [multiCats])

  /* ── Feature 5: Point click → open Hotspot Detection Panel ── */
  const handlePointClick = useCallback((spot) => {
    setSelectedHotspot(spot)
  }, [])

  /* ── Feature 6: Ring speed — coordinated / spike hotspots pulse faster ── */
  const ringSpeed  = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 4.5 : 2.5, [])
  const ringPeriod = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 500  : 900,  [])

  /* ── Feature 4: Point radius scales with virality in risk mode ── */
  const pointRadius = useCallback((s) => {
    const base  = s.severity === 'high' ? 0.55 : s.severity === 'medium' ? 0.4 : 0.28
    const boost = vizMode === 'risk' ? Math.min((s.virality_score ?? 1) * 0.12, 0.28) : 0
    return base + boost
  }, [vizMode])

  /* ── Derived data ── */

  const globeSpots = useMemo(() =>
    hotspots
      .filter(h => multiCats.size === 0 || multiCats.has(h.category))
      .map(spot => ({
        ...spot,
        lat: 90 - (spot.cy / 100) * 180,
        lng: (spot.cx / 100) * 360 - 180,
        displayCount: getDisplayCount(spot, vizMode, timeRange),
      })),
    [hotspots, multiCats, vizMode, timeRange],
  )

  const countryLabels = useMemo(() =>
    countries.features.flatMap(feat => {
      const c    = computeCentroid(feat)
      const name = feat.properties?.ADMIN || ''
      return c && name ? [{ lat: c.lat, lng: c.lng, name }] : []
    }),
    [countries],
  )

  const filteredNarratives = useMemo(() =>
    narratives.filter(n => multiCats.size === 0 || multiCats.has(n.category)),
    [narratives, multiCats],
  )

  const maxSeverity = globeSpots.some(s => s.severity === 'high')   ? 'HIGH'
                    : globeSpots.some(s => s.severity === 'medium') ? 'MEDIUM' : 'LOW'
  const maxSevColor = maxSeverity === 'HIGH' ? '#ef4444' : maxSeverity === 'MEDIUM' ? '#f59e0b' : '#10b981'

  const timeStr = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

  /* ── Render ── */
  return (
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: '#04070f', color: '#cbd5e1',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden', zIndex: 10,
    }}>

      {/* ══════════════════════ TOP BAR ══════════════════════ */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 20px', height: 48,
        background: 'rgba(4,7,15,0.98)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0, gap: 16, zIndex: 20,
      }}>
        {/* Branding */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            truth<span style={{ color: '#3b82f6' }}>guard</span>
          </span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>Misinformation Heatmap</span>
        </div>

        {/* Centre pill */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 14px', borderRadius: 7,
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
          fontSize: 11, fontWeight: 600, color: '#60a5fa',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
          Live Monitoring
        </div>

        {/* Status + Feature 4: Viz mode toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Feature 4: Volume / Risk toggle */}
          <div style={{ display: 'flex', gap: 2, background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: 2 }}>
            {['volume', 'risk'].map(m => (
              <button key={m} onClick={() => setVizMode(m)} style={{
                padding: '3px 10px', borderRadius: 4, fontSize: 9, fontWeight: 700,
                cursor: 'pointer', border: 'none', textTransform: 'uppercase', letterSpacing: '0.06em',
                background: vizMode === m ? 'rgba(59,130,246,0.25)' : 'transparent',
                color: vizMode === m ? '#60a5fa' : '#475569', transition: 'all 0.15s',
              }}>
                {m === 'volume' ? 'Volume' : 'Risk'}
              </button>
            ))}
          </div>
          <div style={{
            padding: '3px 10px', borderRadius: 5,
            background: `${maxSevColor}18`, border: `1px solid ${maxSevColor}50`,
            fontSize: 10, fontWeight: 800, color: maxSevColor, letterSpacing: '0.08em',
          }}>
            RISK: {maxSeverity}
          </div>
          <span style={{ fontSize: 11, color: '#334155', fontFamily: 'monospace' }}>
            Last updated:&nbsp;<span style={{ color: '#64748b' }}>{timeStr}</span>
          </span>
        </div>
      </div>

      {/* ══════════════════════ 3-COLUMN BODY ══════════════════════ */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* ════════════ LEFT PANEL ════════════ */}
        <div style={{
          width: 258, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderRight: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', ...panelBg,
        }}>
          {/* Panel header */}
          <div style={{
            padding: '9px 15px', ...divider,
            fontSize: 10, fontWeight: 700, color: '#3b82f6',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', gap: 7,
          }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 5px #3b82f6' }} />
            Target + Live Feed
          </div>

          {/* Latest event */}
          <div style={{ padding: '10px 15px', ...divider }}>
            <p style={sectionHeader}>Latest Event</p>
            <p key={liveFeed} style={{ fontSize: 11, color: '#64748b', lineHeight: 1.55 }}>{liveFeed}</p>
          </div>

          {/* Total events */}
          <div style={{ padding: '10px 15px', ...divider }}>
            <p style={sectionHeader}>Events Tracked</p>
            <p style={{ fontSize: 28, fontWeight: 900, color: '#fff', lineHeight: 1, letterSpacing: '-0.02em' }}>
              {totalEvents.toLocaleString()}
            </p>
            <p style={{ fontSize: 10, color: '#334155', marginTop: 3 }}>updated every 30 s</p>
          </div>

          {/* ── Feature 2: Time Intelligence ── */}
          <div style={{ padding: '10px 15px', ...divider }}>
            <p style={sectionHeader}>Time Window</p>
            {/*
              API INTEGRATION: pass timeRange to GET /api/v1/heatmap?timeRange=1h|24h|7d
              Server should return counts bucketed to the selected window.
            */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 6 }}>
              {TIME_RANGES.map(r => (
                <button key={r} onClick={() => { setTimeRange(r); setIsPlaying(false) }} style={{
                  flex: 1, padding: '5px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
                  cursor: 'pointer',
                  border: `1px solid ${timeRange === r ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.07)'}`,
                  background: timeRange === r ? 'rgba(59,130,246,0.15)' : 'rgba(255,255,255,0.03)',
                  color: timeRange === r ? '#60a5fa' : '#475569', transition: 'all 0.15s',
                }}>
                  {r}
                </button>
              ))}
              {/* Playback toggle */}
              <button
                onClick={() => setIsPlaying(p => !p)}
                title={isPlaying ? 'Pause playback' : 'Animate through time ranges'}
                style={{
                  padding: '5px 9px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
                  background: isPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                  color: isPlaying ? '#ef4444' : '#475569',
                }}
              >
                {isPlaying ? '⏸' : '▶'}
              </button>
            </div>
            <p style={{ fontSize: 9, color: '#1e293b' }}>
              Showing: <span style={{ color: '#475569' }}>{timeRange}</span>
              {' · '}
              <span style={{ color: '#334155' }}>{vizMode === 'risk' ? 'Risk-weighted' : 'Raw volume'}</span>
            </p>
          </div>

          {/* Active hotspots list */}
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
                    <span style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{spot.label}</span>
                    {/* Feature 6: badges for anomalies */}
                    {spot.isSpikeAnomaly && (
                      <span style={{ fontSize: 7, padding: '1px 3px', borderRadius: 2, background: 'rgba(239,68,68,0.15)', color: '#ef4444', fontWeight: 700, flexShrink: 0 }}>↑</span>
                    )}
                    {spot.isCoordinated && (
                      <span style={{ fontSize: 7, padding: '1px 3px', borderRadius: 2, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', fontWeight: 700, flexShrink: 0 }}>⚡</span>
                    )}
                  </div>
                  <span style={{ fontSize: 10, fontWeight: 700, color: SEV[spot.severity].text, fontFamily: 'monospace', flexShrink: 0, marginLeft: 4 }}>
                    {spot.displayCount.toLocaleString()}
                  </span>
                </div>
              ))}
              {globeSpots.length === 0 && (
                <p style={{ fontSize: 10, color: '#1e293b' }}>No hotspots match this filter.</p>
              )}
            </div>
          </div>

          {/* Region activity bars */}
          <div style={{ padding: '10px 15px', ...divider }}>
            <p style={sectionHeader}>Region Activity</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {regions.map(r => (
                <div key={r.name}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                    <span style={{ fontSize: 10, color: '#475569' }}>{r.name}</span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 9, fontWeight: 700, color: SEV[r.severity].text }}>{r.events.toLocaleString()}</span>
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

          {/* ── Feature 7: Alert Feed ── */}
          <div style={{ padding: '10px 15px', ...divider }}>
            {/*
              API INTEGRATION:
              Replace MOCK_ALERTS with:
                GET  /api/v1/alerts               — paginated alert list
                WS   /api/v1/alerts/stream        — push new alerts in real time
              Alert types: 'coordinated' | 'spike' | 'narrative_shift' | 'platform_surge'
            */}
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

          {/* ── Feature 8: Location button ── */}
          <div style={{ padding: '10px 15px', marginTop: 'auto' }}>
            {/*
              API INTEGRATION: POST /api/v1/user/location { lat, lng }
              to persist user location preference in their profile.
            */}
            <button onClick={enableLocation} style={{
              width: '100%', padding: '7px 0', borderRadius: 6, fontSize: 10, fontWeight: 600,
              cursor: 'pointer',
              border: `1px solid ${userLocation ? 'rgba(16,185,129,0.35)' : 'rgba(59,130,246,0.25)'}`,
              background: userLocation ? 'rgba(16,185,129,0.1)' : 'rgba(59,130,246,0.07)',
              color: userLocation ? '#10b981' : '#60a5fa', transition: 'all 0.2s',
            }}>
              {userLocation ? '📍 Location Active — Refocus' : '📍 Focus My Location'}
            </button>
            {locationError && (
              <p style={{ fontSize: 9, color: '#ef4444', marginTop: 4, textAlign: 'center' }}>{locationError}</p>
            )}
          </div>
        </div>

        {/* ════════════ CENTER: Globe ════════════ */}
        <div ref={mapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#020509' }}>

          {/* Feature 1: View mode toggle — top left */}
          <div style={{
            position: 'absolute', top: 14, left: 14, zIndex: 10,
            display: 'flex', gap: 2,
            background: 'rgba(4,7,15,0.88)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8, padding: 3, backdropFilter: 'blur(8px)',
          }}>
            {VIEW_MODES.map(m => (
              <button key={m} onClick={() => applyViewMode(m)} style={{
                padding: '4px 9px', borderRadius: 5, fontSize: 9, fontWeight: 700,
                cursor: 'pointer', border: 'none', letterSpacing: '0.05em',
                background: viewMode === m ? 'rgba(59,130,246,0.25)' : 'transparent',
                color: viewMode === m ? '#60a5fa' : '#334155', transition: 'all 0.15s',
              }}>
                {m}
              </button>
            ))}
          </div>

          {/* Time + mode indicator — top center */}
          <div style={{
            position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
            zIndex: 10, pointerEvents: 'none',
            background: 'rgba(4,7,15,0.85)', border: '1px solid rgba(255,255,255,0.07)',
            borderRadius: 6, padding: '4px 12px',
            fontSize: 9, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.08em',
            whiteSpace: 'nowrap',
          }}>
            {timeRange.toUpperCase()} · {vizMode === 'risk' ? 'RISK-WEIGHTED' : 'VOLUME'}
            {isPlaying && <span style={{ marginLeft: 8, color: '#ef4444' }}>▶ PLAYING</span>}
          </div>

          {mapW > 0 && mapH > 0 && (
            <Globe
              ref={globeRef}
              width={mapW}
              height={mapH}

              globeImageUrl="//unpkg.com/three-globe/example/img/earth-blue-marble.jpg"
              backgroundColor="rgba(0,0,0,0)"
              atmosphereColor="#3b82f6"
              atmosphereAltitude={0.18}
              showGraticules

              /* Country polygon overlay */
              polygonsData={countries.features}
              polygonCapColor={getCountryColor}
              polygonSideColor={() => 'rgba(0,0,0,0.2)'}
              polygonStrokeColor={() => 'rgba(255,255,255,0.1)'}
              polygonAltitude={0.006}
              polygonLabel={({ properties: d }) => `
                <div style="background:rgba(4,7,15,0.96);border:1px solid rgba(59,130,246,0.35);border-radius:6px;padding:4px 9px;font-size:11px;color:#e2e8f0;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.4);">
                  ${d.ADMIN}
                </div>
              `}

              /* Country name labels */
              labelsData={countryLabels}
              labelLat={d => d.lat}
              labelLng={d => d.lng}
              labelText={d => d.name}
              labelSize={0.36}
              labelColor={() => 'rgba(255,255,255,0.5)'}
              labelDotRadius={0}
              labelAltitude={0.012}
              labelResolution={2}

              /* Feature 6: rings — coordinated/spike hotspots pulse faster */
              ringsData={globeSpots}
              ringColor={s => SEV[s.severity].ring}
              ringMaxRadius={s => s.severity === 'high' ? 9 : s.severity === 'medium' ? 6 : 4}
              ringPropagationSpeed={ringSpeed}
              ringRepeatPeriod={ringPeriod}

              /* Feature 4: point size scales with virality in risk mode */
              pointsData={globeSpots}
              pointColor={s => SEV[s.severity].ring}
              pointAltitude={0.06}
              pointRadius={pointRadius}
              pointLabel={s => `
                <div style="background:rgba(4,7,15,0.97);border:1px solid ${SEV[s.severity].ring}88;border-radius:8px;padding:7px 11px;font-size:11px;white-space:nowrap;box-shadow:0 4px 20px ${SEV[s.severity].ring}40;">
                  <div style="color:${SEV[s.severity].ring};font-weight:800;font-size:13px;margin-bottom:3px;">
                    ${s.label}
                    ${s.isSpikeAnomaly ? '<span style="font-size:9px;background:rgba(239,68,68,0.2);color:#ef4444;padding:1px 5px;border-radius:3px;margin-left:6px;">↑ SPIKE</span>' : ''}
                    ${s.isCoordinated ? '<span style="font-size:9px;background:rgba(245,158,11,0.2);color:#f59e0b;padding:1px 5px;border-radius:3px;margin-left:4px;">⚡ COORD</span>' : ''}
                  </div>
                  <div style="color:#64748b;margin-bottom:3px;">
                    ${s.displayCount.toLocaleString()} events · <b style="color:#94a3b8;">${s.severity}</b> · ${timeRange}
                  </div>
                  <div style="color:#334155;font-size:10px;">
                    Confidence: ${Math.round((s.confidence_score ?? 0) * 100)}% · Virality: ${(s.virality_score ?? 0).toFixed(1)}×
                  </div>
                </div>
              `}

              /* Feature 5: click point → open Hotspot Detection Panel */
              onPointClick={handlePointClick}

              onGlobeReady={() => {
                if (!globeRef.current) return
                const ctrl = globeRef.current.controls()
                ctrl.enableZoom = true
                ctrl.autoRotate = true
                ctrl.autoRotateSpeed = 0.45
                globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2 })
              }}
            />
          )}

          {/* Severity legend — bottom left */}
          <div style={{
            position: 'absolute', bottom: 18, left: 18,
            background: 'rgba(4,7,15,0.88)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 10, padding: '10px 14px',
            display: 'flex', flexDirection: 'column', gap: 7,
            backdropFilter: 'blur(8px)',
          }}>
            <p style={{ ...sectionHeader, marginBottom: 4 }}>Severity</p>
            {Object.entries(SEV).map(([key, val]) => (
              <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#475569' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: val.ring, boxShadow: `0 0 5px ${val.ring}` }} />
                {val.label}
              </div>
            ))}
          </div>

          {/* Usage hint — bottom right */}
          <div style={{
            position: 'absolute', bottom: 18, right: 18,
            fontSize: 9, color: 'rgba(71,85,105,0.7)',
            pointerEvents: 'none', userSelect: 'none',
            textAlign: 'right', lineHeight: 1.7,
          }}>
            Drag to rotate · Scroll to zoom<br />Click point for details
          </div>
        </div>

        {/* ════════════ RIGHT PANEL ════════════ */}
        <div style={{
          width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
          borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', ...panelBg,
        }}>
          {/* Panel header */}
          <div style={{
            padding: '9px 15px', ...divider,
            fontSize: 10, fontWeight: 700, color: '#3b82f6',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <span>Narrative Analysis</span>
            {multiCats.size > 0 && (
              <span style={{ fontSize: 9, color: '#3b82f6', background: 'rgba(59,130,246,0.12)', padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>
                {multiCats.size} filter{multiCats.size > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {/* ── Feature 5: Hotspot Detection Panel ── */}
          {selectedHotspot && (
            <div style={{
              margin: '10px 12px 0',
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(20,30,50,0.6)',
              border: `1px solid ${SEV[selectedHotspot.severity].ring}40`,
            }}>
              {/* Header row */}
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
                <button onClick={() => setSelectedHotspot(null)} style={{
                  background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
                  fontSize: 16, lineHeight: 1, padding: '0 2px', flexShrink: 0,
                }}>×</button>
              </div>

              {/* Scores row */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                {[
                  { label: 'Confidence', value: `${Math.round((selectedHotspot.confidence_score ?? 0) * 100)}%`, color: '#60a5fa' },
                  { label: 'Virality',   value: `${(selectedHotspot.virality_score ?? 0).toFixed(1)}×`,        color: '#f59e0b' },
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

              {/* Platform breakdown
                  API INTEGRATION: GET /api/v1/heatmap/hotspot/{id}/platforms
                  Returns: [{ name: string, pct: number }]
               */}
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
                        <div style={{ height: '100%', borderRadius: 1, width: `${p.pct}%`, background: '#3b82f6', transition: 'width 0.5s ease' }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Top claims
                  API INTEGRATION: GET /api/v1/heatmap/hotspot/{id}/claims
                  Returns: string[]
               */}
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

              {/* Time breakdown
                  API INTEGRATION: GET /api/v1/heatmap/hotspot/{id}?breakdown=time
                  Returns: { '1h': n, '24h': n, '7d': n }
               */}
              {selectedHotspot.timeData && (
                <div style={{ display: 'flex', gap: 5, paddingTop: 8, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
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
            </div>
          )}

          {/* ── Feature 3: Multi-select category filter ── */}
          <div style={{ padding: '11px 15px', ...divider }}>
            <p style={sectionHeader}>Category Filter</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CATEGORIES.map(c => (
                <button
                  key={c}
                  onClick={() => toggleCat(c)}
                  style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: catActive(c) ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
                    color: catActive(c) ? '#60a5fa' : '#475569',
                    border: `1px solid ${catActive(c) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    outline: 'none',
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
            {multiCats.size > 0 && (
              <p style={{ fontSize: 9, color: '#334155', marginTop: 6 }}>
                Click active filters again to deselect · &quot;All&quot; clears all
              </p>
            )}
          </div>

          {/* Trending narratives */}
          <div style={{ padding: '11px 15px', flex: 1 }}>
            <p style={sectionHeader}>Trending Narratives</p>
            {filteredNarratives.length === 0 ? (
              <p style={{ fontSize: 11, color: '#1e293b', padding: '24px 0', textAlign: 'center' }}>
                No narratives in this category.
              </p>
            ) : filteredNarratives.map(n => (
              <div key={n.rank} style={{
                padding: '9px 0', borderBottom: '1px solid rgba(255,255,255,0.04)',
                display: 'flex', gap: 10, alignItems: 'flex-start',
              }}>
                <span style={{ fontSize: 10, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0, width: 14, paddingTop: 1 }}>
                  {n.rank}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45, marginBottom: 5 }}>{n.title}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <span style={{
                      fontSize: 9, padding: '1px 6px', borderRadius: 3,
                      background: 'rgba(255,255,255,0.04)', color: '#334155',
                      border: '1px solid rgba(255,255,255,0.06)',
                    }}>
                      {n.category}
                    </span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#334155', fontFamily: 'monospace' }}>
                      {(n.volume / 1000).toFixed(1)}k
                    </span>
                    <span style={{
                      fontSize: 12, fontWeight: 700,
                      color: n.trend === 'up' ? '#ef4444' : n.trend === 'down' ? '#10b981' : '#334155',
                    }}>
                      {n.trend === 'up' ? '↑' : n.trend === 'down' ? '↓' : '–'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div style={{ padding: '9px 15px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
            <p style={{ fontSize: 9, color: '#1e293b', textAlign: 'center', lineHeight: 1.7 }}>
              MongoDB Atlas · Change Streams · 30 s refresh
            </p>
          </div>
        </div>

      </div>
    </div>
  )
}
