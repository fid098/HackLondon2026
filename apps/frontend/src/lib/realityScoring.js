/**
 * realityScoring.js — Pure, framework-agnostic scoring functions.
 *
 * All functions are deterministic and side-effect free — suitable for
 * unit testing without any mocks. No React, no network, no globals.
 *
 * ─── Type Definitions ───────────────────────────────────────────────────────
 *
 * @typedef {Object} SignalEvent
 * @property {string}   label            - City / region label
 * @property {number}   count            - Raw event count in the observation window
 * @property {string}   severity         - 'high' | 'medium' | 'low'
 * @property {string}   category         - 'Health' | 'Politics' | 'Finance' | 'Science' | 'Conflict' | 'Climate' | 'General'
 * @property {number}   [confidence_score] - 0–1 model confidence that this IS misinformation
 * @property {number}   [virality_score]   - Spread multiplier (1.0 = baseline; >1.0 = spreading)
 * @property {boolean}  [isCoordinated]    - True when inauthentic amplification is detected
 * @property {boolean}  [isSpikeAnomaly]   - True when count exceeds rolling 7-day baseline by >3σ
 * @property {string}   [trend]            - 'up' | 'down' | 'same'
 * @property {number}   [lat]              - Latitude
 * @property {number}   [lng]              - Longitude
 *
 * @typedef {Object} RegionScore
 * @property {string}   name             - Continent / macro-region name
 * @property {number}   events           - Total events in the observation window
 * @property {number}   delta            - % change vs prior window (positive = increase)
 * @property {string}   severity         - Worst severity level in this region
 * @property {number}   reality_score    - 0–100 stability score (lower = more destabilised)
 * @property {string}   risk_level       - 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @property {string}   next_action      - Recommended intervention
 *
 * @typedef {Object} RiskAssessment
 * @property {number}   reality_score    - 0–100
 * @property {string}   risk_level       - 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'
 * @property {number}   virality_index   - Normalised 0–10 virality index (distinct from raw virality_score multiplier)
 * @property {string}   next_action      - Human-readable recommended action
 * @property {number}   confidence_score - 0–1 model confidence
 */

/* ─── Penalty weights ───────────────────────────────────────────────────────── */

const SEVERITY_PENALTY   = { high: 22, medium: 10, low: 3 }
const MAX_COUNT_PENALTY  = 20   // penalty at count ≥ 2500 events
const COUNT_SCALE        = 125  // count / COUNT_SCALE → raw penalty before capping
const CONFIDENCE_SCALE   = 18  // confidence_score (0–1) → max 18 pts
const VIRALITY_SCALE     = 8    // each unit above 1.0 → 8 pts penalty
const COORDINATED_PENALTY = 9
const SPIKE_PENALTY       = 7
const TREND_PENALTY       = { up: 5, down: -3, same: 0 }

/* ─── Risk level thresholds ─────────────────────────────────────────────────── */

const RISK_THRESHOLDS = [
  { min: 80, level: 'LOW' },
  { min: 60, level: 'MEDIUM' },
  { min: 40, level: 'HIGH' },
  { min: 0,  level: 'CRITICAL' },
]

/* ─── Exports ───────────────────────────────────────────────────────────────── */

/**
 * Compute the Reality Stability Score for a single signal event.
 *
 * A score of 100 means fully stable (no detected misinformation pressure).
 * A score of 0 means the information ecosystem is completely destabilised.
 *
 * The formula applies additive penalties on top of a 100-point baseline:
 *   − severity-based deduction    (high = worst)
 *   − count-based deduction       (normalised, capped at MAX_COUNT_PENALTY)
 *   − confidence_score deduction  (how certain the model is this IS misinfo)
 *   − virality_score deduction    (penalty only when virality > baseline of 1.0)
 *   − coordination penalty        (inauthentic amplification detected)
 *   − spike anomaly penalty       (count exceeds 3σ rolling baseline)
 *   − trend deduction / bonus     (up=worse, down=bonus, same=neutral)
 *
 * @param {SignalEvent} signal
 * @returns {number} Integer in [0, 100]
 */
