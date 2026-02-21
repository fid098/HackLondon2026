/**
 * Common API response wrappers and auth types.
 */

export interface ApiResponse<T> {
  data: T
  message?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
}

// ─── Auth (Phase 1) ───────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  created_at: string
}

export interface AuthTokens {
  access_token: string
  token_type: 'bearer'
}

export interface UserPreferences {
  user_id: string
  categories: MisinfoCategory[]
  notification_sensitivity: 'low' | 'medium' | 'high'
  email_alerts: boolean
}

export type MisinfoCategory =
  | 'health'
  | 'finance'
  | 'politics'
  | 'entertainment'
  | 'social'
  | 'science'
  | 'other'
