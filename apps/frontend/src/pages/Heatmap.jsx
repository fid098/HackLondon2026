/**
 * Heatmap.jsx — Misinformation Intelligence Command Center.
 * DEVELOPER: Ayo
 *
 * Layout: fixed full-screen flex-column
 *   TOP BAR  (48px)    — branding, live pill, viz toggle, risk badge, clock
 *   MAIN CONTENT (flex-1, flex-column)
 *     ├── THREE-COLUMN BODY (flex-1)
 *     │     LEFT  (258px) — live feed, time controls, hotspots, alert feed, location
 *     │     CENTER (flex) — 3D globe with overlays
 *     │     RIGHT (300px) — hotspot panel, simulation, category filter, narratives
 *     └── BOTTOM AI FEED (115px) — auto-scrolling real-time event log
 *
 * Features:
 *   1. Geospatial Heat Layer  — view modes Global/Country/City + intensity sizing
 *   2. Time Intelligence      — 1h/24h/7d selector + animated playback
 *   3. Multi-select Filters   — Set-based category pills
 *   4. Confidence Mode        — Volume vs Risk (count × confidence × virality)
 *   5. Hotspot Detection Panel— click globe point → drill-down in right panel
 *   6. Narrative Spread Arcs  — animated arcs connecting same-category hotspots
 *   7. Real-time Updates      — coordinated/spike hotspots pulse faster
 *   8. Alert Layer            — coordinated campaign + spike anomaly feed
 *   9. Personalization Mode   — geolocation → auto-focus globe
 *  10. Live AI Feed (bottom)  — auto-scrolling event log from WebSocket stream
 *  11. Predictive Simulation  — "Simulate Spread" + "Track Narrative" actions
 *
 * Data flow:
 *   fetchHeatmap()       → GET /api/v1/heatmap every 30 s
 *   openHeatmapStream()  → WebSocket /api/v1/heatmap/stream (live events)
 *   getHeatmapArcs()     → GET /api/v1/heatmap/arcs (narrative arc pairs)
 *   runSimulation()      → POST /api/v1/heatmap/simulate (predictive model)
 *   Fallback mock data shown when backend is unavailable.
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getHeatmapEvents, openHeatmapStream, runSimulation } from '../lib/api'
// getHeatmapArcs is imported when the /api/v1/heatmap/arcs endpoint is live:
// import { getHeatmapEvents, openHeatmapStream, getHeatmapArcs, runSimulation } from '../lib/api'
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
 * HOTSPOTS — enriched mock data with accurate lat/lng for correct globe placement.
 * API INTEGRATION: Replace with GET /api/v1/heatmap response.
 */
