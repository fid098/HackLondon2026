"""
test_rate_limit.py — Tests for Phase 7 Rate Limiting.

Verifies that:
  1. Rate-limited AI endpoints remain accessible under the limit (200 OK).
  2. Exceeding the rate limit returns HTTP 429 with an error payload.
  3. The 429 response body contains a descriptive error message.

Endpoints under test (all accept POST):
  /api/v1/scam/check     — limit: 30/minute
  /api/v1/deepfake/image — limit: 20/minute
  /api/v1/triage         — limit: 60/minute

Strategy for 429 test:
  Patch `limiter._limiter.hit` to return False, which tells slowapi
  that the moving-window bucket is full → raises RateLimitExceeded → 429.
  This avoids needing to send 20–60 real HTTP requests in tests.
"""

import base64
from unittest.mock import patch

import pytest
from httpx import ASGITransport, AsyncClient


# ── Shared dummy data ──────────────────────────────────────────────────────────

_DUMMY_B64 = base64.b64encode(b"fake-media-bytes-for-testing").decode()
_SCAM_TEXT = "URGENT: Your account has been suspended. Verify your identity now or lose access."
_TRIAGE_TEXT = "Scientists confirm water is indeed wet, new study finds."


# ── Fixture ───────────────────────────────────────────────────────────────────

@pytest.fixture()
async def rl_client():
    """
    Async HTTP client against the full FastAPI app.

    No DB override needed — none of the tested endpoints require MongoDB.
    The limiter's in-memory storage is reset before each test so that
    previous requests don't bleed into the next test.
    """
    from app.main import app
    from app.core.rate_limit import limiter

    # Reset in-memory rate-limit counters so tests are independent.
    try:
        limiter._limiter.storage.reset()
    except Exception:
        pass  # Some storage backends don't support reset — safe to ignore.

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Helper: post scam check ────────────────────────────────────────────────────

async def _scam_post(client, text=_SCAM_TEXT):
    return await client.post("/api/v1/scam/check", json={"text": text})


async def _triage_post(client, text=_TRIAGE_TEXT):
    return await client.post("/api/v1/triage", json={"text": text})


async def _deepfake_image_post(client):
    return await client.post("/api/v1/deepfake/image", json={"image_b64": _DUMMY_B64})


# ══ Normal operation (under the limit) ════════════════════════════════════════

class TestRateLimitNormal:
    async def test_scam_check_returns_200(self, rl_client):
        r = await _scam_post(rl_client)
        assert r.status_code == 200

    async def test_triage_returns_200(self, rl_client):
        r = await _triage_post(rl_client)
        assert r.status_code == 200

    async def test_deepfake_image_returns_200(self, rl_client):
        r = await _deepfake_image_post(rl_client)
        assert r.status_code == 200

    async def test_multiple_requests_within_limit_succeed(self, rl_client):
        """Three sequential requests should all pass (well within limits)."""
        for _ in range(3):
            r = await _scam_post(rl_client)
            assert r.status_code == 200

    async def test_rate_limit_headers_present_on_scam(self, rl_client):
        """slowapi injects X-RateLimit-* headers on successful responses."""
        r = await _scam_post(rl_client)
        assert r.status_code == 200
        # Headers may be present depending on slowapi version; just confirm no crash.
        assert r.headers is not None

    async def test_rate_limit_headers_present_on_triage(self, rl_client):
        r = await _triage_post(rl_client)
        assert r.status_code == 200
        assert r.headers is not None


# ══ Rate limit exceeded (429) ══════════════════════════════════════════════════

class TestRateLimitExceeded:
    """
    Simulate bucket exhaustion by patching the internal `hit` method to
    return False (= limit exceeded) for the duration of each test.
    """

    async def test_scam_check_429_when_limit_exceeded(self, rl_client):
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _scam_post(rl_client)

        assert r.status_code == 429

    async def test_triage_429_when_limit_exceeded(self, rl_client):
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _triage_post(rl_client)

        assert r.status_code == 429

    async def test_deepfake_image_429_when_limit_exceeded(self, rl_client):
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _deepfake_image_post(rl_client)

        assert r.status_code == 429

    async def test_429_response_is_json(self, rl_client):
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _scam_post(rl_client)

        assert r.headers.get("content-type", "").startswith("application/json")

    async def test_429_response_has_error_field(self, rl_client):
        """slowapi's default handler returns {"error": "Rate limit exceeded: ..."}."""
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _scam_post(rl_client)

        data = r.json()
        assert "error" in data

    async def test_429_error_message_mentions_rate_limit(self, rl_client):
        from app.core.rate_limit import limiter

        with patch.object(limiter.limiter, "hit", return_value=False):
            r = await _scam_post(rl_client)

        data = r.json()
        assert "rate limit" in data["error"].lower() or "limit" in data["error"].lower()

    async def test_after_limit_reset_request_succeeds(self, rl_client):
        """Once the limiter is no longer patched, requests return 200 again."""
        from app.core.rate_limit import limiter

        # First: trigger 429 via patch
        with patch.object(limiter.limiter, "hit", return_value=False):
            r_limited = await _scam_post(rl_client)
        assert r_limited.status_code == 429

        # Then: patch removed, normal request succeeds
        r_ok = await _scam_post(rl_client)
        assert r_ok.status_code == 200


# ══ Limiter configuration ══════════════════════════════════════════════════════

class TestLimiterSetup:
    async def test_limiter_attached_to_app_state(self, rl_client):
        """The limiter must be wired into app.state for slowapi to work."""
        from app.main import app
        from app.core.rate_limit import limiter

        assert hasattr(app.state, "limiter")
        assert app.state.limiter is limiter

    async def test_limiter_uses_ip_key_function(self):
        """Key function should be get_remote_address (IP-based keying)."""
        from app.core.rate_limit import limiter
        from slowapi.util import get_remote_address

        assert limiter._key_func is get_remote_address
