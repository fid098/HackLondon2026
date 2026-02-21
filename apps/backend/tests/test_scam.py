"""
test_scam.py — Tests for Phase 6 Scam Detection + Feedback endpoints.

Routes under test:
  POST /api/v1/scam/check  — scam / phishing classifier
  POST /api/v1/feedback    — user verdict feedback (requires DB)

Runs in mock AI mode — no real API keys required.
"""

from unittest.mock import MagicMock

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient


# ── FakeDB (same pattern as test_reports.py) ──────────────────────────────────

class FakeCollection:
    def __init__(self):
        self._docs = {}

    async def insert_one(self, doc):
        oid = ObjectId()
        doc = {**doc, "_id": oid}
        self._docs[str(oid)] = doc
        result = MagicMock()
        result.inserted_id = oid
        return result

    async def find_one(self, query):
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in query.items() if k != "_id"):
                return doc
        return None

    async def count_documents(self, _query):
        return len(self._docs)


class FakeDB:
    def __init__(self):
        self._cols = {}

    def __getitem__(self, name):
        if name not in self._cols:
            self._cols[name] = FakeCollection()
        return self._cols[name]


@pytest.fixture()
def fake_db():
    return FakeDB()


@pytest.fixture()
async def scam_client(fake_db):
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: fake_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Scam check ────────────────────────────────────────────────────────────────

class TestScamCheck:
    async def test_valid_text_returns_200(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "CONGRATULATIONS! You have won £1,000,000. Click here to claim your prize now!"},
        )
        assert r.status_code == 200

    async def test_response_has_required_fields(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "Your account has been suspended. Verify your identity immediately or lose access forever."},
        )
        data = r.json()
        assert "is_scam" in data
        assert "confidence" in data
        assert "model_scores" in data
        assert "reasoning" in data

    async def test_is_scam_is_bool(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "Send £500 now and receive £5000 in return from a Nigerian prince."},
        )
        assert isinstance(r.json()["is_scam"], bool)

    async def test_confidence_in_range(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "Your bank account details are required to process your refund."},
        )
        conf = r.json()["confidence"]
        assert isinstance(conf, float)
        assert 0.0 <= conf <= 1.0

    async def test_model_scores_present(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "URGENT: Click this link to verify your PayPal account or it will be closed."},
        )
        scores = r.json()["model_scores"]
        assert "roberta" in scores
        assert "xgboost" in scores

    async def test_model_scores_in_range(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "Claim your free iPhone 15 Pro — limited time offer, no purchase necessary!"},
        )
        scores = r.json()["model_scores"]
        assert 0.0 <= scores["roberta"] <= 1.0
        assert 0.0 <= scores["xgboost"] <= 1.0

    async def test_reasoning_is_non_empty_string(self, scam_client):
        r = await scam_client.post(
            "/api/v1/scam/check",
            json={"text": "We detected unusual activity on your account. Confirm your password now."},
        )
        reasoning = r.json()["reasoning"]
        assert isinstance(reasoning, str)
        assert len(reasoning) > 0

    async def test_text_too_short_returns_422(self, scam_client):
        r = await scam_client.post("/api/v1/scam/check", json={"text": "Too short"})
        assert r.status_code == 422

    async def test_missing_text_returns_422(self, scam_client):
        r = await scam_client.post("/api/v1/scam/check", json={})
        assert r.status_code == 422

    async def test_text_too_long_returns_422(self, scam_client):
        r = await scam_client.post("/api/v1/scam/check", json={"text": "A" * 2001})
        assert r.status_code == 422

    async def test_get_method_not_allowed(self, scam_client):
        r = await scam_client.get("/api/v1/scam/check")
        assert r.status_code == 405


# ── Feedback ──────────────────────────────────────────────────────────────────

class TestFeedback:
    async def test_thumbs_up_returns_201(self, scam_client):
        r = await scam_client.post(
            "/api/v1/feedback",
            json={"report_id": str(ObjectId()), "rating": "thumbs_up"},
        )
        assert r.status_code == 201

    async def test_thumbs_down_returns_201(self, scam_client):
        r = await scam_client.post(
            "/api/v1/feedback",
            json={"report_id": str(ObjectId()), "rating": "thumbs_down"},
        )
        assert r.status_code == 201

    async def test_response_has_ok_and_id(self, scam_client):
        r = await scam_client.post(
            "/api/v1/feedback",
            json={"report_id": str(ObjectId()), "rating": "thumbs_up"},
        )
        data = r.json()
        assert data["ok"] is True
        assert "id" in data
        assert len(data["id"]) == 24  # ObjectId hex string

    async def test_with_notes_field(self, scam_client):
        r = await scam_client.post(
            "/api/v1/feedback",
            json={
                "report_id": str(ObjectId()),
                "rating": "thumbs_up",
                "notes": "This verdict was accurate and well-reasoned.",
            },
        )
        assert r.status_code == 201

    async def test_invalid_rating_returns_422(self, scam_client):
        r = await scam_client.post(
            "/api/v1/feedback",
            json={"report_id": str(ObjectId()), "rating": "star_rating"},
        )
        assert r.status_code == 422

    async def test_missing_report_id_returns_422(self, scam_client):
        r = await scam_client.post("/api/v1/feedback", json={"rating": "thumbs_up"})
        assert r.status_code == 422

    async def test_missing_rating_returns_422(self, scam_client):
        r = await scam_client.post("/api/v1/feedback", json={"report_id": str(ObjectId())})
        assert r.status_code == 422
