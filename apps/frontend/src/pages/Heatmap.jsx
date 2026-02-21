/**
 * Heatmap.jsx — Real-time misinformation geospatial dashboard.
 * FULL CORRECTED VERSION
 */
import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { getHeatmapEvents, openHeatmapStream } from '../lib/api'
import Globe from 'react-globe.gl'

/* ─── Constants ──────────────────────────────────────────────────────────── */
const CATEGORIES = ['All', 'Health', 'Politics', 'Finance', 'Science', 'Conflict', 'Climate']

const REGIONS = [
  { name: 'North America', events: 847, delta: +12, severity: 'high' },
  { name: 'Europe', events: 623, delta: +5, severity: 'medium' },
  { name: 'Asia Pacific', events: 1204, delta: +31, severity: 'high' },
  { name: 'South America', events: 391, delta: -4, severity: 'medium' },
  { name: 'Africa', events: 278, delta: +8, severity: 'low' },
  { name: 'Middle East', events: 512, delta: +19, severity: 'high' },
]

const HOTSPOTS = [
  { cx: 22, cy: 38, label: 'New York', count: 312, severity: 'high', category: 'Health' },
  { cx: 16, cy: 43, label: 'Los Angeles', count: 198, severity: 'medium', category: 'Politics' },
  { cx: 47, cy: 32, label: 'London', count: 245, severity: 'high', category: 'Health' },
  { cx: 49, cy: 30, label: 'Berlin', count: 134, severity: 'medium', category: 'Climate' },
  { cx: 53, cy: 33, label: 'Moscow', count: 389, severity: 'high', category: 'Politics' },
  { cx: 72, cy: 38, label: 'Beijing', count: 521, severity: 'high', category: 'Science' },
  { cx: 76, cy: 44, label: 'Tokyo', count: 287, severity: 'medium', category: 'Finance' },
  { cx: 70, cy: 50, label: 'Delhi', count: 403, severity: 'high', category: 'Health' },
  { cx: 28, cy: 60, label: 'São Paulo', count: 176, severity: 'medium', category: 'Politics' },
  { cx: 50, cy: 55, label: 'Cairo', count: 218, severity: 'medium', category: 'Conflict' },
  { cx: 54, cy: 62, label: 'Nairobi', count: 92, severity: 'low', category: 'Health' },
  { cx: 55, cy: 43, label: 'Tehran', count: 267, severity: 'high', category: 'Conflict' },
  { cx: 79, cy: 67, label: 'Jakarta', count: 145, severity: 'medium', category: 'Health' },
]

const NARRATIVES = [
  { rank: 1, title: 'Vaccine microchip conspiracy resurfaces ahead of flu season', category: 'Health', volume: 14200, trend: 'up' },
  { rank: 2, title: 'AI-generated election footage spreads across social platforms', category: 'Politics', volume: 11800, trend: 'up' },
  { rank: 3, title: 'Manipulated climate data graph shared by influencers', category: 'Climate', volume: 9400, trend: 'up' },
  { rank: 4, title: 'False banking collapse rumour triggers regional bank run', category: 'Finance', volume: 7600, trend: 'down' },
  { rank: 5, title: 'Doctored satellite images misidentify conflict zone locations', category: 'Conflict', volume: 6300, trend: 'up' },
]

const SEV = {
  high: { ring: '#ef4444', fill: 'rgba(239,68,68,0.5)', label: 'High', text: '#ef4444' },
  medium: { ring: '#f59e0b', fill: 'rgba(245,158,11,0.5)', label: 'Medium', text: '#f59e0b' },
  low: { ring: '#10b981', fill: 'rgba(16,185,129,0.5)', label: 'Low', text: '#10b981' },
}

const POLITICAL_COLORS = [
  'rgba(235, 200, 160, 0.7)', 'rgba(175, 210, 180, 0.7)', 'rgba(190, 215, 245, 0.7)',
  'rgba(245, 235, 170, 0.7)', 'rgba(215, 195, 235, 0.7)', 'rgba(240, 195, 190, 0.7)',
  'rgba(180, 225, 225, 0.7)', 'rgba(225, 245, 195, 0.7)',
]

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
    let ring = geom.type === 'Polygon' ? geom.coordinates[0] : 
               geom.coordinates.reduce((best, poly) => (poly[0].length > best.length ? poly[0] : best), geom.coordinates[0][0])
    const lats = ring.map(c => c[1]), lngs = ring.map(c => c[0])
    return { lat: (Math.min(...lats) + Math.max(...lats)) / 2, lng: (Math.min(...lngs) + Math.max(...lngs)) / 2 }
  } catch { return null }
}

