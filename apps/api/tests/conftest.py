"""
pytest configuration and shared fixtures for the TruthGuard API tests.

Key concern: tests must not require a live MongoDB or Gemini API key.
We achieve this by:
  1. Patching connect_to_mongo / close_mongo_connection to no-ops so
     FastAPI's lifespan doesn't try to reach a real database.
  2. Setting db_client.client = None (disconnected) so health check
     correctly reports "disconnected" — a valid test-mode state.
  3. Ensuring AI_MOCK_MODE=true so GeminiClient returns canned responses.

For integration tests that need a real DB, override the mock_db fixture
in a separate conftest.py in a sub-folder (e.g., tests/integration/).
"""

import os
from unittest.mock import AsyncMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

# Set env vars BEFORE importing the app so Settings picks them up correctly
os.environ.setdefault("AI_MOCK_MODE", "true")
os.environ.setdefault("ENVIRONMENT", "test")


@pytest.fixture(autouse=True)
async def mock_db():
    """
    Patch the MongoDB lifecycle for every test.

    - connect_to_mongo → no-op AsyncMock (startup doesn't attempt real connection)
    - close_mongo_connection → no-op AsyncMock
    - db_client.client → None  (health check reports "disconnected", which is fine)
    - db_client.db → None

    Tests that need a real db should override this fixture locally.
    """
    with (
        patch("app.core.database.connect_to_mongo", new_callable=AsyncMock),
        patch("app.core.database.close_mongo_connection", new_callable=AsyncMock),
    ):
        import app.core.database as db_module

        # Save originals so we can restore after the test
        original_client = db_module.db_client.client
        original_db = db_module.db_client.db

        db_module.db_client.client = None
        db_module.db_client.db = None

        yield

        db_module.db_client.client = original_client
        db_module.db_client.db = original_db


@pytest.fixture()
async def client(mock_db):  # noqa: ARG001 — mock_db must run first
    """
    HTTPX async test client wired to the FastAPI app.

    Usage:
        async def test_something(client):
            response = await client.get("/health")
            assert response.status_code == 200
    """
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
