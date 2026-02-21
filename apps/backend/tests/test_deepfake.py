"""
test_deepfake.py — Tests for Phase 5 Deepfake Detection endpoints.

Routes under test:
  POST /api/v1/deepfake/image
  POST /api/v1/deepfake/audio
  POST /api/v1/deepfake/video

Runs in mock AI mode — no real API keys or file processing required.
The base64 payloads are small dummy strings; the mock Gemini client
returns canned JSON regardless of content.
"""

import base64

import pytest
from httpx import ASGITransport, AsyncClient

# A small but valid base64 string to use in all tests
_DUMMY_B64 = base64.b64encode(b"fake-media-content-for-testing").decode()


@pytest.fixture()
async def deepfake_client():
    from app.main import app

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


# ── Image endpoint ─────────────────────────────────────────────────────────────

class TestDeepfakeImage:
    async def test_valid_image_returns_200(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64},
        )
        assert r.status_code == 200

    async def test_response_has_required_fields(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64},
        )
        data = r.json()
        assert "is_deepfake" in data
        assert "confidence" in data
        assert "reasoning" in data

    async def test_is_deepfake_is_bool(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64},
        )
        assert isinstance(r.json()["is_deepfake"], bool)

    async def test_confidence_in_range(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64},
        )
        conf = r.json()["confidence"]
        assert isinstance(conf, float)
        assert 0.0 <= conf <= 1.0

    async def test_reasoning_is_non_empty_string(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64},
        )
        reasoning = r.json()["reasoning"]
        assert isinstance(reasoning, str)
        assert len(reasoning) > 0

    async def test_optional_filename_accepted(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/image",
            json={"image_b64": _DUMMY_B64, "filename": "photo.jpg"},
        )
        assert r.status_code == 200

    async def test_missing_image_b64_returns_422(self, deepfake_client):
        r = await deepfake_client.post("/api/v1/deepfake/image", json={})
        assert r.status_code == 422

    async def test_get_method_not_allowed(self, deepfake_client):
        r = await deepfake_client.get("/api/v1/deepfake/image")
        assert r.status_code == 405


# ── Audio endpoint ─────────────────────────────────────────────────────────────

class TestDeepfakeAudio:
    async def test_valid_audio_returns_200(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/audio",
            json={"audio_b64": _DUMMY_B64},
        )
        assert r.status_code == 200

    async def test_response_has_is_synthetic_field(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/audio",
            json={"audio_b64": _DUMMY_B64},
        )
        data = r.json()
        assert "is_synthetic" in data
        assert "confidence" in data
        assert "reasoning" in data

    async def test_is_synthetic_is_bool(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/audio",
            json={"audio_b64": _DUMMY_B64},
        )
        assert isinstance(r.json()["is_synthetic"], bool)

    async def test_confidence_in_range(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/audio",
            json={"audio_b64": _DUMMY_B64},
        )
        conf = r.json()["confidence"]
        assert 0.0 <= conf <= 1.0

    async def test_missing_audio_b64_returns_422(self, deepfake_client):
        r = await deepfake_client.post("/api/v1/deepfake/audio", json={})
        assert r.status_code == 422

    async def test_get_method_not_allowed(self, deepfake_client):
        r = await deepfake_client.get("/api/v1/deepfake/audio")
        assert r.status_code == 405


# ── Video endpoint ─────────────────────────────────────────────────────────────

class TestDeepfakeVideo:
    async def test_valid_video_returns_200(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/video",
            json={"video_b64": _DUMMY_B64},
        )
        assert r.status_code == 200

    async def test_response_has_required_fields(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/video",
            json={"video_b64": _DUMMY_B64},
        )
        data = r.json()
        assert "is_deepfake" in data
        assert "confidence" in data
        assert "reasoning" in data

    async def test_is_deepfake_is_bool(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/video",
            json={"video_b64": _DUMMY_B64},
        )
        assert isinstance(r.json()["is_deepfake"], bool)

    async def test_confidence_in_range(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/video",
            json={"video_b64": _DUMMY_B64},
        )
        conf = r.json()["confidence"]
        assert 0.0 <= conf <= 1.0

    async def test_optional_filename_accepted(self, deepfake_client):
        r = await deepfake_client.post(
            "/api/v1/deepfake/video",
            json={"video_b64": _DUMMY_B64, "filename": "clip.mp4"},
        )
        assert r.status_code == 200

    async def test_missing_video_b64_returns_422(self, deepfake_client):
        r = await deepfake_client.post("/api/v1/deepfake/video", json={})
        assert r.status_code == 422

    async def test_get_method_not_allowed(self, deepfake_client):
        r = await deepfake_client.get("/api/v1/deepfake/video")
        assert r.status_code == 405
