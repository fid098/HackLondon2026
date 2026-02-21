"""
GeminiClient — Async wrapper around Google Generative AI SDK.

Supports two models:
  - GeminiModel.PRO   → gemini-1.5-pro   (deep analysis, debate, multimodal)
  - GeminiModel.FLASH → gemini-1.5-flash (quick triage in extension)

Supports two runtime modes (set via AI_MOCK_MODE env var):
  - MOCK mode (default): returns deterministic canned responses.
    Use for tests and local dev without API keys.
  - REAL mode: makes actual Gemini API calls.
    Requires GEMINI_API_KEY to be set.

Extension pattern: add new mock response keys to _MOCK_RESPONSES and
reference them in generate() calls via the response_key parameter.
"""

import logging
from enum import Enum
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)


class GeminiModel(str, Enum):
    PRO = "gemini-1.5-pro"
    FLASH = "gemini-1.5-flash"


# Canned responses for mock mode.
# Keys map to response_key arguments in generate() calls.
# Extend these as new features are added in later phases.
_MOCK_RESPONSES: dict[str, str] = {
    "default": (
        "[MOCK] This is a placeholder Gemini response. "
        "Set AI_MOCK_MODE=false and provide GEMINI_API_KEY for real responses."
    ),
    "debate_pro": (
        "ARGUMENT: Based on available evidence, there are supporting arguments "
        "for this claim including published studies, expert consensus, and corroborating sources.\n"
        "POINTS:\n"
        "- Multiple peer-reviewed studies support the core assertion.\n"
        "- Leading experts in the field have endorsed similar findings.\n"
        "- The original source is a credible institution with a strong track record."
    ),
    "debate_con": (
        "ARGUMENT: Counter-evidence suggests this claim is questionable because "
        "contradicting studies exist and key context has been omitted.\n"
        "POINTS:\n"
        "- Contradicting studies with larger sample sizes show opposing results.\n"
        "- The claim omits critical context that changes its meaning.\n"
        "- Three fact-checking organisations have flagged this narrative."
    ),
    # agent_pro / agent_con are the keys used by debate_pipeline.py
    "agent_pro": (
        "ARGUMENT: Based on available evidence, there is credible support for this claim. "
        "Peer-reviewed literature and expert statements align with the core assertion.\n"
        "POINTS:\n"
        "- The underlying data point exists in peer-reviewed literature.\n"
        "- Geographic scope of the claim is broadly correct.\n"
        "- Credible institutions have cited similar statistics."
    ),
    "agent_con": (
        "ARGUMENT: Counter-evidence indicates this claim contains significant inaccuracies "
        "or omits crucial context that fundamentally alters its meaning.\n"
        "POINTS:\n"
        "- The study cited predates the claim by over a decade — the landscape has changed.\n"
        "- The figure was cherry-picked; the same paper shows contrary trends in most cases.\n"
        "- Multiple independent fact-checkers have flagged variants of this claim."
    ),
    "judge": (
        '{"verdict": "MISLEADING", "confidence": 72, '
        '"summary": "The claim contains partially accurate information but omits critical '
        'context that significantly changes its meaning. The core statistic cited is real, '
        'but the source and timeframe have been misrepresented.", '
        '"category": "General", '
        '"reasoning": "After reviewing both arguments and available fact-check data, '
        'the claim merits a MISLEADING verdict. While some supporting evidence exists, '
        'the contradicting evidence and omitted context are substantial."}'
    ),
    "extract_claims": (
        "[MOCK] Extracted claims: "
        '["Claim 1: The stated fact is unverified", '
        '"Claim 2: Statistics cited appear manipulated"]'
    ),
    "deepfake_image": (
        '{"is_deepfake": false, "confidence": 0.50, '
        '"reasoning": "[MOCK] No real detection performed — mock mode active."}'
    ),
    "deepfake_audio": (
        '{"is_synthetic": false, "confidence": 0.50, '
        '"reasoning": "[MOCK] No real detection performed — mock mode active."}'
    ),
    "deepfake_video": (
        '{"is_deepfake": false, "confidence": 0.50, '
        '"reasoning": "[MOCK] No real detection performed — mock mode active."}'
    ),
    "quick_triage": (
        '{"verdict": "UNVERIFIED", "confidence": 30, '
        '"summary": "[MOCK] Quick triage complete — no real analysis in mock mode."}'
    ),
    "scam_check": (
        '{"is_scam": false, "confidence": 0.15, '
        '"model_scores": {"roberta": 0.12, "xgboost": 0.18}, '
        '"scam_type": null, '
        '"reasoning": "[MOCK] No real detection performed — mock mode active."}'
    ),
}


class GeminiClient:
    """
    Central Gemini interface for the entire TruthGuard backend.

    Why centralise: single place for retry logic, rate limiting, cost
    logging, model swaps, and mock injection. Don't instantiate per-request;
    use the module-level `gemini_client` singleton.
    """

    def __init__(self) -> None:
        self.mock_mode = settings.ai_mock_mode

        if not self.mock_mode:
            if not settings.gemini_api_key:
                logger.warning(
                    "GEMINI_API_KEY not set — falling back to mock mode. "
                    "Set AI_MOCK_MODE=true to silence this warning."
                )
                self.mock_mode = True
            else:
                # Lazy import: only pull in the heavy SDK if we're in real mode
                import google.generativeai as genai  # noqa: PLC0415

                genai.configure(api_key=settings.gemini_api_key)
                self._genai = genai

        if self.mock_mode:
            logger.info("GeminiClient initialised in MOCK mode")
        else:
            logger.info("GeminiClient initialised in REAL mode (model: gemini-1.5-*)")

    async def generate(
        self,
        prompt: str,
        model: GeminiModel = GeminiModel.PRO,
        response_key: str = "default",
        **generation_kwargs: Any,
    ) -> str:
        """
        Generate text from a Gemini model.

        Args:
            prompt:             The full prompt string.
            model:              Which Gemini model to use.
            response_key:       Mock response key (ignored in real mode).
            **generation_kwargs: Passed through to GenerativeModel.generate_content_async().

        Returns:
            Generated text string.

        Raises:
            Exception: Propagates Gemini SDK errors in real mode.
        """
        if self.mock_mode:
            return _MOCK_RESPONSES.get(response_key, _MOCK_RESPONSES["default"])

        try:
            gemini_model = self._genai.GenerativeModel(model.value)
            response = await gemini_model.generate_content_async(prompt, **generation_kwargs)
            return response.text
        except Exception as exc:
            logger.error("Gemini API error (model=%s): %s", model.value, exc)
            raise

    async def generate_with_flash(self, prompt: str, response_key: str = "default") -> str:
        """Quick triage with Gemini Flash (low latency, lower cost)."""
        return await self.generate(prompt, model=GeminiModel.FLASH, response_key=response_key)

    async def generate_with_pro(self, prompt: str, response_key: str = "default") -> str:
        """Deep analysis with Gemini Pro (higher quality, higher cost)."""
        return await self.generate(prompt, model=GeminiModel.PRO, response_key=response_key)


# Module-level singleton — import and use this everywhere
gemini_client = GeminiClient()
