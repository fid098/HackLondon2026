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

export async function getHeatmapEvents({ category, hours = 24 } = {}) {
  const qs = new URLSearchParams({ hours })
  if (category && category !== 'All') qs.set('category', category)
  return get(`/api/v1/heatmap?${qs}`)
}
