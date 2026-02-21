/**
 * API client — central Axios instance for all backend communication.
 *
 * Why centralise: auth headers, error handling, base URL, and timeouts
 * are configured once here. All feature modules import from this file
 * rather than calling axios directly.
 *
 * VITE_API_URL is injected at build time from the .env file.
 * In Docker dev it defaults to http://localhost:8000.
 */

import axios from 'axios'

const API_BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30_000,  // 30s — longer for AI-heavy endpoints
  headers: {
    'Content-Type': 'application/json',
  },
})

// ─── Request interceptor: attach JWT if present ───────────────────────────────
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token')
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

// ─── Response interceptor: handle auth errors globally ────────────────────────
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Phase 1 will handle redirect to /login gracefully
      localStorage.removeItem('auth_token')
    }
    return Promise.reject(error)
  },
)

// ─── Typed API functions ───────────────────────────────────────────────────────

export interface HealthResponse {
  status: string
  version: string
  database: string
  environment: string
}

/**
 * Check API liveness. Used by the Home page status indicator.
 * Throws on any non-2xx response.
 */
export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await apiClient.get<HealthResponse>('/health')
  return data
}
