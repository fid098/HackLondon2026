import sys

with open('src/pages/Heatmap.jsx', 'r') as f:
    content = f.read()

# 1. Add imports
content = content.replace(
    "import { getHeatmapEvents, openHeatmapStream } from '../lib/api'",
    "import { getHeatmapEvents, openHeatmapStream } from '../lib/api'\nimport Globe from 'react-globe.gl'"
)

# 2. Add Globe references and load GeoJSON
old_refs = """  // mapRef: ref to the map container div, used by the ResizeObserver
  const mapRef = useRef(null)
  // wsRef: ref to the open WebSocket, used for cleanup on unmount
  const wsRef  = useRef(null)
  // mapW: current pixel width of the map container (drives scale calculation)
  const [mapW, setMapW] = useState(800)"""

new_refs = """  // mapRef: ref to the map container div, used by the ResizeObserver
  const mapRef = useRef(null)
  const globeRef = useRef(null)
  // wsRef: ref to the open WebSocket, used for cleanup on unmount
  const wsRef  = useRef(null)
  // mapW: current pixel width of the map container (drives scale calculation)
  const [mapW, setMapW] = useState(800)
  const [countries, setCountries] = useState({ features: [] })

  useEffect(() => {
    fetch('https://raw.githubusercontent.com/vasturiano/react-globe.gl/master/example/datasets/ne_110m_admin_0_countries.geojson')
      .then((res) => res.json())
      .then(setCountries)
      .catch((err) => console.error('Error fetching countries:', err))
  }, [])"""

content = content.replace(old_refs, new_refs)

# 3. Add globeSpots calculation
old_visible_spots = """  const visibleSpots = hotspots.filter(
    (h) => category === 'All' || h.category === category,
  )"""

new_visible_spots = """  const visibleSpots = hotspots.filter(
    (h) => category === 'All' || h.category === category,
  )

  const globeSpots = visibleSpots.map((spot) => ({
    ...spot,
    lat: 90 - (spot.cy / 100) * 180,
    lng: (spot.cx / 100) * 360 - 180,
  }))"""

content = content.replace(old_visible_spots, new_visible_spots)

# 4. Replace the map div
import re
map_div_pattern = re.compile(r'\{\/\*\s*───\s*SVG World Map\s*───\s*\*\/\}.*?\{\/\*\s*───\s*Region stats cards', re.DOTALL)

globe_replacement = """{/* ─── 3D World Globe ─── */}
      <div
        ref={mapRef}
        className="rounded-2xl overflow-hidden mb-8 relative flex items-center justify-center cursor-move"
        style={{
          background: 'rgba(6,16,36,0.9)',
          border:     '1px solid rgba(59,130,246,0.15)',
          height:     mapH || 336,
        }}
      >
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden' }}>
          {mapW > 0 && (
            <Globe
              ref={globeRef}
              width={mapW}
              height={mapH || 336}
              globeImageUrl="//unpkg.com/three-globe/example/img/earth-dark.jpg"
              backgroundColor="rgba(0,0,0,0)"
              
              polygonsData={countries.features}
              polygonAltitude={0.005}
              polygonCapColor={() => 'rgba(59,130,246,0.05)'}
              polygonSideColor={() => 'rgba(59,130,246,0.01)'}
              polygonStrokeColor={() => 'rgba(59,130,246,0.2)'}
              polygonLabel={({ properties: d }) => `
                <div style="background: rgba(4,4,10,0.95); border: 1px solid rgba(59,130,246,0.4); border-radius: 8px; padding: 4px 8px; font-size: 10px; color: #f1f5f9;">
                  <b>${d.ADMIN} (${d.ISO_A2})</b>
                </div>
              `}
              
              ringsData={globeSpots}
              ringColor={(spot) => SEV[spot.severity].ring}
              ringMaxRadius={(spot) => spot.severity === 'high' ? 8 : spot.severity === 'medium' ? 5 : 3}
              ringPropagationSpeed={2}
              ringRepeatPeriod={1000}
              
              pointsData={globeSpots}
              pointColor={(spot) => SEV[spot.severity].ring}
              pointAltitude={0.02}
              pointRadius={(spot) => spot.severity === 'high' ? 0.4 : spot.severity === 'medium' ? 0.3 : 0.2}
              pointLabel={(spot) => `
                <div style="background: rgba(4,4,10,0.95); border: 1px solid ${SEV[spot.severity].ring}40; border-radius: 8px; padding: 4px 8px; font-size: 10px; color: #f1f5f9; white-space: nowrap;">
                  <span style="color: ${SEV[spot.severity].ring}; font-weight: 700;">${spot.label}</span><br />
                  ${spot.count.toLocaleString()} events
                </div>
              `}
              
              onGlobeReady={() => {
                if (globeRef.current) {
                  globeRef.current.pointOfView({ lat: 20, lng: 10, altitude: 2 });
                }
              }}
            />
          )}
        </div>

        {/* Legend (bottom-right corner) */}
        <div className="absolute bottom-3 right-3 flex flex-col gap-1.5 pointer-events-none">
          {Object.entries(SEV).map(([key, val]) => (
            <div key={key} className="flex items-center gap-1.5 text-xs text-slate-500">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: val.ring }} />
              {val.label}
            </div>
          ))}
        </div>
      </div>

      {/* ─── Region stats cards"""

content = map_div_pattern.sub(globe_replacement, content)

with open('src/pages/Heatmap.jsx', 'w') as f:
    f.write(content)

print("Updated Heatmap.jsx successfully")
