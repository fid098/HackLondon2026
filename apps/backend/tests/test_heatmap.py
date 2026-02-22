"""
test_heatmap.py — Tests for GET /api/v1/heatmap, GET /api/v1/heatmap/regions,
and the WebSocket stream.

Uses an in-memory FakeDB so no real MongoDB is needed.
"""

import pytest
from httpx import ASGITransport, AsyncClient


# ── Minimal FakeDB (reports collection only needs count_documents) ────────────

class FakeReportsCollection:
    async def count_documents(self, _query):
        return 0


class FakeDB:
    def __getitem__(self, name):
        return FakeReportsCollection()


@pytest.fixture()
def fake_db():
    return FakeDB()


@pytest.fixture()
async def hm_client(fake_db):
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: fake_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── REST tests ────────────────────────────────────────────────────────────────

class TestHeatmapSnapshot:
    async def test_get_heatmap_returns_200(self, hm_client):
        r = await hm_client.get("/api/v1/heatmap")
        assert r.status_code == 200

    async def test_response_has_required_keys(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap")).json()
        for key in ("events", "regions", "narratives", "total_events"):
            assert key in data

    async def test_events_list_not_empty(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap")).json()
        assert len(data["events"]) > 0

    async def test_event_has_required_fields(self, hm_client):
        event = (await hm_client.get("/api/v1/heatmap")).json()["events"][0]
        for field in ("cx", "cy", "label", "count", "severity", "category"):
            assert field in event

    async def test_regions_not_empty(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap")).json()
        assert len(data["regions"]) > 0

    async def test_region_has_required_fields(self, hm_client):
        region = (await hm_client.get("/api/v1/heatmap")).json()["regions"][0]
        for field in ("name", "events", "delta", "severity"):
            assert field in region

    async def test_total_events_positive_int(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap")).json()
        assert isinstance(data["total_events"], int)
        assert data["total_events"] > 0

    async def test_category_filter_health(self, hm_client):
        r = await hm_client.get("/api/v1/heatmap?category=Health")
        assert r.status_code == 200
        data = r.json()
        for event in data["events"]:
            assert event["category"] == "Health"
        for narrative in data["narratives"]:
            assert narrative["category"] == "Health"

    async def test_category_filter_reranks_narratives(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap?category=Politics")).json()
        ranks = [n["rank"] for n in data["narratives"]]
        assert ranks == list(range(1, len(ranks) + 1))

    async def test_invalid_hours_rejected(self, hm_client):
        r = await hm_client.get("/api/v1/heatmap?hours=0")
        assert r.status_code == 422

    async def test_hours_over_max_rejected(self, hm_client):
        r = await hm_client.get("/api/v1/heatmap?hours=9999")
        assert r.status_code == 422

    async def test_narratives_have_required_fields(self, hm_client):
        narrative = (await hm_client.get("/api/v1/heatmap")).json()["narratives"][0]
        for field in ("rank", "title", "category", "volume", "trend"):
            assert field in narrative


class TestHeatmapRegions:
    async def test_regions_endpoint_200(self, hm_client):
        r = await hm_client.get("/api/v1/heatmap/regions")
        assert r.status_code == 200

    async def test_regions_returns_list(self, hm_client):
        data = (await hm_client.get("/api/v1/heatmap/regions")).json()
        assert isinstance(data, list)
        assert len(data) > 0

    async def test_region_severity_values(self, hm_client):
        regions = (await hm_client.get("/api/v1/heatmap/regions")).json()
        valid = {"high", "medium", "low"}
        for r in regions:
            assert r["severity"] in valid


class TestHeatmapFlags:
    async def test_submit_flag_returns_201(self, hm_client):
        payload = {
            "source_url": "https://www.youtube.com/watch?v=test",
            "platform": "youtube",
            "category": "Deepfake",
            "reason": "user_suspected_ai_video",
            "confidence": 88,
            "location": {"lat": 51.5074, "lng": -0.1278},
        }
        r = await hm_client.post("/api/v1/heatmap/flags", json=payload)
        assert r.status_code == 201

        data = r.json()
        assert data["ok"] is True
        assert data["event"]["category"] == "Deepfake"
        assert data["event"]["severity"] == "high"
        assert data["event"]["label"] == "YouTube"

    async def test_submitted_flag_appears_in_heatmap_snapshot(self, hm_client):
        payload = {
            "source_url": "https://www.tiktok.com/@test/video/123",
            "platform": "tiktok",
            "category": "Deepfake",
            "reason": "user_suspected_ai_video",
        }
        await hm_client.post("/api/v1/heatmap/flags", json=payload)
        snapshot = (await hm_client.get("/api/v1/heatmap")).json()

        assert any(e["category"] == "Deepfake" for e in snapshot["events"])
