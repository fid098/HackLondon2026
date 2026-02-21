"""
test_factcheck.py — Tests for POST /api/v1/factcheck.

Uses FakeDB from test_auth.py to avoid a real MongoDB connection.
The debate pipeline and content extractor run in mock/offline mode.
"""

import pytest
from httpx import ASGITransport, AsyncClient
from unittest.mock import MagicMock


# ── Re-use the in-memory FakeDB from test_auth ────────────────────────────────

class FakeCollection:
    def __init__(self):
        self._docs = {}

    async def find_one(self, query):
        for doc in self._docs.values():
            if all(str(doc.get(k)) == str(v) if k == "_id" else doc.get(k) == v
                   for k, v in query.items()):
                return doc
        return None

    async def insert_one(self, doc):
        from bson import ObjectId
        oid = ObjectId()
        doc = {**doc, "_id": oid}
        self._docs[str(oid)] = doc
        result = MagicMock()
        result.inserted_id = oid
        return result

    async def count_documents(self, _query):
        return 0

    def find(self, _query=None):
        return self

    def sort(self, *_args):
        return self

    def skip(self, _n):
        return self

    def limit(self, _n):
        return self

    def __aiter__(self):
        return iter([]).__aiter__()


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
async def fc_client(fake_db):
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: fake_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Factcheck tests ───────────────────────────────────────────────────────────

class TestFactCheck:
    async def test_text_submission_returns_201(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "The Earth is flat and the moon is made of cheese."},
        )
        assert r.status_code == 201

    async def test_response_has_report_id_and_verdict(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "COVID-19 vaccines contain microchips."},
        )
        data = r.json()
        assert "report_id" in data
        assert "report" in data
        report = data["report"]
        assert report["verdict"] in ("TRUE", "FALSE", "MISLEADING", "UNVERIFIED", "SATIRE")
        assert 0 <= report["confidence"] <= 100

    async def test_response_includes_pro_and_con_points(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "Climate change is a hoax perpetrated by scientists."},
        )
        report = r.json()["report"]
        assert isinstance(report["pro_points"], list)
        assert isinstance(report["con_points"], list)

    async def test_response_has_debate_artifact(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "5G causes cancer."},
        )
        report = r.json()["report"]
        assert report["debate"] is not None
        assert "pro_argument" in report["debate"]
        assert "con_argument" in report["debate"]
        assert "judge_reasoning" in report["debate"]

    async def test_url_submission_accepted(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "url", "url": "https://example.com/article"},
        )
        assert r.status_code == 201

    async def test_missing_text_for_text_type_422(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text"},
        )
        assert r.status_code == 422

    async def test_missing_url_for_url_type_422(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "url"},
        )
        assert r.status_code == 422

    async def test_source_type_stored_in_report(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "The stock market will crash tomorrow."},
        )
        assert r.json()["report"]["source_type"] == "text"

    async def test_report_has_summary(self, fc_client):
        r = await fc_client.post(
            "/api/v1/factcheck",
            json={"source_type": "text", "text": "Eating chocolate cures cancer."},
        )
        summary = r.json()["report"]["summary"]
        assert isinstance(summary, str) and len(summary) > 10
