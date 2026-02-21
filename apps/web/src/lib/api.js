/**
 * api.js — Thin HTTP client for the TruthGuard FastAPI backend.
 *
 * Base URL is read from the Vite env var VITE_API_URL (defaults to
 * http://localhost:8000 for local dev).  All requests use the native
 * fetch API so there are no extra dependencies.
 *
 * Every public function returns a plain JS object on success and throws
 * an Error with a human-readable message on failure.
 */

const BASE_URL = (import.meta.env?.VITE_API_URL ?? 'http://localhost:8000').replace(/\/$/, '')

/* ─── helpers ─────────────────────────────────────────────────────────────── */

async function request(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  }
  if (body !== undefined) opts.body = JSON.stringify(body)

  const res = await fetch(`${BASE_URL}${path}`, opts)

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

const get  = (path)       => request('GET',  path)
const post = (path, body) => request('POST', path, body)

/* ─── health ─────────────────────────────────────────────────────────────── */

/**
 * Check backend availability.
 * @returns {{ status: string, version: string, database: string }}
 */
export async function checkHealth() {
  return get('/health')
}

/* ─── fact-check ─────────────────────────────────────────────────────────── */

/**
 * Submit a claim for analysis.
 *
 * @param {{ type: 'url'|'text'|'media', content: string, media_b64?: string, media_mime?: string }} payload
 * @returns {Promise<import('./types').AnalysisResult>}
 */
export async function submitClaim(payload) {
  return post('/api/v1/factcheck', payload)
}

/* ─── reports ─────────────────────────────────────────────────────────────── */

/**
 * Fetch paginated reports from the archive.
 * @param {{ page?: number, limit?: number, verdict?: string, q?: string }} params
 */
export async function getReports({ page = 1, limit = 10, verdict, q } = {}) {
  const qs = new URLSearchParams({ page, limit })
  if (verdict && verdict !== 'ALL') qs.set('verdict', verdict)
  if (q) qs.set('q', q)
  return get(`/api/v1/reports?${qs}`)
}

/**
 * Save a completed analysis result as a named report.
 * @param {object} reportData
 */
export async function saveReport(reportData) {
  return post('/api/v1/reports', reportData)
}

/* ─── heatmap ─────────────────────────────────────────────────────────────── */

/**
 * Fetch current heatmap events (snapshot).
 * @param {{ category?: string, hours?: number }} params
 */
export async function getHeatmapEvents({ category, hours = 24 } = {}) {
  const qs = new URLSearchParams({ hours })
  if (category && category !== 'All') qs.set('category', category)
  return get(`/api/v1/heatmap?${qs}`)
}
