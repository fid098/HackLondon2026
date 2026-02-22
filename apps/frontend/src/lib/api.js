/**
 * api.js — Thin HTTP client for the TruthGuard FastAPI backend.
 *
 * Token management:
 *   - Token is stored in localStorage under the key "tg_token".
 *   - Every authenticated request automatically includes the Bearer header.
 *   - Call setToken(null) / clearToken() on logout.
 *
 * Error handling:
 *   - All functions throw an Error with a human-readable message on failure.
 *   - HTTP 401 clears the stored token automatically.
 */

const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')
const TOKEN_KEY = 'tg_token'

/* ─── token helpers ──────────────────────────────────────────────────────────── */

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token)
  } else {
    localStorage.removeItem(TOKEN_KEY)
  }
}

export const clearToken = () => setToken(null)

/* ─── core request helper ───────────────────────────────────────────────────── */

async function request(method, path, body, requiresAuth = false) {
  const headers = { 'Content-Type': 'application/json', Accept: 'application/json' }

  const token = getToken()
  if (requiresAuth || token) {
    if (token) headers['Authorization'] = `Bearer ${token}`
  }

  const opts = { method, headers }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, opts)

  // Auto-clear stale token on 401
  if (res.status === 401) {
    clearToken()
  }

  if (!res.ok) {
    let message = `HTTP ${res.status}`
    try {
      const data = await res.json()
      message = data.detail ?? data.message ?? message
    } catch (_) { /* ignore parse errors */ }
    throw new Error(message)
  }

  return res.json()
}

const get   = (path, auth)       => request('GET',   path, undefined, auth)
const post  = (path, body, auth) => request('POST',  path, body,      auth)
const patch = (path, body, auth) => request('PATCH', path, body,      auth)

/* ─── health ─────────────────────────────────────────────────────────────────── */

/**
 * @returns {{ status: string, version: string, database: string }}
 */
export async function checkHealth() {
  return get('/health')
}

/* ─── auth ───────────────────────────────────────────────────────────────────── */

/**
 * Register a new account.
 * @param {{ email: string, password: string, display_name?: string }} payload
 * @returns {{ access_token: string, token_type: string, user: object }}
 */
export async function register(payload) {
  const data = await post('/auth/register', payload)
  setToken(data.access_token)
  return data
}

/**
 * Log in with email + password.
 * @param {{ email: string, password: string }} payload
 * @returns {{ access_token: string, token_type: string, user: object }}
 */
export async function login(payload) {
  const data = await post('/auth/login', payload)
  setToken(data.access_token)
  return data
}

/**
 * Fetch the current user's profile.
 * Requires a valid token in localStorage.
 * @returns {object} user profile
 */
export async function getMe() {
  return get('/auth/me', true)
}

/**
 * Log out — clears the local token. (No server call needed for stateless JWT.)
 */
export function logout() {
  clearToken()
}

/* ─── users / preferences ────────────────────────────────────────────────────── */

export async function getPreferences() {
  return get('/users/preferences', true)
}

export async function updatePreferences(prefs) {
  return patch('/users/preferences', prefs, true)
}

/* ─── fact-check ─────────────────────────────────────────────────────────────── */

/**
 * @param {{ type: 'url'|'text'|'media', content: string }} payload
 */
export async function submitClaim(payload) {
  return post('/api/v1/factcheck', payload, true)
}

/* ─── reports ─────────────────────────────────────────────────────────────────── */

export async function getReports({ page = 1, limit = 10, verdict, q } = {}) {
  const qs = new URLSearchParams({ page, limit })
  if (verdict && verdict !== 'ALL') qs.set('verdict', verdict)
  if (q) qs.set('q', q)
  return get(`/api/v1/reports?${qs}`, true)
}

export async function saveReport(reportData) {
  return post('/api/v1/reports', reportData, true)
}

/* ─── heatmap ─────────────────────────────────────────────────────────────────── */

/**
 * Fetch the combined heatmap snapshot (events + regions + narratives + total).
 * @param {{ category?: string, hours?: number }} opts
 * @returns {Promise<HeatmapResponse>}
 */
export async function getHeatmapEvents({ category, hours = 24 } = {}) {
  const qs = new URLSearchParams({ hours })
  if (category && category !== 'All') qs.set('category', category)
  return get(`/api/v1/heatmap?${qs}`)
}

/**
 * Open a WebSocket to the heatmap live-feed stream.
 * Each message is a JSON object: { type, message, delta, timestamp }
 *
 * @param {(msg: object) => void} onMessage  - called for each frame
 * @returns {WebSocket}
 */
