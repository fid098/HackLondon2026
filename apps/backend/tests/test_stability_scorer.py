"""
test_stability_scorer.py — Unit + integration tests for the Reality Stability
scoring engine (stability_scorer.py + realityScoring.js mirror).

Run:
    cd apps/backend
    pytest tests/test_stability_scorer.py -v
"""

import pytest

from app.models.heatmap import HeatmapEvent, RegionStats
from app.services.stability_scorer import (
    assess_event,
    assess_region,
    compute_next_action,
    compute_reality_score,
    compute_risk_level,
    compute_virality_index,
)


# ── compute_reality_score ────────────────────────────────────────────────────

class TestComputeRealityScore:

    def test_moscow_is_critical(self):
        """High-confidence coordinated spike (Moscow scenario) → CRITICAL."""
        event = HeatmapEvent(
            label="Moscow", count=389, severity="high", category="Politics",
            confidence_score=0.94, virality_score=2.1, trend="up",
            is_coordinated=True, is_spike_anomaly=True,
        )
        score = compute_reality_score(event)
        assert score < 40, f"Expected CRITICAL (<40), got {score}"

    def test_nairobi_is_low_risk(self):
        """Low-count, low-confidence, declining trend (Nairobi) → LOW."""
        event = HeatmapEvent(
            label="Nairobi", count=92, severity="low", category="Health",
            confidence_score=0.62, virality_score=0.8, trend="down",
            is_coordinated=False, is_spike_anomaly=False,
        )
        score = compute_reality_score(event)
        assert score >= 80, f"Expected LOW (>=80), got {score}"

    def test_score_clamps_to_0_100(self):
        """Extreme values must not produce a score outside [0, 100]."""
        extreme = HeatmapEvent(
            label="Extreme", count=99999, severity="high", category="General",
            confidence_score=1.0, virality_score=5.0, trend="up",
            is_coordinated=True, is_spike_anomaly=True,
        )
        score = compute_reality_score(extreme)
        assert 0 <= score <= 100

    def test_all_default_optional_fields(self):
        """Event with only required fields must still compute a valid score."""
        event = HeatmapEvent(label="Unknown", count=0, severity="low", category="General")
        score = compute_reality_score(event)
        assert 0 <= score <= 100

    def test_coordinated_flag_lowers_score(self):
        """is_coordinated=True must produce a lower score than False, all else equal."""
        base = dict(label="City", count=200, severity="medium", category="Health",
                    confidence_score=0.7, virality_score=1.2, trend="same",
                    is_spike_anomaly=False)
        with_coord    = compute_reality_score(HeatmapEvent(**base, is_coordinated=True))
        without_coord = compute_reality_score(HeatmapEvent(**base, is_coordinated=False))
        assert with_coord < without_coord

    def test_spike_anomaly_lowers_score(self):
        """is_spike_anomaly=True must produce a lower score than False."""
        base = dict(label="City", count=200, severity="medium", category="Health",
                    confidence_score=0.7, virality_score=1.2, trend="same",
                    is_coordinated=False)
        with_spike    = compute_reality_score(HeatmapEvent(**base, is_spike_anomaly=True))
        without_spike = compute_reality_score(HeatmapEvent(**base, is_spike_anomaly=False))
        assert with_spike < without_spike

    def test_upward_trend_lowers_score_vs_down(self):
        """trend='up' must produce a lower score than trend='down'."""
        base = dict(label="City", count=200, severity="medium", category="Health",
                    confidence_score=0.7, virality_score=1.2,
                    is_coordinated=False, is_spike_anomaly=False)
        up_score   = compute_reality_score(HeatmapEvent(**base, trend="up"))
        down_score = compute_reality_score(HeatmapEvent(**base, trend="down"))
        assert up_score < down_score


# ── compute_risk_level ───────────────────────────────────────────────────────

class TestComputeRiskLevel:

    @pytest.mark.parametrize("score,expected", [
        (100, "LOW"),
        (80,  "LOW"),
        (79,  "MEDIUM"),
        (60,  "MEDIUM"),
        (59,  "HIGH"),
        (40,  "HIGH"),
        (39,  "CRITICAL"),
        (0,   "CRITICAL"),
    ])
    def test_threshold_boundaries(self, score, expected):
        assert compute_risk_level(score) == expected


# ── compute_virality_index ───────────────────────────────────────────────────

class TestComputeViralityIndex:

    def test_min_clamp(self):
        """virality_score ≤ 0.5 → index = 0."""
        assert compute_virality_index(0.5) == 0.0
        assert compute_virality_index(0.0) == 0.0

    def test_max_clamp(self):
        """virality_score ≥ 3.5 → index = 10."""
        assert compute_virality_index(3.5) == 10.0
        assert compute_virality_index(9.9) == 10.0

    def test_midpoint(self):
        """virality_score = 2.0 → index = 5."""
        idx = compute_virality_index(2.0)
        assert abs(idx - 5.0) < 0.01

    def test_monotone_increasing(self):
        """Higher virality_score must produce a higher (or equal) index."""
        for v in [0.6, 1.0, 1.5, 2.0, 2.5, 3.0]:
            assert compute_virality_index(v) <= compute_virality_index(v + 0.4)


# ── compute_next_action ──────────────────────────────────────────────────────

