"""
test_reports.py — Tests for /api/v1/reports CRUD routes.
"""

from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient


# ── Shared FakeDB (same pattern as other test files) ─────────────────────────

class FakeCollection:
    def __init__(self):
        self._docs = {}

    async def find_one(self, query):
        oid_val = query.get("_id")
        if oid_val:
            doc = self._docs.get(str(oid_val))
            return doc
        for doc in self._docs.values():
            if all(doc.get(k) == v for k, v in query.items() if k != "_id"):
                return doc
        return None

    async def insert_one(self, doc):
        oid = ObjectId()
        doc = {**doc, "_id": oid}
        self._docs[str(oid)] = doc
        result = MagicMock()
        result.inserted_id = oid
        return result

    async def update_one(self, query, update):
        pass

    async def count_documents(self, query):
        return sum(1 for d in self._docs.values() if self._matches(d, query))

    def find(self, query=None):
        self._query = query or {}
        self._sorted_docs = list(self._docs.values())
        return self

    def sort(self, *_args):
        return self

    def skip(self, n):
        self._skip_n = n
        return self

    def limit(self, n):
        self._limit_n = n
        return self

    async def __aiter__(self):
        docs = [d for d in self._sorted_docs if self._matches(d, self._query)]
        skip = getattr(self, "_skip_n", 0)
        limit = getattr(self, "_limit_n", len(docs))
        for doc in docs[skip: skip + limit]:
            yield doc

    @staticmethod
    def _matches(doc, query):
        for k, v in query.items():
            if k == "$or":
                if not any(
                    all(doc.get(sub_k) == sub_v for sub_k, sub_v in cond.items())
                    for cond in v
                ):
                    return False
            elif doc.get(k) != v:
                return False
        return True


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
async def reports_client(fake_db):
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: fake_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


SAMPLE_REPORT = {
    "source_type": "text",
    "source_ref": "The moon is made of cheese",
    "verdict": "FALSE",
    "confidence": 99,
    "summary": "There is overwhelming scientific consensus that the moon is composed of rock.",
    "pro_points": ["Some myths mention cheese"],
    "con_points": ["NASA and ESA confirm it's rock", "Lunar samples collected in 1969"],
    "sources": [{"title": "NASA Apollo Samples", "url": "https://nasa.gov/apollo"}],
    "category": "Science",
}


class TestReportsSave:
    async def test_save_report_returns_201(self, reports_client):
        r = await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)
        assert r.status_code == 201

    async def test_save_report_returns_id(self, reports_client):
        data = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        assert "id" in data
        assert len(data["id"]) == 24  # ObjectId hex string

    async def test_saved_report_verdict_preserved(self, reports_client):
        data = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        assert data["verdict"] == "FALSE"

    async def test_saved_report_has_created_at(self, reports_client):
        data = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        assert "created_at" in data


class TestReportsGet:
    async def test_get_report_by_id(self, reports_client):
        saved = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        report_id = saved["id"]
        r = await reports_client.get(f"/api/v1/reports/{report_id}")
        assert r.status_code == 200
        assert r.json()["id"] == report_id

    async def test_get_nonexistent_report_404(self, reports_client):
        fake_id = str(ObjectId())
        r = await reports_client.get(f"/api/v1/reports/{fake_id}")
        assert r.status_code == 404

    async def test_get_invalid_id_422(self, reports_client):
        r = await reports_client.get("/api/v1/reports/not-an-objectid")
        assert r.status_code == 422

    async def test_get_report_fields_complete(self, reports_client):
        saved = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        r = await reports_client.get(f"/api/v1/reports/{saved['id']}")
        data = r.json()
        for field in ("verdict", "confidence", "summary", "sources", "category"):
            assert field in data


class TestReportsList:
    async def test_list_returns_paginated_response(self, reports_client):
        r = await reports_client.get("/api/v1/reports")
        assert r.status_code == 200
        data = r.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data

    async def test_list_includes_saved_reports(self, reports_client):
        await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)
        r = await reports_client.get("/api/v1/reports")
        assert r.json()["total"] >= 1


class TestReportsDownload:
    async def test_download_json(self, reports_client):
        saved = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        r = await reports_client.get(f"/api/v1/reports/{saved['id']}/download?format=json")
        assert r.status_code == 200
        assert r.json()["verdict"] == "FALSE"

    async def test_download_unsupported_format_400(self, reports_client):
        saved = (await reports_client.post("/api/v1/reports", json=SAMPLE_REPORT)).json()
        r = await reports_client.get(f"/api/v1/reports/{saved['id']}/download?format=csv")
        assert r.status_code == 400