const HOTSPOTS = [
  {
    lat: 40.7, lng: -74.0, label: 'New York', count: 312, severity: 'high', category: 'Health',
    confidence_score: 0.87, virality_score: 1.4, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 45 }, { name: 'Facebook', pct: 30 }, { name: 'Telegram', pct: 25 }],
    topClaims: ['Vaccine microchip conspiracy resurfaces', 'Hospital overflow claims spreading'],
    timeData: { '1h': 42, '24h': 312, '7d': 1840 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    lat: 34.1, lng: -118.2, label: 'Los Angeles', count: 198, severity: 'medium', category: 'Politics',
    confidence_score: 0.74, virality_score: 1.1, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 55 }, { name: 'Reddit', pct: 30 }, { name: 'TikTok', pct: 15 }],
    topClaims: ['AI-generated election footage shared', 'Voter fraud claims resurface'],
    timeData: { '1h': 18, '24h': 198, '7d': 940 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 51.5, lng: -0.1, label: 'London', count: 245, severity: 'high', category: 'Health',
    confidence_score: 0.91, virality_score: 1.6, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 40 }, { name: 'WhatsApp', pct: 35 }, { name: 'Facebook', pct: 25 }],
    topClaims: ['NHS collapse false reports', '5G health conspiracy gaining traction'],
    timeData: { '1h': 31, '24h': 245, '7d': 1620 },
    isCoordinated: true, isSpikeAnomaly: true,
  },
  {
    lat: 52.5, lng: 13.4, label: 'Berlin', count: 134, severity: 'medium', category: 'Climate',
    confidence_score: 0.68, virality_score: 0.9, trend: 'same',
    platforms: [{ name: 'Twitter/X', pct: 35 }, { name: 'Telegram', pct: 40 }, { name: 'YouTube', pct: 25 }],
    topClaims: ['Manipulated climate data graph circulating', 'Fake IPCC report screenshots'],
    timeData: { '1h': 11, '24h': 134, '7d': 720 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 55.7, lng: 37.6, label: 'Moscow', count: 389, severity: 'high', category: 'Politics',
    confidence_score: 0.94, virality_score: 2.1, trend: 'up',
    platforms: [{ name: 'Telegram', pct: 60 }, { name: 'VKontakte', pct: 25 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['State-linked narrative amplification', 'Conflict zone footage misattributed'],
    timeData: { '1h': 55, '24h': 389, '7d': 2340 },
    isCoordinated: true, isSpikeAnomaly: true,
  },
  {
    lat: 39.9, lng: 116.4, label: 'Beijing', count: 521, severity: 'high', category: 'Science',
    confidence_score: 0.82, virality_score: 1.8, trend: 'up',
    platforms: [{ name: 'WeChat', pct: 50 }, { name: 'Weibo', pct: 35 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['Lab origin claims resurface', 'Fabricated research paper spreads'],
    timeData: { '1h': 68, '24h': 521, '7d': 3120 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    lat: 35.7, lng: 139.7, label: 'Tokyo', count: 287, severity: 'medium', category: 'Finance',
    confidence_score: 0.71, virality_score: 1.2, trend: 'down',
    platforms: [{ name: 'Twitter/X', pct: 50 }, { name: 'LINE', pct: 30 }, { name: 'Reddit', pct: 20 }],
    topClaims: ['False banking collapse rumour', 'Yen manipulation conspiracy'],
    timeData: { '1h': 22, '24h': 287, '7d': 1540 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 28.6, lng: 77.2, label: 'Delhi', count: 403, severity: 'high', category: 'Health',
    confidence_score: 0.85, virality_score: 1.5, trend: 'up',
    platforms: [{ name: 'WhatsApp', pct: 55 }, { name: 'Facebook', pct: 30 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['"Miracle cure" claims via WhatsApp', 'Hospital queue footage misused'],
    timeData: { '1h': 48, '24h': 403, '7d': 2210 },
    isCoordinated: false, isSpikeAnomaly: true,
  },
  {
    lat: -23.5, lng: -46.6, label: 'São Paulo', count: 176, severity: 'medium', category: 'Politics',
    confidence_score: 0.72, virality_score: 1.0, trend: 'same',
    platforms: [{ name: 'WhatsApp', pct: 60 }, { name: 'Facebook', pct: 25 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['Election fraud claims re-circulating', 'Deepfake political speech spreading'],
    timeData: { '1h': 14, '24h': 176, '7d': 890 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 30.1, lng: 31.2, label: 'Cairo', count: 218, severity: 'medium', category: 'Conflict',
    confidence_score: 0.78, virality_score: 1.3, trend: 'up',
    platforms: [{ name: 'Facebook', pct: 45 }, { name: 'Twitter/X', pct: 30 }, { name: 'YouTube', pct: 25 }],
    topClaims: ['Conflict footage misattributed', 'Civilian casualty numbers inflated'],
    timeData: { '1h': 19, '24h': 218, '7d': 1100 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: -1.3, lng: 36.8, label: 'Nairobi', count: 92, severity: 'low', category: 'Health',
    confidence_score: 0.61, virality_score: 0.7, trend: 'down',
    platforms: [{ name: 'WhatsApp', pct: 65 }, { name: 'Facebook', pct: 25 }, { name: 'Twitter/X', pct: 10 }],
    topClaims: ['Unverified herbal cure claims', 'Epidemic severity overstated'],
    timeData: { '1h': 6, '24h': 92, '7d': 480 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 35.7, lng: 51.4, label: 'Tehran', count: 267, severity: 'high', category: 'Conflict',
    confidence_score: 0.89, virality_score: 1.7, trend: 'up',
    platforms: [{ name: 'Telegram', pct: 55 }, { name: 'Instagram', pct: 30 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['State-backed disinformation campaign', 'Protest footage misrepresented'],
    timeData: { '1h': 38, '24h': 267, '7d': 1760 },
    isCoordinated: true, isSpikeAnomaly: false,
  },
  {
    lat: -6.2, lng: 106.8, label: 'Jakarta', count: 145, severity: 'medium', category: 'Health',
    confidence_score: 0.69, virality_score: 1.1, trend: 'same',
    platforms: [{ name: 'WhatsApp', pct: 50 }, { name: 'Twitter/X', pct: 30 }, { name: 'TikTok', pct: 20 }],
    topClaims: ['Supplement claims trending', 'Dengue statistics manipulated'],
    timeData: { '1h': 12, '24h': 145, '7d': 730 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: -33.9, lng: 151.2, label: 'Sydney', count: 118, severity: 'low', category: 'Climate',
    confidence_score: 0.65, virality_score: 0.8, trend: 'up',
    platforms: [{ name: 'Twitter/X', pct: 45 }, { name: 'Facebook', pct: 35 }, { name: 'Reddit', pct: 20 }],
    topClaims: ['Wildfire scale misrepresented', 'Climate policy misinformation spreading'],
    timeData: { '1h': 8, '24h': 118, '7d': 560 },
    isCoordinated: false, isSpikeAnomaly: false,
  },
  {
    lat: 6.5, lng: 3.4, label: 'Lagos', count: 156, severity: 'medium', category: 'Finance',
    confidence_score: 0.73, virality_score: 1.2, trend: 'up',
    platforms: [{ name: 'WhatsApp', pct: 55 }, { name: 'Facebook', pct: 30 }, { name: 'Twitter/X', pct: 15 }],
    topClaims: ['Crypto scam narratives spreading', 'Banking system collapse rumours'],
    timeData: { '1h': 15, '24h': 156, '7d': 780 },
    isCoordinated: false, isSpikeAnomaly: true,
  },
]

/**
 * MOCK_ALERTS — Alert feed.
 * API INTEGRATION: Replace with GET /api/v1/alerts or WS /api/v1/alerts/stream
 * MongoDB: db.reports.aggregate spike + coordination detection queries.
 */
const MOCK_ALERTS = [
  { id: 1, type: 'coordinated', city: 'Moscow',   msg: 'Coordinated campaign — 94% confidence', sev: 'high',   time: '1m ago'  },
  { id: 2, type: 'spike',       city: 'London',   msg: 'Spike anomaly: +187% vs 7-day baseline', sev: 'high',   time: '3m ago'  },
  { id: 3, type: 'coordinated', city: 'Beijing',  msg: 'Coordinated amplification detected',     sev: 'high',   time: '6m ago'  },
  { id: 4, type: 'spike',       city: 'Delhi',    msg: 'Event surge: +145% in last hour',         sev: 'medium', time: '11m ago' },
  { id: 5, type: 'coordinated', city: 'Tehran',   msg: 'State-linked network activity',           sev: 'high',   time: '14m ago' },
  { id: 6, type: 'spike',       city: 'New York', msg: 'Health narrative spike detected',         sev: 'medium', time: '22m ago' },
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

/**
 * INITIAL_FEED_HISTORY — pre-loaded bottom feed entries.
 * API INTEGRATION: Replace with last N events from GET /api/v1/heatmap/feed?limit=50
 * or replay from WS on connect (server sends last 20 events on open).
 */
const INITIAL_FEED_HISTORY = [
  { id: 1,  time: '04:58:09', msg: 'Deepfake audio campaign detected',      city: 'Moscow',    category: 'Politics', sev: 'high'   },
  { id: 2,  time: '04:59:41', msg: 'Narrative variant spreading',           city: 'New York',  category: 'Health',   sev: 'high'   },
  { id: 3,  time: '05:01:14', msg: 'Coordinated amplification active',      city: 'Beijing',   category: 'Science',  sev: 'high'   },
  { id: 4,  time: '05:02:58', msg: 'Climate data manipulation detected',    city: 'Berlin',    category: 'Climate',  sev: 'medium' },
  { id: 5,  time: '05:04:22', msg: 'Finance rumour gaining traction',       city: 'Tokyo',     category: 'Finance',  sev: 'medium' },
  { id: 6,  time: '05:06:47', msg: 'Conflict footage misattributed',        city: 'Tehran',    category: 'Conflict', sev: 'high'   },
  { id: 7,  time: '05:09:03', msg: 'Spike anomaly: +145% in last hour',    city: 'Delhi',     category: 'Health',   sev: 'medium' },
  { id: 8,  time: '05:11:55', msg: 'State-linked network activity',         city: 'Moscow',    category: 'Politics', sev: 'high'   },
  { id: 9,  time: '05:14:28', msg: 'Coordinated campaign forming',          city: 'London',    category: 'Health',   sev: 'high'   },
  { id: 10, time: '05:17:12', msg: 'Agent verdict: FALSE',                  city: 'São Paulo', category: 'Politics', sev: 'medium' },
]


const SEV = {
  high:   { ring: '#ef4444', label: 'High',   text: '#ef4444' },
  medium: { ring: '#f59e0b', label: 'Medium', text: '#f59e0b' },
  low:    { ring: '#10b981', label: 'Low',    text: '#10b981' },
}

const TIME_RANGES = ['1h', '24h', '7d']

/* ─── Helpers ────────────────────────────────────────────────────────────── */

/**
 * getDisplayCount — Feature 4: Confidence Mode.
 * Volume: raw event count for selected time range.
 * Risk:   count × confidence_score × virality_score (risk-weighted impact).
 * API INTEGRATION: confidence_score + virality_score come from /api/v1/heatmap per hotspot.
 */
function getDisplayCount(spot, vizMode, timeRange) {
  const base = spot.timeData?.[timeRange] ?? spot.count
  return vizMode === 'risk'
    ? Math.round(base * (spot.confidence_score ?? 1) * (spot.virality_score ?? 1))
    : base
}

/* ─── Style constants ────────────────────────────────────────────────────── */

const sectionHeader = {
  fontSize: 9, fontWeight: 700, color: '#334155',
  textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 8,
}
const panelBg = { background: 'rgba(8,12,22,0.92)' }
const divider  = { borderBottom: '1px solid rgba(255,255,255,0.06)' }

/* ─── Component ──────────────────────────────────────────────────────────── */

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

  /* ── Location search ── */
  const [locationQuery,    setLocationQuery]    = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [searchedLocation,  setSearchedLocation]  = useState(null) // { lat, lng, name }

  /* ── Feature 4: Viz mode ── */
  const [vizMode, setVizMode] = useState('volume')

  /* ── Feature 3: Multi-select categories ── */
  const [multiCats, setMultiCats] = useState(new Set())

  /* ── Feature 5: Hotspot Detection Panel ── */
  const [selectedHotspot, setSelectedHotspot] = useState(null)

  /* ── Feature 11: Simulation ── */
  const [simulationRunning, setSimulationRunning] = useState(false)
  const [simResult,         setSimResult]         = useState(null)

  /* ── Feature 10: Bottom AI feed ── */
  const [feedHistory, setFeedHistory] = useState(INITIAL_FEED_HISTORY)
  const [autoScroll,  setAutoScroll]  = useState(true)

  /* ── Feature 9: Geolocation ── */
  const [userLocation,  setUserLocation]  = useState(null)
  const [locationError, setLocationError] = useState(null)

  const mapRef   = useRef(null)
  const globeRef = useRef(null)
  const wsRef    = useRef(null)
  const feedRef  = useRef(null)

  /* ── Live clock ── */
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  /* ── Country GeoJSON ── */
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(r => r.json()).then(setCountries).catch(console.error)
  }, [])

  /* ── Globe container dimensions ── */
  useEffect(() => {
    if (!mapRef.current) return
    const ro = new ResizeObserver(([e]) => {
      setMapW(e.contentRect.width)
      setMapH(e.contentRect.height)
    })
    ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  /* ── Feed auto-scroll ── */
  useEffect(() => {
    if (autoScroll && feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [feedHistory, autoScroll])

  /* ── Periodic heatmap fetch ──
   * API INTEGRATION: getHeatmapEvents() → GET /api/v1/heatmap?hours=24
   * Pass timeRange-mapped hours: { '1h': 1, '24h': 24, '7d': 168 }
   * Response: { events, regions, narratives, total_events }
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

  /* ── WebSocket live feed ──
   * API INTEGRATION: openHeatmapStream() → WS /api/v1/heatmap/stream
   * Msg shape: { type, message, city?, category?, severity?, delta, timestamp }
   * On connect, server should replay last 20 events so feed is pre-populated.
   */
  useEffect(() => {
    let fallbackId
    try {
      const ws = openHeatmapStream((msg) => {
        if (msg.message) setLiveFeed(msg.message)
        if (msg.delta)   setTotalEvents(n => n + msg.delta)
        if (msg.message) {
          setFeedHistory(prev => [...prev, {
            id: Date.now(),
            time: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
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
        const raw = FEED_ITEMS[idx]
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
    return () => { wsRef.current?.close(); if (fallbackId) clearInterval(fallbackId) }
  }, [])

  /* ── Feature 2: Playback ── */
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

  /* ── Feature 9: Focus globe on user location ── */
  useEffect(() => {
    if (!userLocation || !globeRef.current) return
    globeRef.current.pointOfView({ lat: userLocation.lat, lng: userLocation.lng, altitude: 1.5 }, 1200)
  }, [userLocation])

  /* ── Feature 9: Geolocation ──
   * API INTEGRATION: POST /api/v1/user/location { lat, lng } to persist preference.
   */
  const enableLocation = useCallback(() => {
    if (!navigator.geolocation) { setLocationError('Not supported'); return }
    navigator.geolocation.getCurrentPosition(
      pos => { setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }); setLocationError(null) },
      ()  => setLocationError('Permission denied'),
    )
  }, [])

  /* ── Location search — geocodes a place name and flies the globe to it ── */
  const searchLocation = useCallback(async (query) => {
    const q = (query ?? locationQuery).trim()
    if (!q || !globeRef.current) return
    setLocationSearching(true)
    try {
      const res  = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)
      const data = await res.json()
      if (data.length > 0) {
        const { lat, lon, display_name } = data[0]
        const parsedLat = parseFloat(lat)
        const parsedLng = parseFloat(lon)
        setSearchedLocation({ lat: parsedLat, lng: parsedLng, name: display_name.split(',')[0] })
        globeRef.current.pointOfView({ lat: parsedLat, lng: parsedLng, altitude: 1.2 }, 1000)
      }
    } catch (_) { /* ignore network errors */ } finally {
      setLocationSearching(false)
    }
  }, [locationQuery])

  /* ── Feature 3: Multi-select ── */
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

  /* ── Feature 5: Point click ── */
  const handlePointClick = useCallback((spot) => setSelectedHotspot(spot), [])

  /* ── Feature 7: Ring speed for anomalies ── */
  const ringSpeed  = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 4.5 : 2.5, [])
  const ringPeriod = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 500  : 900,  [])

  /* ── Feature 4: Point radius scales with virality in risk mode ── */
  const pointRadius = useCallback((s) => {
    const base  = s.severity === 'high' ? 0.55 : s.severity === 'medium' ? 0.4 : 0.28
    const boost = vizMode === 'risk' ? Math.min((s.virality_score ?? 1) * 0.12, 0.28) : 0
    return base + boost
  }, [vizMode])

  /* ── Feature 11: Track Narrative globally ──
   * API INTEGRATION: POST /api/v1/heatmap/track-narrative
   * Body: { narrative_id: selectedHotspot.narrativeId, category: selectedHotspot.category }
   * Response: { watch_id: string } — stores a server-side watch for this narrative.
   */
  const trackNarrative = useCallback(() => {
    if (!selectedHotspot) return
    setMultiCats(new Set([selectedHotspot.category]))
    setSelectedHotspot(null)
  }, [selectedHotspot])

  /* ── Feature 11: Predictive Spread Simulation ──
   * API INTEGRATION: POST /api/v1/heatmap/simulate
   * Body: { hotspot_label, category, time_horizon_hours: 48 }
   * Response: { projected_spread: [{lat, lng, projectedCount}], confidence: number }
   * Uses historical velocity + virality_score to project spread adjacency.
   */
  const handleRunSimulation = useCallback(async () => {
    if (simulationRunning) return
    setSimulationRunning(true)
    setSimResult(null)
    try {
      const result = await runSimulation({
        hotspot_label:      selectedHotspot?.label,
        category:           selectedHotspot?.category,
        time_horizon_hours: 48,
      })
      setSimResult(result)
    } catch (_) {
      // Mock result while backend endpoint isn't yet implemented
      setSimResult({
        confidence: 0.74,
        model: 'velocity-diffusion-v1',
        projected_spread: [{ city: 'Warsaw', projectedCount: 180 }, { city: 'Prague', projectedCount: 120 }],
      })
    } finally {
      setSimulationRunning(false)
    }
  }, [simulationRunning, selectedHotspot])

  /* ── Derived data ── */

  const globeSpots = useMemo(() =>
    hotspots
      .filter(h => multiCats.size === 0 || multiCats.has(h.category))
      .map(spot => ({
        ...spot,
        displayCount: getDisplayCount(spot, vizMode, timeRange),
      })),
    [hotspots, multiCats, vizMode, timeRange],
  )


  const filteredNarratives = useMemo(() =>
    narratives.filter(n => multiCats.size === 0 || multiCats.has(n.category)),
    [narratives, multiCats],
  )

  // Search result marker — shown as a single label on the globe
  const searchMarkers = useMemo(() =>
    searchedLocation ? [searchedLocation] : [],
    [searchedLocation],
  )

  const maxSeverity = globeSpots.some(s => s.severity === 'high')   ? 'HIGH'
                    : globeSpots.some(s => s.severity === 'medium') ? 'MEDIUM' : 'LOW'
  const maxSevColor = maxSeverity === 'HIGH' ? '#ef4444' : maxSeverity === 'MEDIUM' ? '#f59e0b' : '#10b981'
  const timeStr     = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>
            <span style={{ color: '#818cf8' }}>ver</span>ify
          </span>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 11, color: '#475569', fontWeight: 500 }}>Intelligence Heatmap</span>
        </div>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 7,
          padding: '5px 14px', borderRadius: 7,
          background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)',
          fontSize: 11, fontWeight: 600, color: '#60a5fa',
        }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 6px #3b82f6' }} />
          Live Monitoring
        </div>

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

      {/* ══════════════════════ MAIN CONTENT ══════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* ═══════════════ 3-COLUMN BODY ═══════════════ */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* ════ LEFT PANEL ════ */}
          <div style={{
            width: 258, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderRight: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', ...panelBg,
          }}>
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

            {/* Feature 2: Time Intelligence */}
            <div style={{ padding: '10px 15px', ...divider }}>
              <p style={sectionHeader}>Time Window</p>
              {/* API INTEGRATION: pass selected range to fetchHeatmap as hours param */}
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
                <button onClick={() => setIsPlaying(p => !p)} title={isPlaying ? 'Pause' : 'Animate'} style={{
                  padding: '5px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  border: `1px solid ${isPlaying ? 'rgba(239,68,68,0.45)' : 'rgba(255,255,255,0.07)'}`,
                  background: isPlaying ? 'rgba(239,68,68,0.12)' : 'rgba(255,255,255,0.03)',
                  color: isPlaying ? '#ef4444' : '#475569',
                }}>
                  {isPlaying ? '⏸' : '▶'}
                </button>
              </div>
              <p style={{ fontSize: 9, color: '#1e293b' }}>
                {timeRange} · <span style={{ color: '#334155' }}>{vizMode === 'risk' ? 'Risk-weighted' : 'Raw volume'}</span>
              </p>
            </div>

            {/* Active hotspots */}
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
                      <div style={{ display: 'flex', gap: 6 }}>
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

            {/* Feature 8: Alert Feed */}
            <div style={{ padding: '10px 15px', ...divider }}>
              {/* API INTEGRATION: GET /api/v1/alerts or WS /api/v1/alerts/stream */}
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

            {/* Feature 9: Location button */}
            <div style={{ padding: '10px 15px', marginTop: 'auto' }}>
              {/* API INTEGRATION: POST /api/v1/user/location { lat, lng } */}
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

          {/* ════ CENTER: Globe ════ */}
          <div ref={mapRef} style={{ flex: 1, position: 'relative', overflow: 'hidden', background: '#020509', minWidth: 0 }}>

            {/* Location search — top left */}
            <div style={{
              position: 'absolute', top: 14, left: 14, zIndex: 10,
              display: 'flex', gap: 5, alignItems: 'center',
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 0,
                background: 'rgba(4,7,15,0.92)', border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 8, overflow: 'hidden', backdropFilter: 'blur(10px)',
              }}>
                <span style={{ padding: '0 8px', fontSize: 12, color: '#334155', pointerEvents: 'none' }}>🔍</span>
                <input
                  value={locationQuery}
                  onChange={e => setLocationQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && searchLocation()}
                  placeholder="Search location…"
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 11, color: '#e2e8f0', width: 160, padding: '7px 4px',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  onClick={() => searchLocation()}
                  disabled={locationSearching}
                  style={{
                    padding: '0 10px', height: '100%', minHeight: 30,
                    background: locationSearching ? 'rgba(99,102,241,0.1)' : 'rgba(99,102,241,0.18)',
                    border: 'none', borderLeft: '1px solid rgba(255,255,255,0.06)',
                    color: locationSearching ? '#475569' : '#818cf8',
                    fontSize: 11, cursor: locationSearching ? 'wait' : 'pointer',
                    fontWeight: 600, transition: 'all 0.15s',
                  }}
                >
                  {locationSearching ? '…' : '→'}
                </button>
              </div>
              {searchedLocation && (
                <div style={{
                  padding: '5px 10px', borderRadius: 6, fontSize: 10,
                  background: 'rgba(99,102,241,0.12)', border: '1px solid rgba(99,102,241,0.25)',
                  color: '#818cf8', backdropFilter: 'blur(10px)',
                  display: 'flex', alignItems: 'center', gap: 6, maxWidth: 180,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}>
                  <span style={{ color: '#f59e0b' }}>📍</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{searchedLocation.name}</span>
                  <button
                    onClick={() => { setSearchedLocation(null); setLocationQuery('') }}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 0, fontSize: 12, lineHeight: 1, flexShrink: 0 }}
                  >×</button>
                </div>
              )}
            </div>

            {/* Time + mode indicator — top center */}
            <div style={{
              position: 'absolute', top: 14, left: '50%', transform: 'translateX(-50%)',
              zIndex: 10, pointerEvents: 'none',
              background: 'rgba(4,7,15,0.85)', border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 6, padding: '4px 12px',
              fontSize: 9, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.08em', whiteSpace: 'nowrap',
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

                /* Country polygon overlay — clean subtle fill, no political colors */
                polygonsData={countries.features}
                polygonCapColor={() => 'rgba(18,28,50,0.45)'}
                polygonSideColor={() => 'rgba(0,0,0,0)'}
                polygonStrokeColor={() => 'rgba(148,163,184,0.13)'}
                polygonAltitude={0.004}

                /* Search result marker label */
                labelsData={searchMarkers}
                labelLat={d => d.lat}
                labelLng={d => d.lng}
                labelText={d => `📍 ${d.name}`}
                labelSize={0.55}
                labelColor={() => '#fbbf24'}
                labelDotRadius={0.4}
                labelAltitude={0.015}
                labelResolution={2}

                /* Feature 7: rings — anomaly hotspots pulse faster */
                ringsData={globeSpots}
                ringColor={s => SEV[s.severity].ring}
                ringMaxRadius={s => s.severity === 'high' ? 9 : s.severity === 'medium' ? 6 : 4}
                ringPropagationSpeed={ringSpeed}
                ringRepeatPeriod={ringPeriod}

                pointsData={globeSpots}
                pointColor={p => SEV[p.severity].ring}
                pointAltitude={0.06}
                pointRadius={pointRadius}
                pointLabel={p => `
                  <div style="background:rgba(4,7,15,0.97);border:1px solid ${SEV[p.severity].ring}88;border-radius:8px;padding:7px 11px;font-size:11px;white-space:nowrap;box-shadow:0 4px 20px ${SEV[p.severity].ring}40;">
                    <div style="color:${SEV[p.severity].ring};font-weight:800;font-size:13px;margin-bottom:3px;">
                      ${p.label}
                      ${p.isSpikeAnomaly ? '<span style="font-size:9px;background:rgba(239,68,68,0.2);color:#ef4444;padding:1px 5px;border-radius:3px;margin-left:6px;">↑ SPIKE</span>' : ''}
                      ${p.isCoordinated ? '<span style="font-size:9px;background:rgba(245,158,11,0.2);color:#f59e0b;padding:1px 5px;border-radius:3px;margin-left:4px;">⚡ COORD</span>' : ''}
                    </div>
                    <div style="color:#64748b;margin-bottom:3px;">
                      ${p.displayCount.toLocaleString()} events · <b style="color:#94a3b8;">${p.severity}</b> · ${timeRange}
                    </div>
                    <div style="color:#334155;font-size:10px;">
                      Confidence: ${Math.round((p.confidence_score ?? 0) * 100)}% · Virality: ${(p.virality_score ?? 0).toFixed(1)}×
                    </div>
                  </div>
                `}

                /* Feature 5: click → Hotspot Detection Panel */
                onPointClick={handlePointClick}

                onGlobeReady={() => {
                  if (!globeRef.current) return
                  const ctrl = globeRef.current.controls()
                  ctrl.enableZoom  = true
                  ctrl.autoRotate  = true
                  ctrl.autoRotateSpeed = 0.45
                  // Zoom range: altitude ~0.15 (street level) to 8 (full-earth view)
                  ctrl.minDistance = 103
                  ctrl.maxDistance = 800
                  globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2 })
                }}
              />
            )}

            {/* Severity legend */}
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

            {/* Usage hint */}
            <div style={{
              position: 'absolute', bottom: 18, right: 18,
              fontSize: 9, color: 'rgba(71,85,105,0.7)',
              pointerEvents: 'none', userSelect: 'none',
              textAlign: 'right', lineHeight: 1.7,
            }}>
              Drag to rotate · Scroll to zoom<br />Click point for details
            </div>
          </div>

          {/* ════ RIGHT PANEL ════ */}
          <div style={{
            width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column',
            borderLeft: '1px solid rgba(255,255,255,0.07)', overflowY: 'auto', ...panelBg,
          }}>
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

            {/* Feature 5: Hotspot Detection Panel */}
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
                  <button onClick={() => { setSelectedHotspot(null); setSimResult(null) }} style={{
                    background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1,
                  }}>×</button>
                </div>

                {/* Score cards */}
                <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                  {[
                    { label: 'Confidence', value: `${Math.round((selectedHotspot.confidence_score ?? 0) * 100)}%`, color: '#60a5fa' },
                    { label: 'Virality',   value: `${(selectedHotspot.virality_score ?? 0).toFixed(1)}×`,         color: '#f59e0b' },
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

                {/* Platform breakdown — API: GET /api/v1/heatmap/hotspot/{id}/platforms */}
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

                {/* Top claims — API: GET /api/v1/heatmap/hotspot/{id}/claims */}
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

                {/* Time breakdown — API: GET /api/v1/heatmap/hotspot/{id}?breakdown=time */}
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

                {/* Feature 11: Simulation result */}
                {simResult && (
                  <div style={{ padding: '7px 0 4px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <p style={{ ...sectionHeader, marginBottom: 5, color: '#10b981' }}>Simulation Result</p>
                    <p style={{ fontSize: 9, color: '#334155', marginBottom: 4 }}>
                      Confidence: <span style={{ color: '#60a5fa', fontWeight: 700 }}>{Math.round((simResult.confidence ?? 0) * 100)}%</span>
                      {' · '}Model: <span style={{ color: '#475569' }}>{simResult.model ?? 'velocity-diffusion'}</span>
                    </p>
                    {simResult.projected_spread?.map((p, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
                        <span style={{ fontSize: 9, color: '#475569' }}>→ {p.city}</span>
                        <span style={{ fontSize: 9, color: '#10b981', fontFamily: 'monospace', fontWeight: 700 }}>
                          ~{(p.projectedCount ?? 0).toLocaleString()} events
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Feature 11: Action buttons */}
                <div style={{ display: 'flex', gap: 6, paddingTop: 8 }}>
                  <button onClick={trackNarrative} style={{
                    flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 9, fontWeight: 700,
                    cursor: 'pointer', border: '1px solid rgba(59,130,246,0.3)',
                    background: 'rgba(59,130,246,0.08)', color: '#60a5fa', transition: 'all 0.15s',
                  }}>
                    ↗ Track Globally
                  </button>
                  <button onClick={handleRunSimulation} disabled={simulationRunning} style={{
                    flex: 1, padding: '6px 0', borderRadius: 5, fontSize: 9, fontWeight: 700,
                    cursor: simulationRunning ? 'wait' : 'pointer',
                    border: `1px solid ${simulationRunning ? 'rgba(245,158,11,0.4)' : 'rgba(16,185,129,0.3)'}`,
                    background: simulationRunning ? 'rgba(245,158,11,0.1)' : 'rgba(16,185,129,0.07)',
                    color: simulationRunning ? '#f59e0b' : '#10b981', transition: 'all 0.15s',
                  }}>
                    {simulationRunning ? '⏳ Simulating…' : '▶ Simulate'}
                  </button>
                </div>
              </div>
            )}

            {/* Feature 3: Multi-select category filter */}
            <div style={{ padding: '11px 15px', ...divider }}>
              <p style={sectionHeader}>Category Filter</p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                {CATEGORIES.map(c => (
                  <button key={c} onClick={() => toggleCat(c)} style={{
                    padding: '4px 10px', borderRadius: 5, fontSize: 10, fontWeight: 600,
                    cursor: 'pointer', transition: 'all 0.15s',
                    background: catActive(c) ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)',
                    color: catActive(c) ? '#60a5fa' : '#475569',
                    border: `1px solid ${catActive(c) ? 'rgba(59,130,246,0.4)' : 'rgba(255,255,255,0.06)'}`,
                    outline: 'none',
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

        </div>{/* end 3-column */}

        {/* ════════════════ BOTTOM: LIVE AI FEED ════════════════ */}
        <div style={{
          height: 115, flexShrink: 0,
          borderTop: '1px solid rgba(255,255,255,0.07)',
          background: 'rgba(4,7,15,0.98)',
          display: 'flex', flexDirection: 'column',
        }}>
          {/* Feed header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '5px 18px', borderBottom: '1px solid rgba(255,255,255,0.06)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#3b82f6', boxShadow: '0 0 5px #3b82f6' }} />
              <span style={{ fontSize: 9, fontWeight: 700, color: '#3b82f6', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
                Live AI Feed
              </span>
              <span style={{ fontSize: 9, color: '#1e293b' }}>
                {feedHistory.length} events
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {/* API INTEGRATION: WS /api/v1/heatmap/stream — each new event appends here */}
              <span style={{ fontSize: 9, color: '#1e293b' }}>
                Source: <span style={{ color: '#334155' }}>WS /heatmap/stream</span>
              </span>
              <button onClick={() => setAutoScroll(p => !p)} style={{
                fontSize: 9, padding: '2px 7px', borderRadius: 3, cursor: 'pointer',
                border: '1px solid rgba(255,255,255,0.07)',
                background: autoScroll ? 'rgba(59,130,246,0.12)' : 'rgba(255,255,255,0.04)',
                color: autoScroll ? '#60a5fa' : '#475569',
              }}>
                {autoScroll ? '⬇ Auto ON' : '⬇ Auto OFF'}
              </button>
            </div>
          </div>

          {/* Scrollable feed */}
          <div
            ref={feedRef}
            style={{ flex: 1, overflowY: 'auto', padding: '4px 18px', display: 'flex', flexDirection: 'column', gap: 4 }}
          >
            {feedHistory.map(entry => (
              <div key={entry.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 9, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0, width: 56 }}>{entry.time}</span>
                <span style={{
                  fontSize: 8, padding: '1px 5px', borderRadius: 2, flexShrink: 0, fontWeight: 700,
                  background: entry.sev === 'high' ? 'rgba(239,68,68,0.15)' : 'rgba(245,158,11,0.12)',
                  color: entry.sev === 'high' ? '#ef4444' : '#f59e0b',
                }}>
                  {entry.sev.toUpperCase()}
                </span>
                <span style={{ fontSize: 9, color: '#475569', fontWeight: 600, flexShrink: 0 }}>[AI]</span>
                <span style={{ fontSize: 10, color: '#64748b' }}>{entry.msg}</span>
                {entry.city && entry.city !== '—' && (
                  <>
                    <span style={{ fontSize: 9, color: '#1e293b', flexShrink: 0 }}>→</span>
                    <span style={{ fontSize: 9, color: '#334155', fontWeight: 600, flexShrink: 0 }}>{entry.city}</span>
                  </>
                )}
                {entry.category && entry.category !== 'Unknown' && (
                  <span style={{
                    fontSize: 8, padding: '1px 5px', borderRadius: 2, flexShrink: 0,
                    background: 'rgba(255,255,255,0.04)', color: '#334155',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}>
                    {entry.category}
                  </span>
                )}
              </div>
            ))}
            {feedHistory.length === 0 && (
              <p style={{ fontSize: 10, color: '#1e293b', padding: '8px 0' }}>Connecting to event stream…</p>
            )}
          </div>
        </div>

      </div>{/* end main content */}
    </div>
  )
}
