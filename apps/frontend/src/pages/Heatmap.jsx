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
import { getIntelligenceSnapshot } from '../lib/intelligenceProvider'
import Globe from 'react-globe.gl'

import { SimulationProvider } from '../context/SimulationContext'
import { useLiveEventFeed } from '../hooks/useLiveEventFeed'
import TopControlBar from '../components/heatmap/TopControlBar'
import LeftControlPanel from '../components/heatmap/LeftControlPanel'
import RightSimulationPanel from '../components/heatmap/RightSimulationPanel'
import GlobeOverlayLayer from '../components/heatmap/GlobeOverlayLayer'
import SearchBar from '../components/common/SearchBar'
import GlobeLegend from '../components/common/GlobeLegend'
import RegionIntelPanel from '../components/heatmap/RegionIntelPanel'


/* ─── Constants ──────────────────────────────────────────────────────────── */


/* CATEGORIES moved to RightSimulationPanel.jsx */

/* Mock data is now handled inside intelligenceProvider.js (auto-fallback).
   HOTSPOTS / REGIONS / NARRATIVES no longer need to be imported here. */

/* FEED_ITEMS and INITIAL_FEED_HISTORY moved to hooks/useLiveEventFeed.js */


const SEV = {
  high: { ring: '#ef4444', label: 'High', text: '#ef4444' },
  medium: { ring: '#f59e0b', label: 'Medium', text: '#f59e0b' },
  low: { ring: '#10b981', label: 'Low', text: '#10b981' },
}

// Risk-level colors for globe visual encoding.
// When a hotspot has a computed risk_level, we use these instead of SEV
// to make the "intelligence-scored" view visually distinct.
const RISK_COLOR = {
  CRITICAL: '#ef4444',
  HIGH:     '#f97316',
  MEDIUM:   '#f59e0b',
  LOW:      '#10b981',
}