export function computeRealityScore(signal) {
  const {
    severity        = 'low',
    count           = 0,
    confidence_score = 0.5,
    virality_score   = 1.0,
    isCoordinated   = false,
    isSpikeAnomaly  = false,
    trend           = 'same',
  } = signal

  let score = 100

  // 1. Severity
  score -= SEVERITY_PENALTY[severity] ?? SEVERITY_PENALTY.low

  // 2. Volume (normalised, capped)
  score -= Math.min(count / COUNT_SCALE, MAX_COUNT_PENALTY)

  // 3. Confidence that this IS misinformation
  score -= confidence_score * CONFIDENCE_SCALE

  // 4. Virality above baseline (no bonus for below-baseline virality)
  score -= Math.max(0, (virality_score - 1) * VIRALITY_SCALE)

  // 5. Inauthentic coordination
  if (isCoordinated) score -= COORDINATED_PENALTY

  // 6. Spike anomaly
  if (isSpikeAnomaly) score -= SPIKE_PENALTY

  // 7. Trend
  score -= TREND_PENALTY[trend] ?? 0

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Map a reality score to a categorical risk level.
 *
 * @param {number} realityScore - Output of computeRealityScore()
 * @returns {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'}
 */
export function computeRiskLevel(realityScore) {
  for (const { min, level } of RISK_THRESHOLDS) {
    if (realityScore >= min) return level
  }
  return 'CRITICAL'
}

/**
 * Normalise a raw virality_score (spread multiplier) to a 0–10 index.
 *
 * The raw score is a multiplier where 1.0 = baseline spread.
 * Values above ~3.5 are treated as maximum virality.
 *
 * @param {number} rawVirality - e.g. from SignalEvent.virality_score
 * @returns {number} Float in [0, 10]
 */
export function computeViralityIndex(rawVirality = 1.0) {
  // Map [0, 3.5] → [0, 10] linearly; clamp above 3.5
  return Math.min(10, Math.max(0, ((rawVirality - 0.5) / 3.0) * 10))
}

/**
 * Determine the recommended next action based on hotspot signals.
 *
 * @param {SignalEvent} signal
 * @param {'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'} riskLevel
 * @returns {string}
 */
export function computeNextAction(signal, riskLevel) {
  const { isCoordinated = false, isSpikeAnomaly = false, category = '' } = signal

  switch (riskLevel) {
    case 'CRITICAL':
      if (isCoordinated) return 'DEPLOY: Counter-narrative — coordinated inauthentic behaviour confirmed'
      if (isSpikeAnomaly) return 'ESCALATE: Rapid-response team — anomalous spike exceeds 3σ threshold'
      return 'ESCALATE: Immediate editorial review + platform notification required'

    case 'HIGH':
      if (isSpikeAnomaly) return 'INVESTIGATE: Spike anomaly — alert regional fact-check partners'
      if (isCoordinated) return 'FLAG: Coordination signals — route to Trust & Safety team'
      return `ALERT: Notify ${category || 'sector'} rapid-response partners within 1 hour`

    case 'MEDIUM':
      return 'MONITOR: Flag for editorial review within 4 hours'

    case 'LOW':
    default:
      return 'LOG: Continue passive monitoring — no immediate action required'
  }
}

/**
 * Compute a full RiskAssessment for a single SignalEvent.
 *
 * This is the primary entry point for enriching a hotspot with
 * intelligence scores. Combines all three individual functions.
 *
 * @param {SignalEvent} signal
 * @returns {RiskAssessment}
 */
export function assessSignal(signal) {
  const reality_score    = computeRealityScore(signal)
  const risk_level       = computeRiskLevel(reality_score)
  // virality_index is the normalised 0-10 UI value; the raw virality_score
  // multiplier (1.x) is preserved on the original signal and NOT overwritten.
  const virality_index   = computeViralityIndex(signal.virality_score ?? 1.0)
  const next_action      = computeNextAction(signal, risk_level)
  const confidence_score = signal.confidence_score ?? 0.5

  return { reality_score, risk_level, virality_index, next_action, confidence_score }
}

/**
 * Compute a RegionScore for a macro-region from its RegionStats.
 *
 * Used when we have aggregated region data (not individual hotspots).
 * The formula uses events, delta, and severity to derive stability.
 *
 * @param {{ name: string, events: number, delta: number, severity: string }} regionStats
 * @returns {RegionScore}
 */
export function assessRegion(regionStats) {
  const { name, events, delta, severity } = regionStats

  // Build a synthetic signal to reuse the per-hotspot scoring formula
  const syntheticSignal = {
    severity,
    count: events,
    confidence_score: 0.6,                // regions don't have a model confidence
    virality_score: 1.0 + Math.max(0, delta / 100), // positive delta = spreading
    isCoordinated: false,
    isSpikeAnomaly: delta > 25,           // >25% change = spike
    trend: delta > 5 ? 'up' : delta < -5 ? 'down' : 'same',
  }

  const reality_score = computeRealityScore(syntheticSignal)
  const risk_level    = computeRiskLevel(reality_score)
  const next_action   = computeNextAction(syntheticSignal, risk_level)

  return { name, events, delta, severity, reality_score, risk_level, next_action }
}
