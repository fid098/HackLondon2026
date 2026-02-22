"""
Unit tests for the AI module (GeminiClient, adapters).

All tests run in mock mode — no real API keys needed.
These test the adapter logic and graceful degradation, not Gemini's output.
"""

import pytest

from app.ai.factcheck_adapter import FactCheckAdapter
from app.ai.gemini_client import GeminiClient
from app.ai.serper_adapter import SerperAdapter

# ─── GeminiClient ─────────────────────────────────────────────────────────────


class TestGeminiClientMockMode:
    """GeminiClient in mock mode (default in tests)."""

    def setup_method(self):
        # Force mock mode regardless of env
        import app.core.config as cfg

        self._original = cfg.settings.ai_mock_mode
        cfg.settings.ai_mock_mode = True
        self.client = GeminiClient()

    def teardown_method(self):
        import app.core.config as cfg

        cfg.settings.ai_mock_mode = self._original

    @pytest.mark.asyncio
    async def test_generate_returns_string(self):
        result = await self.client.generate("test prompt")
        assert isinstance(result, str)
        assert len(result) > 0

    @pytest.mark.asyncio
    async def test_generate_uses_response_key(self):
        result = await self.client.generate("any prompt", response_key="debate_pro")
        # debate_pro mock now uses ARGUMENT: / POINTS: format
        assert "ARGUMENT:" in result or "supporting arguments" in result

    @pytest.mark.asyncio
    async def test_generate_unknown_key_returns_default(self):
        result = await self.client.generate("any prompt", response_key="nonexistent_key")
        assert "MOCK" in result

    @pytest.mark.asyncio
    async def test_generate_with_flash(self):
        result = await self.client.generate_with_flash("quick check")
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_generate_with_pro(self):
        result = await self.client.generate_with_pro("deep analysis")
        assert isinstance(result, str)

    @pytest.mark.asyncio
    async def test_judge_response_key(self):
        result = await self.client.generate("judge prompt", response_key="judge")
        # judge mock now returns JSON with "verdict" key
        assert "verdict" in result

    @pytest.mark.asyncio
    async def test_deepfake_image_response_key(self):
        result = await self.client.generate("image check", response_key="deepfake_image")
        # CNN deepfake detector uses is_fake internally; route maps it to is_deepfake
        assert "is_fake" in result


# ─── SerperAdapter ────────────────────────────────────────────────────────────


class TestSerperAdapterNoKey:
    """SerperAdapter with no API key set — must degrade gracefully."""

    def setup_method(self):
        import app.core.config as cfg

        self._original = cfg.settings.serper_api_key
        cfg.settings.serper_api_key = ""
        self.adapter = SerperAdapter()

    def teardown_method(self):
        import app.core.config as cfg

        cfg.settings.serper_api_key = self._original

    def test_adapter_is_disabled(self):
        assert self.adapter.enabled is False

    @pytest.mark.asyncio
    async def test_search_returns_empty_list(self):
        results = await self.adapter.search("test query")
        assert results == []

    @pytest.mark.asyncio
    async def test_news_search_returns_empty_list(self):
        results = await self.adapter.news_search("test query")
        assert results == []


# ─── FactCheckAdapter ─────────────────────────────────────────────────────────


class TestFactCheckAdapterNoKey:
    """FactCheckAdapter with no API key set — must degrade gracefully."""

    def setup_method(self):
        import app.core.config as cfg

        self._original = cfg.settings.google_fact_check_api_key
        cfg.settings.google_fact_check_api_key = ""
        self.adapter = FactCheckAdapter()

    def teardown_method(self):
        import app.core.config as cfg

        cfg.settings.google_fact_check_api_key = self._original

    def test_adapter_is_disabled(self):
        assert self.adapter.enabled is False

    @pytest.mark.asyncio
    async def test_search_returns_empty_list(self):
        results = await self.adapter.search("climate change")
        assert results == []