export function openHeatmapStream(onMessage) {
  const wsUrl = BASE_URL.replace(/^http/, 'ws') + '/api/v1/heatmap/stream'
  const ws = new WebSocket(wsUrl)
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)) } catch (_) { /* ignore malformed frames */ }
  }
  return ws
}

/**
 * Fetch narrative spread arc pairs (same narrative_id appearing in ≥2 locations).
 * @param {{ hours?: number, category?: string }} opts
 * @returns {Promise<Array<{ startLat, startLng, endLat, endLng, category, strength }>>}
 *
 * API INTEGRATION — MongoDB aggregation (apps/backend/app/routes/heatmap.py):
 *   db.reports.aggregate([
 *     { $match: { timestamp: { $gte: cutoff }, narrative_id: { $exists: true } } },
 *     { $group: { _id: "$narrative_id",
 *         locations: { $addToSet: { lat: "$geo.lat", lng: "$geo.lng", city: "$geo.city" } },
 *         category: { $first: "$category" }, strength: { $sum: 1 } } },
 *     { $match: { "locations.1": { $exists: true } } },
 *     { $sort: { strength: -1 } }, { $limit: 40 }
 *   ])
 */
export async function getHeatmapArcs({ hours = 24, category } = {}) {
  const qs = new URLSearchParams({ hours })
  if (category && category !== 'All') qs.set('category', category)
  return get(`/api/v1/heatmap/arcs?${qs}`)
}

/**
 * Run a predictive spread simulation for a given hotspot / category.
 * @param {{ hotspot_label?: string, category?: string, time_horizon_hours?: number }} payload
 * @returns {Promise<{ projected_spread: Array<{lat,lng,projectedCount}>, confidence: number, model: string }>}
 *
 * API INTEGRATION — backend should use historical velocity + virality to project
 * spread into adjacent regions over time_horizon_hours.
 * Endpoint: POST /api/v1/heatmap/simulate
 */
export async function runSimulation(payload) {
  return post('/api/v1/heatmap/simulate', payload)
}

/* ─── deepfake detection ──────────────────────────────────────────────────────── */

/**
 * Analyse a base64-encoded image for deepfake manipulation.
 * @param {{ image_b64: string, filename?: string }} payload
 * @returns {Promise<{ is_deepfake: boolean, confidence: number, reasoning: string }>}
 */
export async function analyzeDeepfakeImage(payload) {
  return post('/api/v1/deepfake/image', payload)
}

/**
 * Analyse base64-encoded audio for synthetic speech / voice cloning.
 * @param {{ audio_b64: string, filename?: string }} payload
 * @returns {Promise<{ is_synthetic: boolean, confidence: number, reasoning: string }>}
 */
export async function analyzeDeepfakeAudio(payload) {
  return post('/api/v1/deepfake/audio', payload)
}

/**
 * Analyse base64-encoded video for deepfake manipulation.
 * @param {{ video_b64: string, filename?: string }} payload
 * @returns {Promise<{ is_deepfake: boolean, confidence: number, reasoning: string }>}
 */
export async function analyzeDeepfakeVideo(payload) {
  return post('/api/v1/deepfake/video', payload)
}

/* ─── YouTube AI-content detection ───────────────────────────────────────────── */

/**
 * Analyse a YouTube video URL for AI-generated content.
 * @param {{ url: string }} payload
 * @returns {Promise<YouTubeAnalysisResponse>}
 */
export async function analyzeYouTube(payload) {
  return post('/api/v1/youtube/analyze', payload)
}

/* ─── scam detection ──────────────────────────────────────────────────────────── */

/**
 * Analyse text for scam / phishing indicators (RoBERTa + XGBoost ensemble).
 * @param {{ text: string }} payload
 * @returns {Promise<{ is_scam: boolean, confidence: number, model_scores: {roberta, xgboost}, scam_type: string|null, reasoning: string }>}
 */
export async function checkScam(payload) {
  return post('/api/v1/scam/check', payload)
}

/**
 * Trigger a JSON download for a single saved report (browser save dialog).
 * @param {string} id — MongoDB report _id string
 */
export async function downloadReport(id) {
  const token = getToken()
  const headers = { Accept: 'application/json' }
  if (token) headers['Authorization'] = `Bearer ${token}`
  const res = await fetch(
    `${BASE_URL}/api/v1/reports/${encodeURIComponent(id)}/download?format=json`,
    { headers },
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `report-${id}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/**
 * Submit thumbs_up / thumbs_down feedback for any report.
 * @param {{ report_id: string, rating: 'thumbs_up'|'thumbs_down', notes?: string }} payload
 * @returns {Promise<{ ok: boolean, id: string }>}
 */
export async function submitFeedback(payload) {
  return post('/api/v1/feedback', payload)
}
