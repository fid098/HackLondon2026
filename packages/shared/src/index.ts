/**
 * @truthguard/shared — Shared TypeScript types and constants.
 *
 * Used by both the web app and the Chrome extension.
 * These mirror the Pydantic models in apps/api — keep them in sync.
 *
 * Future: use openapi-typescript to auto-generate from the API's OpenAPI spec.
 * For now, manual maintenance is fast enough for a hackathon.
 */

export * from './types/api'
export * from './types/reports'
export * from './types/heatmap'
export * from './types/deepfake'
