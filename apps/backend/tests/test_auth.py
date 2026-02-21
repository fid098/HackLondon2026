"""
test_auth.py — Unit tests for Phase 1 Auth + Users routes.

Uses an in-memory FakeDB that mimics the subset of Motor async API
actually needed by the auth/users routes, so no real MongoDB is required.
"""

from datetime import datetime
from unittest.mock import MagicMock

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient


# ── In-memory MongoDB emulator ─────────────────────────────────────────────────

class FakeCollection:
    """Minimal async-compatible replica of a Motor collection."""

    def __init__(self):
        self._docs: dict[str, dict] = {}

    async def find_one(self, query: dict):
        for doc in self._docs.values():
            if self._matches(doc, query):
                return doc
        return None

    async def insert_one(self, doc: dict):
        oid = ObjectId()
        doc = {**doc, "_id": oid}
        self._docs[str(oid)] = doc
        result = MagicMock()
        result.inserted_id = oid
        return result

    async def update_one(self, query: dict, update: dict):
        for doc in self._docs.values():
            if self._matches(doc, query):
                if "$set" in update:
                    doc.update(update["$set"])
                return
        result = MagicMock()
        result.modified_count = 0
        return result

    @staticmethod
    def _matches(doc: dict, query: dict) -> bool:
        for key, value in query.items():
            if key == "_id":
                if doc.get("_id") != value:
                    return False
            else:
                if doc.get(key) != value:
                    return False
        return True


class FakeDB:
    """Fake MongoDB database — lazily creates collections."""

    def __init__(self):
        self._cols: dict[str, FakeCollection] = {}

    def __getitem__(self, name: str) -> FakeCollection:
        if name not in self._cols:
            self._cols[name] = FakeCollection()
        return self._cols[name]


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture()
def fake_db():
    """Fresh in-memory DB for each test."""
    return FakeDB()


@pytest.fixture()
async def auth_client(fake_db):
    """
    HTTPX client with the get_db FastAPI dependency overridden to use
    the in-memory FakeDB instead of a real MongoDB connection.
    """
    from app.main import app
    from app.core.database import get_db

    app.dependency_overrides[get_db] = lambda: fake_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


# ── Helpers ───────────────────────────────────────────────────────────────────

VALID_USER = {"email": "test@example.com", "password": "securepass123"}


async def _register(auth_client, payload=None) -> dict:
    payload = payload or VALID_USER
    r = await auth_client.post("/auth/register", json=payload)
    return r


# ── Register ──────────────────────────────────────────────────────────────────

class TestRegister:
    async def test_register_success_201(self, auth_client):
        r = await _register(auth_client)
        assert r.status_code == 201

    async def test_register_returns_token_and_user(self, auth_client):
        data = (await _register(auth_client)).json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == VALID_USER["email"]

    async def test_register_does_not_return_password(self, auth_client):
        data = (await _register(auth_client)).json()
        assert "password" not in data["user"]
        assert "hashed_password" not in data["user"]

    async def test_register_duplicate_email_409(self, auth_client):
        await _register(auth_client)
        r = await _register(auth_client)  # second time
        assert r.status_code == 409
        assert "already exists" in r.json()["detail"].lower()

    async def test_register_with_display_name(self, auth_client):
        payload = {**VALID_USER, "display_name": "Alice"}
        data = (await _register(auth_client, payload)).json()
        assert data["user"]["display_name"] == "Alice"

    async def test_register_short_password_422(self, auth_client):
        r = await auth_client.post("/auth/register", json={"email": "a@b.com", "password": "short"})
        assert r.status_code == 422

    async def test_register_invalid_email_422(self, auth_client):
        r = await auth_client.post("/auth/register", json={"email": "not-an-email", "password": "securepass123"})
        assert r.status_code == 422


# ── Login ─────────────────────────────────────────────────────────────────────

class TestLogin:
    async def test_login_success(self, auth_client):
        await _register(auth_client)
        r = await auth_client.post("/auth/login", json=VALID_USER)
        assert r.status_code == 200
        assert "access_token" in r.json()

    async def test_login_wrong_password_401(self, auth_client):
        await _register(auth_client)
        r = await auth_client.post(
            "/auth/login",
            json={"email": VALID_USER["email"], "password": "wrongpassword"},
        )
        assert r.status_code == 401

    async def test_login_unknown_email_401(self, auth_client):
        r = await auth_client.post(
            "/auth/login",
            json={"email": "nobody@example.com", "password": "any"},
        )
        assert r.status_code == 401

    async def test_login_returns_user_data(self, auth_client):
        await _register(auth_client)
        data = (await auth_client.post("/auth/login", json=VALID_USER)).json()
        assert data["user"]["email"] == VALID_USER["email"]


# ── /auth/me ──────────────────────────────────────────────────────────────────

class TestMe:
    async def test_me_requires_auth_401(self, auth_client):
        r = await auth_client.get("/auth/me")
        assert r.status_code == 401

    async def test_me_returns_user_with_valid_token(self, auth_client):
        token = (await _register(auth_client)).json()["access_token"]
        r = await auth_client.get("/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert r.status_code == 200
        assert r.json()["email"] == VALID_USER["email"]

    async def test_me_invalid_token_401(self, auth_client):
        r = await auth_client.get("/auth/me", headers={"Authorization": "Bearer garbage.token.here"})
        assert r.status_code == 401


# ── Preferences ───────────────────────────────────────────────────────────────

class TestPreferences:
    async def _token(self, auth_client) -> str:
        return (await _register(auth_client)).json()["access_token"]

    def _auth(self, token: str) -> dict:
        return {"Authorization": f"Bearer {token}"}

    async def test_get_preferences_default(self, auth_client):
        token = await self._token(auth_client)
        r = await auth_client.get("/users/preferences", headers=self._auth(token))
        assert r.status_code == 200
        data = r.json()
        assert "email_alerts" in data
        assert "confidence_threshold" in data

    async def test_put_preferences_replaces(self, auth_client):
        token = await self._token(auth_client)
        new_prefs = {
            "email_alerts": True,
            "default_language": "fr",
            "confidence_threshold": 0.75,
            "show_debug_info": False,
        }
        r = await auth_client.put("/users/preferences", json=new_prefs, headers=self._auth(token))
        assert r.status_code == 200
        assert r.json()["email_alerts"] is True
        assert r.json()["default_language"] == "fr"

    async def test_patch_preferences_partial(self, auth_client):
        token = await self._token(auth_client)
        r = await auth_client.patch(
            "/users/preferences",
            json={"email_alerts": True},
            headers=self._auth(token),
        )
        assert r.status_code == 200
        assert r.json()["email_alerts"] is True

    async def test_preferences_requires_auth(self, auth_client):
        r = await auth_client.get("/users/preferences")
        assert r.status_code == 401
