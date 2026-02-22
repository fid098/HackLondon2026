/**
 * intelligenceProvider.js — Unified Intelligence Data Provider.
 *
 * ─── Mode Selection ──────────────────────────────────────────────────────────
 *
 * The provider operates in one of two modes:
 *
 *   ATLAS mode  → fetches live data from the FastAPI backend, which in turn
 *                 queries MongoDB Atlas. All enrichment (scoring) happens
 *                 client-side after the raw payload arrives.
 *
 *   MOCK  mode  → falls back to the local HOTSPOTS / REGIONS / NARRATIVES
 *                 constants from mockData.js. Identical shape, identical
 *                 scoring pipeline — zero UI changes required to switch.
 *
 * Mode is determined at call time:
 *   1. If the API call succeeds         → ATLAS mode (preferred)
 *   2. If the API call throws           → MOCK mode  (automatic fallback)
 *   3. Pass { forceMock: true }         → MOCK mode  (explicit override)
 *   4. Set VITE_INTELLIGENCE_MOCK=true  → MOCK mode  (env-level override)
 *
 * ─── Returned shape (IntelligenceSnapshot) ──────────────────────────────────
 *
 * @typedef {import('./realityScoring').SignalEvent}   SignalEvent
 * @typedef {import('./realityScoring').RegionScore}   RegionScore
 * @typedef {import('./realityScoring').RiskAssessment} RiskAssessment
 *
 * @typedef {Object} EnrichedSignal
 * All fields from SignalEvent, plus:
 * @property {number} reality_score    - 0–100 stability score (lower = worse)
 * @property {string} risk_level       - 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @property {number} virality_score   - Raw spread multiplier (preserved from input; used by getDisplayCount)
 * @property {number} virality_index   - Normalised 0–10 virality index (for UI display)
 * @property {string} next_action      - Recommended intervention string
 * @property {number} confidence_score - 0–1 model confidence
 *
 * @typedef {Object} IntelligenceSnapshot
 * @property {EnrichedSignal[]} events       - Enriched hotspot events
 * @property {RegionScore[]}    regions      - Enriched region stats
 * @property {object[]}         narratives   - Trending narrative items (unchanged shape)
 * @property {number}           total_events - Global event counter
 * @property {'atlas'|'mock'}   mode         - Which data source was used
 * @property {number}           computed_at  - Unix timestamp (ms) of enrichment
 */

import { getHeatmapEvents, openHeatmapStream } from './api'
import { HOTSPOTS, REGIONS, NARRATIVES } from '../data/mockData'
import { assessSignal, assessRegion } from './realityScoring'

/* ─── Env config ─────────────────────────────────────────────────────────── */

// Set VITE_INTELLIGENCE_MOCK=true in .env.local to always use mock data.
const ENV_FORCE_MOCK = import.meta.env?.VITE_INTELLIGENCE_MOCK === 'true'

/* ─── Coordinate helpers ─────────────────────────────────────────────────── */

/**
 * Convert SVG percentage coordinates (cx, cy) to real lat/lng.
 * Backend HeatmapEvent currently stores cx/cy (0–100%).
 * This converts them to geographic coordinates for the globe.
 *
 * cx=0 → lng=-180, cx=100 → lng=+180
 * cy=0 → lat=+90,  cy=100 → lat=-90
 *
 * @param {number} cx - 0–100
 * @param {number} cy - 0–100
 * @returns {{ lat: number, lng: number }}
 */
function svgCoordsToLatLng(cx, cy) {
  return {
    lat: 90  - (cy / 100) * 180,
    lng: (cx / 100) * 360 - 180,
  }
}

/* ─── Enrichment ─────────────────────────────────────────────────────────── */

/**
 * Enrich a raw API event with intelligence scores.
 * Handles both native lat/lng events (future Atlas schema) and
 * legacy cx/cy SVG events (current backend seed data).
 *
 * @param {object} raw - Raw event from backend or mockData
 * @returns {EnrichedSignal}
 */
function enrichEvent(raw) {
  // Resolve coordinates: prefer explicit lat/lng, fall back to cx/cy conversion
  let lat = raw.lat
  let lng = raw.lng
  if ((lat == null || lng == null) && raw.cx != null && raw.cy != null) {
    const coords = svgCoordsToLatLng(raw.cx, raw.cy)
    lat = lat ?? coords.lat
    lng = lng ?? coords.lng
  }

  // Build a SignalEvent with all scoring inputs
  const signal = {
    label:            raw.label ?? raw.city ?? 'Unknown',
    count:            raw.count ?? 0,
    severity:         raw.severity ?? 'low',
    category:         raw.category ?? 'General',
    confidence_score: raw.confidence_score ?? 0.5,
    virality_score:   raw.virality_score   ?? 1.0,
    isCoordinated:    raw.isCoordinated    ?? false,
    isSpikeAnomaly:   raw.isSpikeAnomaly   ?? false,
    trend:            raw.trend            ?? 'same',
    lat,
    lng,
  }

  const assessment = assessSignal(signal)

  return {
    // Original fields (preserved for any existing consumer)
    // NOTE: virality_score from `raw` is the raw spread multiplier (1.x) used
    //       by getDisplayCount(). We do NOT overwrite it. Instead we add
    //       virality_index (0-10 normalised) as a separate field for the UI.
    ...raw,
    // Resolved coordinates
    lat,
    lng,
    // Intelligence scores
    reality_score:    assessment.reality_score,
    risk_level:       assessment.risk_level,
    virality_index:   assessment.virality_index,   // 0-10 UI display value
    next_action:      assessment.next_action,
    confidence_score: assessment.confidence_score, // may differ from raw (filled in if missing)
  }
}