class TestComputeNextAction:

    def test_critical_coordinated_deploy(self):
        event = HeatmapEvent(label="X", count=1, severity="high",
                             category="Politics", is_coordinated=True)
        assert compute_next_action(event, "CRITICAL").startswith("DEPLOY:")

    def test_critical_spike_escalate(self):
        event = HeatmapEvent(label="X", count=1, severity="high",
                             category="Health", is_spike_anomaly=True)
        assert compute_next_action(event, "CRITICAL").startswith("ESCALATE:")

    def test_critical_generic_escalate(self):
        event = HeatmapEvent(label="X", count=1, severity="high", category="Climate")
        assert compute_next_action(event, "CRITICAL").startswith("ESCALATE:")

    def test_high_spike_investigate(self):
        event = HeatmapEvent(label="X", count=1, severity="high",
                             category="Finance", is_spike_anomaly=True)
        assert compute_next_action(event, "HIGH").startswith("INVESTIGATE:")

    def test_high_coordinated_flag(self):
        event = HeatmapEvent(label="X", count=1, severity="high",
                             category="Science", is_coordinated=True)
        assert compute_next_action(event, "HIGH").startswith("FLAG:")

    def test_high_generic_alert(self):
        event = HeatmapEvent(label="X", count=1, severity="high", category="Conflict")
        assert compute_next_action(event, "HIGH").startswith("ALERT:")

    def test_medium_monitor(self):
        event = HeatmapEvent(label="X", count=1, severity="medium", category="Health")
        assert compute_next_action(event, "MEDIUM").startswith("MONITOR:")

    def test_low_log(self):
        event = HeatmapEvent(label="X", count=1, severity="low", category="Climate")
        assert compute_next_action(event, "LOW").startswith("LOG:")


# ── assess_event (integration) ───────────────────────────────────────────────

class TestAssessEvent:

    def test_returns_all_intelligence_fields(self):
        event = HeatmapEvent(
            label="London", count=245, severity="high", category="Health",
            confidence_score=0.91, virality_score=1.6,
            is_coordinated=True, is_spike_anomaly=True, trend="up",
        )
        result = assess_event(event)
        assert result.reality_score is not None
        assert result.risk_level in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}
        assert isinstance(result.next_action, str) and len(result.next_action) > 0

    def test_preserves_original_fields(self):
        event = HeatmapEvent(label="TestCity", count=50, severity="low",
                             category="Finance", cx=30.0, cy=40.0)
        result = assess_event(event)
        assert result.label    == "TestCity"
        assert result.cx       == 30.0
        assert result.cy       == 40.0
        assert result.count    == 50
        assert result.category == "Finance"

    def test_idempotent(self):
        """Calling assess_event twice on the same event gives the same score."""
        event = HeatmapEvent(label="City", count=200, severity="medium",
                             category="Politics", confidence_score=0.75,
                             virality_score=1.3, trend="up")
        r1 = assess_event(event)
        r2 = assess_event(event)
        assert r1.reality_score == r2.reality_score
        assert r1.risk_level    == r2.risk_level

    def test_london_is_critical(self):
        """London seed event (coordinated + spike + high conf) → CRITICAL."""
        event = HeatmapEvent(
            label="London", count=245, severity="high", category="Health",
            confidence_score=0.91, virality_score=1.6,
            is_coordinated=True, is_spike_anomaly=True, trend="up",
        )
        result = assess_event(event)
        assert result.risk_level == "CRITICAL"

    def test_berlin_is_medium_or_lower(self):
        """Berlin seed event (low virality, no coordination) → MEDIUM or LOW."""
        event = HeatmapEvent(
            label="Berlin", count=134, severity="medium", category="Climate",
            confidence_score=0.68, virality_score=0.9, trend="same",
            is_coordinated=False, is_spike_anomaly=False,
        )
        result = assess_event(event)
        assert result.risk_level in {"LOW", "MEDIUM"}


# ── assess_region (integration) ──────────────────────────────────────────────

class TestAssessRegion:

    def test_high_delta_region_is_high_or_critical(self):
        """Asia Pacific (delta=31) → HIGH or CRITICAL."""
        region = RegionStats(name="Asia Pacific", events=1204, delta=31, severity="high")
        result = assess_region(region)
        assert result.reality_score is not None
        assert result.risk_level in {"HIGH", "CRITICAL"}

    def test_negative_delta_improves_stability(self):
        """South America (delta=-4) should be more stable than a high-delta region."""
        stable   = assess_region(RegionStats(name="South America", events=391, delta=-4,  severity="medium"))
        unstable = assess_region(RegionStats(name="Test",          events=391, delta=35,  severity="high"))
        assert (stable.reality_score or 0) > (unstable.reality_score or 100)

    def test_preserves_name(self):
        region = RegionStats(name="Africa", events=278, delta=8, severity="low")
        result = assess_region(region)
        assert result.name == "Africa"

    def test_all_regions_get_scored(self):
        """All six seed regions should receive a valid risk_level."""
        seed_regions = [
            RegionStats(name="North America", events=847,  delta=12,  severity="high"),
            RegionStats(name="Europe",        events=623,  delta=5,   severity="medium"),
            RegionStats(name="Asia Pacific",  events=1204, delta=31,  severity="high"),
            RegionStats(name="South America", events=391,  delta=-4,  severity="medium"),
            RegionStats(name="Africa",        events=278,  delta=8,   severity="low"),
            RegionStats(name="Middle East",   events=512,  delta=19,  severity="high"),
        ]
        for r in seed_regions:
            result = assess_region(r)
            assert result.risk_level in {"LOW", "MEDIUM", "HIGH", "CRITICAL"}, \
                f"Region {r.name} got invalid risk_level: {result.risk_level}"
            assert 0 <= (result.reality_score or -1) <= 100, \
                f"Region {r.name} got out-of-range score: {result.reality_score}"
