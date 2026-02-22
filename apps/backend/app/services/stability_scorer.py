"""
stability_scorer.py — Server-side Reality Stability scoring engine.

This is the Python equivalent of apps/frontend/src/lib/realityScoring.js.
Both files implement the same formula so that:
  - The backend can pre-score events before sending them to the frontend.
  - The frontend's intelligenceProvider fills in scores for any events the
    backend doesn't score (e.g. mock data, legacy seed events).
  - If the frontend re-runs the scoring on pre-scored events, the result
    is identical (the formula is deterministic and idempotent).

USAGE
─────
    from app.services.stability_scorer import assess_event, assess_region
    from app.models.heatmap import HeatmapEvent, RegionStats

    event = HeatmapEvent(label="New York", count=312, severity="high",
                         category="Health", confidence_score=0.87,
                         virality_score=1.4, is_coordinated=True)
    scored = assess_event(event)
    # scored.reality_score  → 28 (CRITICAL range)
    # scored.risk_level     → "CRITICAL"
    # scored.next_action    → "DEPLOY: Counter-narrative..."

TESTING
────────
    cd apps/backend
    pytest tests/test_stability_scorer.py -v
"""

from __future__ import annotations

from app.models.heatmap import HeatmapEvent, RegionStats

# ── Penalty weights (must stay in sync with realityScoring.js) ────────────────

_SEVERITY_PENALTY   = {"high": 22, "medium": 10, "low": 3}
_MAX_COUNT_PENALTY  = 20       # penalty at count ≥ 2500 events
_COUNT_SCALE        = 125.0    # count / COUNT_SCALE → raw penalty before capping
_CONFIDENCE_SCALE   = 18.0     # confidence_score (0–1) → max 18 pts
_VIRALITY_SCALE     = 8.0      # each unit above 1.0 → 8 pts penalty
_COORDINATED_PENALTY = 9
_SPIKE_PENALTY       = 7
_TREND_PENALTY       = {"up": 5, "down": -3, "same": 0}

# ── Risk level thresholds ─────────────────────────────────────────────────────

_RISK_THRESHOLDS = [
    (80, "LOW"),
    (60, "MEDIUM"),
    (40, "HIGH"),
    (0,  "CRITICAL"),
]


# ── Pure scoring functions ────────────────────────────────────────────────────

def compute_reality_score(event: HeatmapEvent) -> int:
    """
    Compute the Reality Stability Score for a single hotspot event.

    Returns an integer in [0, 100].
    Lower = more destabilised information ecosystem.
    Mirrors the JS function computeRealityScore() exactly.
    """
    severity         = event.severity or "low"
    count            = event.count or 0
    confidence_score = event.confidence_score if event.confidence_score is not None else 0.5
    virality_score   = event.virality_score   if event.virality_score   is not None else 1.0
    is_coordinated   = event.is_coordinated   if event.is_coordinated   is not None else False
    is_spike_anomaly = event.is_spike_anomaly if event.is_spike_anomaly is not None else False
    trend            = event.trend or "same"

    score = 100.0

    # 1. Severity
    score -= _SEVERITY_PENALTY.get(severity, _SEVERITY_PENALTY["low"])

    # 2. Volume (normalised, capped)
    score -= min(count / _COUNT_SCALE, _MAX_COUNT_PENALTY)

    # 3. Confidence that this IS misinformation
    score -= confidence_score * _CONFIDENCE_SCALE

    # 4. Virality above baseline (no bonus for below-baseline virality)
    score -= max(0.0, (virality_score - 1.0) * _VIRALITY_SCALE)

    # 5. Inauthentic coordination
    if is_coordinated:
        score -= _COORDINATED_PENALTY

    # 6. Spike anomaly
    if is_spike_anomaly:
        score -= _SPIKE_PENALTY

    # 7. Trend
    score -= _TREND_PENALTY.get(trend, 0)

    return max(0, min(100, round(score)))


def compute_risk_level(reality_score: int) -> str:
    """
    Map a reality score → categorical risk level.
    Returns one of: 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'.
    """
    for threshold, level in _RISK_THRESHOLDS:
        if reality_score >= threshold:
            return level
    return "CRITICAL"


def compute_virality_index(raw_virality: float) -> float:
    """
    Normalise a raw virality_score (1.x multiplier) to a 0–10 display index.
    Maps [0.5, 3.5] → [0, 10] linearly, clamped.
    """
    return min(10.0, max(0.0, ((raw_virality - 0.5) / 3.0) * 10.0))


def compute_next_action(event: HeatmapEvent, risk_level: str) -> str:
    """
    Return the recommended intervention string for a given event + risk level.
    Mirrors computeNextAction() in realityScoring.js.
    """
    is_coordinated   = event.is_coordinated   if event.is_coordinated   is not None else False
    is_spike_anomaly = event.is_spike_anomaly if event.is_spike_anomaly is not None else False
    category         = event.category or ""

    if risk_level == "CRITICAL":
        if is_coordinated:
            return "DEPLOY: Counter-narrative — coordinated inauthentic behaviour confirmed"
        if is_spike_anomaly:
            return "ESCALATE: Rapid-response team — anomalous spike exceeds 3\u03c3 threshold"
        return "ESCALATE: Immediate editorial review + platform notification required"

    if risk_level == "HIGH":
        if is_spike_anomaly:
            return "INVESTIGATE: Spike anomaly — alert regional fact-check partners"
        if is_coordinated:
            return "FLAG: Coordination signals — route to Trust & Safety team"
        return f"ALERT: Notify {category or 'sector'} rapid-response partners within 1 hour"

    if risk_level == "MEDIUM":
        return "MONITOR: Flag for editorial review within 4 hours"

    return "LOG: Continue passive monitoring — no immediate action required"


# ── Public entry points ───────────────────────────────────────────────────────

def assess_event(event: HeatmapEvent) -> HeatmapEvent:
    """
    Enrich a HeatmapEvent with intelligence scoring fields.

    Returns a new HeatmapEvent with reality_score, risk_level, and
    next_action populated. All other fields are preserved unchanged.

    This is called in routes/heatmap.py before the response is serialised,
    so the frontend receives pre-scored events. The frontend's
    intelligenceProvider will also score them (no-op since the formula is
    identical and deterministic).
    """
    score      = compute_reality_score(event)
    risk       = compute_risk_level(score)
    action     = compute_next_action(event, risk)

    return event.model_copy(update={
        "reality_score": float(score),
        "risk_level":    risk,
        "next_action":   action,
    })


def assess_region(region: RegionStats) -> RegionStats:
    """
    Derive intelligence scores for an aggregated RegionStats object.

    Uses the same synthetic-signal approach as assessRegion() in
    realityScoring.js: constructs a temporary HeatmapEvent from the
    region's aggregate stats and runs the scoring formula.
    """
    # Build a synthetic event to reuse the per-hotspot scoring formula
    synthetic = HeatmapEvent(
        label=region.name,
        count=region.events,
        severity=region.severity,
        category="General",
        confidence_score=0.6,
        virality_score=1.0 + max(0.0, region.delta / 100.0),
        is_coordinated=False,
        is_spike_anomaly=region.delta > 25,
        trend="up" if region.delta > 5 else ("down" if region.delta < -5 else "same"),
    )

    score  = compute_reality_score(synthetic)
    risk   = compute_risk_level(score)
    action = compute_next_action(synthetic, risk)

    return region.model_copy(update={
        "reality_score": float(score),
        "risk_level":    risk,
        "next_action":   action,
    })