/**
 * Enrich a raw region stats object with intelligence scores.
 *
 * @param {object} raw - Raw region from backend or mockData
 * @returns {RegionScore}
 */
function enrichRegion(raw) {
  const scored = assessRegion(raw)
  return { ...raw, ...scored }
}

/* ─── Public API ─────────────────────────────────────────────────────────── */

/**
 * Fetch and enrich a complete intelligence snapshot.
 *
 * Attempts to fetch live data from the backend; falls back to mock data
 * on any failure. Scoring is applied identically in both paths.
 *
 * @param {object}  [opts]
 * @param {string}  [opts.category]   - Category filter (e.g. 'Health')
 * @param {number}  [opts.hours=24]   - Lookback window in hours
 * @param {boolean} [opts.forceMock]  - Force mock mode regardless of API health
 * @returns {Promise<IntelligenceSnapshot>}
 */
export async function getIntelligenceSnapshot({ category, hours = 24, forceMock = false } = {}) {
  const useMock = forceMock || ENV_FORCE_MOCK

  let rawEvents    = null
  let rawRegions   = null
  let rawNarratives = null
  let rawTotal     = 0
  let mode         = 'atlas'

  if (!useMock) {
    try {
      const data = await getHeatmapEvents({ category, hours })
      if (data?.events?.length > 0) {
        rawEvents     = data.events
        rawRegions    = data.regions    ?? REGIONS
        rawNarratives = data.narratives ?? NARRATIVES
        rawTotal      = data.total_events ?? 0
      } else {
        throw new Error('Empty or invalid API response')
      }
    } catch (_) {
      mode = 'mock'
    }
  } else {
    mode = 'mock'
  }

  // Mock path
  if (mode === 'mock') {
    rawEvents     = HOTSPOTS
    rawRegions    = REGIONS
    rawNarratives = NARRATIVES
    rawTotal      = REGIONS.reduce((s, r) => s + r.events, 0)

    // Apply category filter to mock data (mirrors backend filter logic)
    if (category && category !== 'All') {
      rawEvents     = rawEvents.filter(e => e.category === category)
      rawNarratives = rawNarratives.filter(n => n.category === category)
        .map((n, i) => ({ ...n, rank: i + 1 }))
    }
  }

  // Enrich with intelligence scores
  const events    = rawEvents.map(enrichEvent)
  const regions   = rawRegions.map(enrichRegion)
  const narratives = rawNarratives  // narratives get no scoring changes in Phase 1

  return {
    events,
    regions,
    narratives,
    total_events: rawTotal,
    mode,
    computed_at: Date.now(),
  }
}

/**
 * Open a live-feed stream for real-time intelligence updates.
 *
 * In ATLAS mode: connects to the backend WebSocket.
 * In MOCK  mode: returns a synthetic interval-based emitter that
 *               implements the same { close() } interface as WebSocket,
 *               so callers never need to branch on mode.
 *
 * @param {(msg: object) => void} onMessage - Called with each parsed frame
 * @param {object}  [opts]
 * @param {boolean} [opts.forceMock] - Force mock stream
 * @returns {{ close: () => void }}  — Call close() to stop the stream
 */
export function openIntelStream(onMessage, { forceMock = false } = {}) {
  if (ENV_FORCE_MOCK || forceMock) {
    return _openMockStream(onMessage)
  }

  try {
    const ws = openHeatmapStream(onMessage)

    // Track the mock fallback stream so we can close it if the WS errors
    let mockStream = null
    ws.onerror = () => {
      ws.close()
      mockStream = _openMockStream(onMessage)
    }

    return {
      close() {
        ws.close()
        mockStream?.close()
      },
    }
  } catch (_) {
    return _openMockStream(onMessage)
  }
}

/* ─── Mock stream internals ──────────────────────────────────────────────── */

const MOCK_FEED_ITEMS = [
  { city: 'New York',      category: 'Health',    delta: 4, severity: 'high'   },
  { city: 'Moscow',        category: 'Politics',  delta: 7, severity: 'high'   },
  { city: 'London',        category: 'Health',    delta: 3, severity: 'high'   },
  { city: 'Beijing',       category: 'Science',   delta: 6, severity: 'high'   },
  { city: 'Tokyo',         category: 'Finance',   delta: 2, severity: 'medium' },
  { city: 'Delhi',         category: 'Health',    delta: 5, severity: 'high'   },
  { city: 'Cairo',         category: 'Conflict',  delta: 3, severity: 'medium' },
  { city: 'São Paulo',     category: 'Politics',  delta: 2, severity: 'medium' },
  { city: 'Berlin',        category: 'Climate',   delta: 1, severity: 'medium' },
  { city: 'Tehran',        category: 'Conflict',  delta: 4, severity: 'high'   },
]

const MOCK_VERBS = ['New event detected', 'Spike alert', 'Cluster identified', 'Narrative variant', 'Agent verdict: FALSE', 'Trending narrative']

function _openMockStream(onMessage) {
  let idx = 0
  const id = setInterval(() => {
    const item = MOCK_FEED_ITEMS[idx % MOCK_FEED_ITEMS.length]
    const verb = MOCK_VERBS[Math.floor(Math.random() * MOCK_VERBS.length)]
    onMessage({
      type:      'event',
      message:   `${verb} · ${item.category} · ${item.city}`,
      delta:     item.delta,
      timestamp: new Date().toISOString(),
      severity:  item.severity,
    })
    idx++
  }, 3000)

  return { close: () => clearInterval(id) }
}
