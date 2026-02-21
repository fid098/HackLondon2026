/**
 * Heatmap and geospatial event types (Phase 3).
 */

import type { VerdictType, MisinfoCategory } from './api'

export interface GeoPoint {
  type: 'Point'
  coordinates: [number, number] // [longitude, latitude]
}

export interface MisinfoEvent {
  id: string
  claim: string
  verdict: VerdictType
  category: MisinfoCategory
  confidence: number
  location: GeoPoint
  country_code?: string  // ISO 3166-1 alpha-2
  timestamp: string
  source_url?: string
  report_id?: string
}

export interface HeatmapPoint {
  lat: number
  lng: number
  intensity: number  // 0–1
  count: number
}

export interface RegionStats {
  country_code: string
  country_name: string
  event_count: number
  top_categories: Array<{ category: MisinfoCategory; count: number }>
  top_narratives: Array<{ claim: string; count: number; confidence: number }>
  updated_at: string
}

export interface HeatmapFilters {
  category?: MisinfoCategory
  verdict?: VerdictType
  date_from?: string
  date_to?: string
  country_code?: string
}