// Returns the best available color for a hotspot — risk_level takes priority over raw severity.
function spotColor(s) {
  return s.risk_level ? (RISK_COLOR[s.risk_level] ?? SEV[s.severity]?.ring ?? '#60a5fa')
                      : (SEV[s.severity]?.ring ?? '#60a5fa')
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

/* panelBg and divider moved to panel components */

// Category pill colours used in the live AI feed
const FEED_CAT_COLOR = {
  Health:   { bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.22)'  },
  Politics: { bg: 'rgba(249,115,22,0.10)', color: '#fb923c', border: 'rgba(249,115,22,0.22)' },
  Finance:  { bg: 'rgba(234,179,8,0.10)',  color: '#facc15', border: 'rgba(234,179,8,0.22)'  },
  Science:  { bg: 'rgba(59,130,246,0.10)', color: '#60a5fa', border: 'rgba(59,130,246,0.22)' },
  Conflict: { bg: 'rgba(239,68,68,0.10)',  color: '#f87171', border: 'rgba(239,68,68,0.22)'  },
  Climate:  { bg: 'rgba(16,185,129,0.10)', color: '#34d399', border: 'rgba(16,185,129,0.22)' },
}

// Short action prefix label per risk level (mirrors computeNextAction prefixes)
const FEED_ACTION = { CRITICAL: 'ESCALATE', HIGH: 'ALERT', MEDIUM: 'MONITOR', LOW: 'LOG' }

/* ─── Component ──────────────────────────────────────────────────────────── */

export default function Heatmap() {

  /* ── Live feed + WS state — managed by hook ── */
  const { liveFeed, feedHistory, totalEvents, autoScroll, setAutoScroll } = useLiveEventFeed()

  /* ── Existing state ── */
  // Start empty — fetchHeatmap() (called in useEffect below) populates these
  // via intelligenceProvider which auto-falls-back to mock data if Atlas is down.
  const [hotspots, setHotspots] = useState([])
  const [regions, setRegions] = useState([])
  const [narratives, setNarratives] = useState([])
  const [mapW, setMapW] = useState(0)
  const [mapH, setMapH] = useState(0)
  const [countries, setCountries] = useState({ features: [] })
  const [now, setNow] = useState(new Date())

  /* ── Feature 2: Time Intelligence ── */
  const [timeRange, setTimeRange] = useState('24h')
  const [isPlaying, setIsPlaying] = useState(false)

  /* ── Location search ── */
  const [locationQuery, setLocationQuery] = useState('')
  const [locationSearching, setLocationSearching] = useState(false)
  const [searchedLocation, setSearchedLocation] = useState(null) // { lat, lng, name }

  /* ── Feature 4: Viz mode ── */
  const [vizMode, setVizMode] = useState('risk')

  /* ── Feature 3: Multi-select categories ── */
  const [multiCats, setMultiCats] = useState(new Set())

  /* ── Feature 5: Hotspot Detection Panel ── */
  const [selectedHotspot, setSelectedHotspot] = useState(null)

  /* Feature 11 simulation state is managed by SimulationContext + useSimulation hook */
  /* Feature 10 feed state (feedHistory, autoScroll) comes from useLiveEventFeed above */

  /* ── Feature 9: Geolocation ── */
  const [userLocation, setUserLocation] = useState(null)
  const [locationError, setLocationError] = useState(null)

  const mapRef = useRef(null)
  const globeRef = useRef(null)
  const feedRef = useRef(null)

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
   * Uses intelligenceProvider.getIntelligenceSnapshot() which:
   *   1. Tries GET /api/v1/heatmap (Atlas mode)
   *   2. Falls back to mock data automatically on any failure
   *   3. Enriches every event with reality_score, risk_level, next_action
   *
   * The `mode` field in the response ('atlas' | 'mock') can be used to
   * show a data-source indicator in the UI (future enhancement).
   */
  const fetchHeatmap = useCallback(async () => {
    const snapshot = await getIntelligenceSnapshot()
    setHotspots(snapshot.events)
    setRegions(snapshot.regions)
    setNarratives(snapshot.narratives)
    // totalEvents is managed by useLiveEventFeed (WebSocket stream)
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
      () => setLocationError('Permission denied'),
    )
  }, [])

  /* ── Location search — geocodes a place name and flies the globe to it ── */
  const searchLocation = useCallback(async (query) => {
    const q = (query ?? locationQuery).trim()
    if (!q || !globeRef.current) return
    setLocationSearching(true)
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=1`)
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

  /* ── Region polygon click (Phase 4) ── */
  const [selectedRegionData, setSelectedRegionData] = useState(null)

  /* ── Helpers ─────────────────────────────────────────────────────────── */

  // Compute the centroid of a GeoJSON polygon feature.
  // Handles both Polygon and MultiPolygon types.
  function getFeatureCentroid(feature) {
    try {
      const coords = feature.geometry.type === 'MultiPolygon'
        ? feature.geometry.coordinates[0][0]
        : feature.geometry.coordinates[0]
      const lng = coords.reduce((s, p) => s + p[0], 0) / coords.length
      const lat = coords.reduce((s, p) => s + p[1], 0) / coords.length
      return { lat, lng }
    } catch (_) {
      return { lat: 0, lng: 0 }
    }
  }

  // Map a lat/lng centroid to a macro-region name matching our RegionStats data.
  function centroidToRegionName(lat, lng) {
    if (lat > 15  && lng > -170 && lng < -60)  return 'North America'
    if (lat < 15  && lat > -60  && lng > -90  && lng < -30) return 'South America'
    if (lat > 35  && lng > -15  && lng < 45)  return 'Europe'
    if (lat > 12  && lat < 42   && lng > 25   && lng < 65)  return 'Middle East'
    if (lat > -40 && lat < 40   && lng > -20  && lng < 55)  return 'Africa'
    return 'Asia Pacific'
  }

  /* ── Polygon click handler ── */
  const handlePolygonClick = useCallback((feature) => {
    const countryName = feature.properties?.ADMIN ?? feature.properties?.NAME ?? 'Unknown'
    const centroid    = getFeatureCentroid(feature)
    const regionName  = centroidToRegionName(centroid.lat, centroid.lng)
    const region      = regions.find(r => r.name === regionName) ?? null

    // Find hotspots within ~30° of the centroid (rough geographic cluster)
    const cluster = hotspots.filter(h => {
      if (h.lat == null || h.lng == null) return false
      return Math.hypot(h.lat - centroid.lat, h.lng - centroid.lng) < 30
    }).sort((a, b) => (a.reality_score ?? 50) - (b.reality_score ?? 50))

    // Pick nearest hotspot as the primary signal source
    const nearest = cluster.reduce((best, h) => {
      const d = Math.hypot(h.lat - centroid.lat, h.lng - centroid.lng)
      return d < best.d ? { h, d } : best
    }, { h: null, d: Infinity }).h

    setSelectedRegionData({ countryName, centroid, region, hotspotCluster: cluster, nearestHotspot: nearest })
    // Close the hotspot detail panel when switching to region view
    setSelectedHotspot(null)
  }, [regions, hotspots])

  /* ── Feature 5: Point click ── */
  const handlePointClick = useCallback((spot) => {
    setSelectedHotspot(spot)
    setSelectedRegionData(null) // close region panel when opening hotspot panel
  }, [])

  /* ── Feature 7: Ring speed for anomalies ── */
  const ringSpeed = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 4.5 : 2.5, [])
  const ringPeriod = useCallback((s) => s.isCoordinated || s.isSpikeAnomaly ? 500 : 900, [])

  /* ── Feature 4: Point radius scales with virality in risk mode ── */
  const pointRadius = useCallback((s) => {
    const base = s.severity === 'high' ? 0.55 : s.severity === 'medium' ? 0.4 : 0.28
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

  const maxSeverity = globeSpots.some(s => s.severity === 'high') ? 'HIGH'
    : globeSpots.some(s => s.severity === 'medium') ? 'MEDIUM' : 'LOW'
  const maxSevColor = maxSeverity === 'HIGH' ? '#ef4444' : maxSeverity === 'MEDIUM' ? '#f59e0b' : '#10b981'

  /* ── Global Reality Stability Score ───────────────────────────────────────
   * Weighted average of all region reality_scores (populated by intelligenceProvider).
   * Drives the top-bar gauge and the global risk level badge.
   */
  const globalStabilityScore = useMemo(() => {
    const scored = regions.filter(r => r.reality_score != null)
    if (!scored.length) return null
    return Math.round(scored.reduce((s, r) => s + r.reality_score, 0) / scored.length)
  }, [regions])

  const globalRiskLevel = useMemo(() => {
    if (globalStabilityScore == null) return maxSeverity
    if (globalStabilityScore < 40) return 'CRITICAL'
    if (globalStabilityScore < 60) return 'HIGH'
    if (globalStabilityScore < 80) return 'MEDIUM'
    return 'LOW'
  }, [globalStabilityScore, maxSeverity])

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
          globalStabilityScore={globalStabilityScore}
          globalRiskLevel={globalRiskLevel}
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

              <SearchBar
                locationQuery={locationQuery}
                setLocationQuery={setLocationQuery}
                searchLocation={searchLocation}
                locationSearching={locationSearching}
                searchedLocation={searchedLocation}
                setSearchedLocation={setSearchedLocation}
              />

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

                  /* Country polygon overlay — highlights selected country */
                  polygonsData={countries.features}
                  polygonCapColor={f => {
                    const name = f.properties?.ADMIN ?? f.properties?.NAME
                    return name === selectedRegionData?.countryName
                      ? 'rgba(59,130,246,0.22)'
                      : 'rgba(18,28,50,0.45)'
                  }}
                  polygonSideColor={() => 'rgba(0,0,0,0)'}
                  polygonStrokeColor={f => {
                    const name = f.properties?.ADMIN ?? f.properties?.NAME
                    return name === selectedRegionData?.countryName
                      ? 'rgba(99,130,246,0.5)'
                      : 'rgba(148,163,184,0.13)'
                  }}
                  polygonAltitude={f => {
                    const name = f.properties?.ADMIN ?? f.properties?.NAME
                    return name === selectedRegionData?.countryName ? 0.012 : 0.004
                  }}
                  onPolygonClick={handlePolygonClick}

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
                  ringColor={s => spotColor(s)}
                  ringMaxRadius={s => s.severity === 'high' ? 9 : s.severity === 'medium' ? 6 : 4}
                  ringPropagationSpeed={ringSpeed}
                  ringRepeatPeriod={ringPeriod}

                  pointsData={globeSpots}
                  pointColor={p => spotColor(p)}
                  pointAltitude={0.06}
                  pointRadius={pointRadius}
                  pointLabel={p => {
                    const c = spotColor(p)
                    const hasScore = p.reality_score != null
                    return `
                  <div style="background:rgba(4,7,15,0.97);border:1px solid ${c}88;border-radius:8px;padding:7px 11px;font-size:11px;white-space:nowrap;box-shadow:0 4px 20px ${c}40;max-width:240px;">
                    <div style="color:${c};font-weight:800;font-size:13px;margin-bottom:4px;display:flex;align-items:center;gap:6px;">
                      ${p.label}
                      ${p.isSpikeAnomaly ? '<span style="font-size:9px;background:rgba(239,68,68,0.2);color:#ef4444;padding:1px 5px;border-radius:3px;">↑ SPIKE</span>' : ''}
                      ${p.isCoordinated ? '<span style="font-size:9px;background:rgba(245,158,11,0.2);color:#f59e0b;padding:1px 5px;border-radius:3px;">⚡ COORD</span>' : ''}
                    </div>
                    ${hasScore ? `
                    <div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">
                      <div style="font-size:18px;font-weight:900;color:${c};line-height:1;">${p.reality_score}</div>
                      <div>
                        <div style="font-size:8px;color:#475569;text-transform:uppercase;letter-spacing:0.08em;">Reality Stability</div>
                        <span style="font-size:9px;font-weight:700;color:${c};background:${c}22;padding:1px 6px;border-radius:3px;">${p.risk_level}</span>
                      </div>
                    </div>` : ''}
                    <div style="color:#64748b;margin-bottom:3px;font-size:10px;">
                      ${p.displayCount.toLocaleString()} events · <b style="color:#94a3b8;">${p.severity}</b> · ${timeRange}
                    </div>
                    <div style="color:#334155;font-size:10px;">
                      Confidence: ${Math.round((p.confidence_score ?? 0) * 100)}% · Virality: ${(p.virality_score ?? 0).toFixed(1)}×
                    </div>
                    ${p.next_action ? `<div style="margin-top:5px;padding:3px 6px;border-left:2px solid ${c};font-size:9px;color:${c};line-height:1.4;white-space:normal;max-width:220px;">${p.next_action}</div>` : ''}
                  </div>`
                  }}

                  /* Feature 5: click → Hotspot Detection Panel */
                  onPointClick={handlePointClick}

                  onGlobeReady={() => {
                    if (!globeRef.current) return
                    const ctrl = globeRef.current.controls()
                    ctrl.enableZoom = true
                    ctrl.autoRotate = true
                    ctrl.autoRotateSpeed = 0.45
                    // Zoom range: altitude ~0.15 (street level) to 8 (full-earth view)
                    ctrl.minDistance = 103
                    ctrl.maxDistance = 800
                    globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2 })
                  }}
                />
              )}

              <GlobeLegend SEV={SEV} />

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

              {/* Region Intelligence overlay — shown on polygon click */}
              <RegionIntelPanel
                data={selectedRegionData}
                onClose={() => setSelectedRegionData(null)}
              />
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
              {feedHistory.map((entry, idx) => {
                const isNew  = idx === feedHistory.length - 1
                const risk   = entry.sev === 'critical' ? 'CRITICAL'
                             : entry.sev === 'high'     ? 'HIGH'
                             : entry.sev === 'low'      ? 'LOW'
                             : 'MEDIUM'
                const rCol   = RISK_COLOR[risk]
                const catSty = FEED_CAT_COLOR[entry.category] ?? {
                  bg: 'rgba(255,255,255,0.04)', color: '#64748b', border: 'rgba(255,255,255,0.08)',
                }
                return (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', gap: 7, flexShrink: 0,
                    padding: '3px 6px 3px 8px', borderRadius: 4,
                    borderLeft: `2px solid ${rCol}`,
                    background: isNew ? `${rCol}0d` : 'transparent',
                  }}>
                    {/* Timestamp */}
                    <span style={{ fontSize: 9, color: '#1e293b', fontFamily: 'monospace', flexShrink: 0, width: 52 }}>
                      {entry.time}
                    </span>
                    {/* Risk badge */}
                    <span style={{
                      fontSize: 8, padding: '1px 5px', borderRadius: 3, flexShrink: 0, fontWeight: 800,
                      background: `${rCol}18`, color: rCol, letterSpacing: '0.04em',
                    }}>
                      {risk}
                    </span>
                    {/* Action chip */}
                    <span style={{
                      fontSize: 7, padding: '1px 5px', borderRadius: 3, flexShrink: 0, fontWeight: 700,
                      background: 'rgba(255,255,255,0.04)', color: '#334155',
                      border: '1px solid rgba(255,255,255,0.07)', letterSpacing: '0.06em',
                    }}>
                      {FEED_ACTION[risk]}
                    </span>
                    {/* Message */}
                    <span style={{
                      fontSize: 10, color: '#64748b', flex: 1, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {entry.msg}
                    </span>
                    {/* City chip */}
                    {entry.city && entry.city !== '—' && (
                      <span style={{
                        fontSize: 9, color: '#475569', fontWeight: 600, flexShrink: 0,
                        padding: '1px 5px', borderRadius: 3, background: 'rgba(255,255,255,0.04)',
                      }}>
                        {entry.city}
                      </span>
                    )}
                    {/* Category pill */}
                    {entry.category && entry.category !== 'Unknown' && (
                      <span style={{
                        fontSize: 8, padding: '1px 6px', borderRadius: 3, flexShrink: 0, fontWeight: 600,
                        background: catSty.bg, color: catSty.color, border: `1px solid ${catSty.border}`,
                      }}>
                        {entry.category}
                      </span>
                    )}
                    {/* NEW flash on most-recent entry */}
                    {isNew && (
                      <span style={{
                        fontSize: 7, fontWeight: 800, color: '#3b82f6', flexShrink: 0,
                        animation: 'feedPulse 3s ease-out forwards', letterSpacing: '0.06em',
                      }}>
                        NEW
                      </span>
                    )}
                  </div>
                )
              })}
              {feedHistory.length === 0 && (
                <p style={{ fontSize: 10, color: '#1e293b', padding: '8px 0' }}>Connecting to event stream…</p>
              )}
              <style>{`
                @keyframes feedPulse {
                  0%   { opacity: 1; }
                  60%  { opacity: 1; }
                  100% { opacity: 0; }
                }
              `}</style>
            </div>
          </div>

        </div>{/* end main content */}
      </div>
    </SimulationProvider>
  )
}
