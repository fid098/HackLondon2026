"""
test_triage.py — Tests for POST /api/v1/triage (Chrome Extension quick triage).

Runs in mock AI mode — no real API keys required.
"""

import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture()
async def triage_client():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


class TestQuickTriage:
    async def test_valid_text_returns_200(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "COVID-19 vaccines contain microchips installed by Bill Gates."},
        )
        assert r.status_code == 200

    async def test_response_has_required_fields(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "The Earth is flat and the government is hiding the truth."},
        )
        data = r.json()
        assert "verdict" in data
        assert "confidence" in data
        assert "summary" in data

    async def test_verdict_is_valid_enum(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "Scientists confirm that drinking bleach cures the flu."},
        )
        data = r.json()
        assert data["verdict"] in ("TRUE", "FALSE", "MISLEADING", "UNVERIFIED", "SATIRE")

    async def test_confidence_is_in_range(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "The stock market crashed because of alien intervention."},
        )
        data = r.json()
        assert 0 <= data["confidence"] <= 100

    async def test_summary_is_non_empty_string(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "Electric cars actually produce more carbon than petrol cars."},
        )
        data = r.json()
        assert isinstance(data["summary"], str)
        assert len(data["summary"]) > 0

    async def test_text_too_short_returns_422(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "Too short"},
        )
        assert r.status_code == 422

    async def test_missing_text_field_returns_422(self, triage_client):
        r = await triage_client.post("/api/v1/triage", json={})
        assert r.status_code == 422

    async def test_text_too_long_returns_422(self, triage_client):
        r = await triage_client.post(
            "/api/v1/triage",
            json={"text": "A" * 2001},
        )
        assert r.status_code == 422

    async def test_get_method_not_allowed(self, triage_client):
        r = await triage_client.get("/api/v1/triage")
        assert r.status_code == 405
