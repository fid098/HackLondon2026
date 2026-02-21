"""
Tests for the /health endpoint.

Verifies:
  - Returns HTTP 200 with status="ok" (API liveness check)
  - Returns expected JSON schema
  - Handles DB disconnected state gracefully
  - Root / endpoint returns API metadata

All tests run without a live MongoDB (db is mocked as disconnected in conftest).
"""

import pytest


@pytest.mark.asyncio
async def test_health_returns_200(client):
    """Health endpoint must always return 200 if the API process is alive."""
    response = await client.get("/health")
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_health_response_schema(client):
    """Health response must contain the required fields."""
    response = await client.get("/health")
    data = response.json()

    assert data["status"] == "ok"
    assert data["version"] == "0.1.0"
    assert "database" in data
    assert "environment" in data


@pytest.mark.asyncio
async def test_health_database_field_valid(client):
    """Database field must be 'connected' or 'disconnected' (not an error)."""
    response = await client.get("/health")
    data = response.json()

    assert data["database"] in ("connected", "disconnected")


@pytest.mark.asyncio
async def test_health_disconnected_when_no_db(client):
    """
    When db_client.client is None (mock), the health check should report
    'disconnected' — not raise an exception.
    """
    response = await client.get("/health")
    data = response.json()

    # In mock mode the db is set to None — so disconnected is expected
    assert data["database"] == "disconnected"


@pytest.mark.asyncio
async def test_root_endpoint(client):
    """Root / must return API metadata with status=running."""
    response = await client.get("/")
    assert response.status_code == 200

    data = response.json()
    assert data["status"] == "running"
    assert "version" in data
    assert "name" in data


@pytest.mark.asyncio
async def test_docs_available_in_test_env(client):
    """
    OpenAPI docs should be available in non-production environments.
    (They're disabled when ENVIRONMENT=production for security.)
    """
    response = await client.get("/docs")
    # Docs returns 200 (HTML page)
    assert response.status_code == 200


@pytest.mark.asyncio
async def test_unknown_route_returns_404(client):
    """Unknown routes should return 404, not 500."""
    response = await client.get("/does-not-exist")
    assert response.status_code == 404