/* ─── Sub-Components ─────────────────────────────────────────────────────── */
function RegionCard({ region }) {
  const sev = SEV[region.severity]
  const pct = Math.min(100, (region.events / 1300) * 100)
  return (
    <div className="rounded-xl p-5 bg-white/5 border border-white/10">
      <div className="flex items-start justify-between mb-3">
        <p className="text-white text-sm font-semibold">{region.name}</p>
        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${sev.ring}18`, color: sev.text, border: `1px solid ${sev.ring}40` }}>
          {sev.label}
        </span>
      </div>
      <p className="text-3xl font-black text-white mb-1">{region.events.toLocaleString()}</p>
      <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full transition-all duration-700" style={{ width: `${pct}%`, background: sev.ring }} />
      </div>
      <p className="text-xs mt-2" style={{ color: region.delta >= 0 ? '#ef4444' : '#10b981' }}>
        {region.delta >= 0 ? '↑' : '↓'} {Math.abs(region.delta)}% vs yesterday
      </p>
    </div>
  )
}

/* ─── Main Component ─────────────────────────────────────────────────────── */
export default function Heatmap() {
  const [category, setCategory] = useState('All')
  const [liveFeed, setLiveFeed] = useState('Initializing live stream...')
  const [totalEvents, setTotalEvents] = useState(55234)
  const [hotspots, setHotspots] = useState(HOTSPOTS)
  const [regions, setRegions] = useState(REGIONS)
  const [narratives, setNarratives] = useState(NARRATIVES)
  const [mapW, setMapW] = useState(0)
  const [countries, setCountries] = useState({ features: [] })
  
  const mapRef = useRef(null)
  const globeRef = useRef(null)

  // Load GeoJSON
  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then(res => res.json()).then(setCountries)
  }, [])

  // Responsive handling
  useEffect(() => {
    if (!mapRef.current) return
    const ro = new ResizeObserver(([e]) => setMapW(e.contentRect.width))
    ro.observe(mapRef.current)
    return () => ro.disconnect()
  }, [])

  // Correcting Coordinate Math: SVG Percent -> Globe Lat/Lng
  const globeSpots = useMemo(() => {
    return hotspots
      .filter(h => category === 'All' || h.category === category)
      .map(spot => ({
        ...spot,
        lat: 90 - (spot.cy * 1.8),  // Corrected: 0% is 90N, 100% is 90S
        lng: (spot.cx * 3.6) - 180 // Corrected: 0% is 180W, 100% is 180E
      }))
  }, [hotspots, category])

  const countryLabels = useMemo(() => {
    return countries.features.map(feat => {
      const c = computeCentroid(feat)
      return c ? { lat: c.lat, lng: c.lng, name: feat.properties?.ADMIN || '' } : null
    }).filter(Boolean)
  }, [countries])

  // WebSocket / Live Stream
  useEffect(() => {
    let ws;
    try {
      ws = openHeatmapStream((msg) => {
        if (msg.message) setLiveFeed(msg.message)
        if (msg.delta) setTotalEvents(prev => prev + msg.delta)
      })
    } catch {
      setLiveFeed("Streaming from local mock...")
    }
    return () => ws?.close()
  }, [])

  return (
    <div className="relative max-w-7xl mx-auto px-5 py-14 min-h-screen bg-slate-950 text-slate-200">
      
      {/* Header */}
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-white mb-1">Misinformation Heatmap</h1>
          <p className="text-slate-500 text-sm">Real-time geospatial tracking via MongoDB Change Streams</p>
        </div>
        <div className="px-5 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
          <p className="text-2xl font-black text-white">{totalEvents.toLocaleString()}</p>
          <p className="text-xs text-blue-400">events tracked</p>
        </div>
      </div>

      {/* Ticker */}
      <div className="flex items-center gap-3 rounded-xl px-5 py-3 mb-8 bg-white/5 border border-white/10">
        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">LIVE</span>
        <p key={liveFeed} className="text-sm text-slate-400 animate-pulse">{liveFeed}</p>
      </div>

      {/* Globe Container */}
      <div ref={mapRef} className="rounded-2xl overflow-hidden mb-8 relative border-2 border-blue-500/30 bg-black" style={{ height: '500px' }}>
        {mapW > 0 && (
          <Globe
            ref={globeRef}
            width={mapW}
            height={500}
            backgroundColor="rgba(0,0,0,0)"
            globeImageUrl="//unpkg.com/three-globe/example/img/earth-night.jpg"
            atmosphereColor="#3b82f6"
            atmosphereAltitude={0.15}
            
            polygonsData={countries.features}
            polygonCapColor={getCountryColor}
            polygonSideColor={() => 'rgba(0,0,0,0.2)'}
            polygonStrokeColor={() => 'rgba(255,255,255,0.1)'}
            polygonAltitude={0.005}

            labelsData={countryLabels}
            labelLat={d => d.lat}
            labelLng={d => d.lng}
            labelText={d => d.name}
            labelSize={0.6}
            labelColor={() => 'rgba(255,255,255,0.4)'}
            labelAltitude={0.01}

            ringsData={globeSpots}
            ringColor={s => SEV[s.severity].ring}
            ringMaxRadius={s => s.severity === 'high' ? 8 : 4}
            
            pointsData={globeSpots}
            pointColor={s => SEV[s.severity].ring}
            pointAltitude={0.06} 
            pointRadius={0.5}
            pointLabel={s => `<div class="p-2 bg-white text-black rounded shadow-lg text-xs font-bold">${s.label}: ${s.count} events</div>`}

            onGlobeReady={() => {
              if (globeRef.current) {
                globeRef.current.controls().autoRotate = true
                globeRef.current.controls().autoRotateSpeed = 0.5
                globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2 })
              }
            }}
          />
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-10">
        {regions.map(r => <RegionCard key={r.name} region={r} />)}
      </div>

      {/* Narrative Table */}
      <div className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-xl font-bold">Trending Narratives</h2>
          <div className="flex gap-2">
            {CATEGORIES.map(c => (
              <button key={c} onClick={() => setCategory(c)} className={`text-xs px-3 py-1 rounded-full border transition ${category === c ? 'bg-blue-500/20 border-blue-500/50 text-blue-400' : 'border-white/10 text-slate-500 hover:border-white/30'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>
        {narratives.filter(n => category === 'All' || n.category === category).map(n => (
          <div key={n.rank} className="grid grid-cols-[30px_1fr_100px] gap-4 p-4 border-b border-white/5 items-center hover:bg-white/5">
            <span className="text-slate-600 font-mono">{n.rank}</span>
            <span className="text-sm">{n.title}</span>
            <span className="text-right font-bold text-blue-400">{(n.volume / 1000).toFixed(1)}k</span>
          </div>
        ))}
      </div>
    </div>
  )
}