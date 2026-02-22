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
import { getHeatmapEvents } from '../lib/api'
import Globe from 'react-globe.gl'

import { SimulationProvider } from '../context/SimulationContext'
import { useLiveEventFeed }   from '../hooks/useLiveEventFeed'
import TopControlBar          from '../components/heatmap/TopControlBar'
import LeftControlPanel       from '../components/heatmap/LeftControlPanel'
import RightSimulationPanel   from '../components/heatmap/RightSimulationPanel'
import GlobeOverlayLayer      from '../components/heatmap/GlobeOverlayLayer'

/* ─── Constants ──────────────────────────────────────────────────────────── */

/* CATEGORIES moved to RightSimulationPanel.jsx */

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

/* MOCK_ALERTS moved to LeftControlPanel.jsx */

const NARRATIVES = [
  { rank: 1, title: 'Vaccine microchip conspiracy resurfaces ahead of flu season',   category: 'Health',   volume: 14200, trend: 'up'   },
  { rank: 2, title: 'AI-generated election footage spreads across social platforms', category: 'Politics', volume: 11800, trend: 'up'   },
  { rank: 3, title: 'Manipulated climate data graph shared by influencers',          category: 'Climate',  volume: 9400,  trend: 'up'   },
  { rank: 4, title: 'False banking collapse rumour triggers regional bank run',      category: 'Finance',  volume: 7600,  trend: 'down' },
  { rank: 5, title: 'Doctored satellite images misidentify conflict zone locations', category: 'Conflict', volume: 6300,  trend: 'up'   },
  { rank: 6, title: '"Miracle cure" claims spread via encrypted messaging apps',    category: 'Health',   volume: 5100,  trend: 'same' },
]

/* FEED_ITEMS and INITIAL_FEED_HISTORY moved to hooks/useLiveEventFeed.js */


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
/* panelBg and divider moved to panel components */

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function Heatmap() {

  /* ── Live feed + WS state — managed by hook ── */
  const { liveFeed, feedHistory, totalEvents, autoScroll, setAutoScroll } = useLiveEventFeed()

  /* ── Existing state ── */
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

  /* Feature 11 simulation state is managed by SimulationContext + useSimulation hook */
  /* Feature 10 feed state (feedHistory, autoScroll) comes from useLiveEventFeed above */

  /* ── Feature 9: Geolocation ── */
  const [userLocation,  setUserLocation]  = useState(null)
  const [locationError, setLocationError] = useState(null)

  const mapRef   = useRef(null)
  const globeRef = useRef(null)
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
      // totalEvents is managed by useLiveEventFeed (WebSocket stream)
    } catch (_) { /* keep mock data */ }
  }, [])

  useEffect(() => {
    fetchHeatmap()
    const id = setInterval(fetchHeatmap, 30000)
    return () => clearInterval(id)
  }, [fetchHeatmap])

  /* WS live feed moved to hooks/useLiveEventFeed.js */

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

  /* Feature 11 simulation + trackNarrative moved to hooks/useSimulation.js + RightSimulationPanel */

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

  /* ── Render ── */
  return (
    <SimulationProvider>
    <div style={{
      position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column',
      background: '#04070f', color: '#cbd5e1',
      fontFamily: "'Inter', system-ui, sans-serif",
      overflow: 'hidden', zIndex: 10,
    }}>

      {/* ══════════════════════ TOP BAR ══════════════════════ */}
      <TopControlBar
        vizMode={vizMode}
        setVizMode={setVizMode}
        now={now}
        maxSeverity={maxSeverity}
        maxSevColor={maxSevColor}
        totalEvents={totalEvents}
      />

      {/* ══════════════════════ MAIN CONTENT ══════════════════════ */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: 0 }}>

        {/* ═══════════════ 3-COLUMN BODY ═══════════════ */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* ════ LEFT PANEL ════ */}
          <LeftControlPanel
            liveFeed={liveFeed}
            globeSpots={globeSpots}
            selectedHotspot={selectedHotspot}
            setSelectedHotspot={setSelectedHotspot}
            regions={regions}
            timeRange={timeRange}
            setTimeRange={setTimeRange}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            vizMode={vizMode}
            userLocation={userLocation}
            enableLocation={enableLocation}
            locationError={locationError}
          />
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

            {/* Simulation result overlay — pure HTML, does not touch Globe internals */}
            <GlobeOverlayLayer />
          </div>

          {/* ════ RIGHT PANEL ════ */}
          <RightSimulationPanel
            selectedHotspot={selectedHotspot}
            setSelectedHotspot={setSelectedHotspot}
            multiCats={multiCats}
            toggleCat={toggleCat}
            catActive={catActive}
            filteredNarratives={filteredNarratives}
            timeRange={timeRange}
            setMultiCats={setMultiCats}
          />
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
    </SimulationProvider>
  )
}
