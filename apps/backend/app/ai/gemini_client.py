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
import os
from enum import Enum
from typing import Any

# Python 3.14 + protobuf native extension can fail when importing Gemini deps.
# Keep this as default-only so users can still override it explicitly.
os.environ.setdefault("PROTOCOL_BUFFERS_PYTHON_IMPLEMENTATION", "python")

import google.generativeai as genai

from app.core.config import settings

# Max base64 chars to send as inline vision data (~11 MB original file).
# Files larger than this fall back to text-only analysis.
_MAX_VISION_B64 = 15_000_000

logger = logging.getLogger(__name__)


class GeminiModel(str, Enum):
    PRO = "gemini-2.5-flash"
    FLASH = "gemini-2.5-flash"


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
        "ARGUMENT: Based on available evidence, there is strong credible support for this claim "
        "from independent Tier 1 sources. According to [Reuters ★★★★★](https://www.reuters.com/) "
        "the core facts have been independently verified and corroborated. "
        "[BBC News ★★★★★](https://www.bbc.com/) has reported consistently with this position, "
        "and the underlying data appears in cross-referenced PRIMARY sources with no significant "
        "discrepancies found across two independent Tier 1 wire services.\n\n"
        "KEY EVIDENCE: [Reuters ★★★★★](https://www.reuters.com/fact-check/) — PRIMARY source "
        "directly confirming the core claim with corroborating data from official statements.\n\n"
        "POINTS:\n"
        "- The core assertion is directly supported by a Tier 1 wire service — [Reuters ★★★★★](https://www.reuters.com/)\n"
        "- Independent cross-reference confirms the claim — [BBC News ★★★★★](https://www.bbc.com/)\n"
        "- Official institutional data aligns with this position — [GOV.UK ★★★★★](https://www.gov.uk/)\n\n"
        "SOURCE QUALITY: HIGH"
    ),
    "agent_con": (
        "ARGUMENT: Counter-evidence suggests the claim, while not demonstrably false, lacks "
        "important context that affects its full interpretation. "
        "[AP Fact Check ★★★★★](https://apnews.com/hub/ap-fact-check) has noted similar claims "
        "require additional nuance around scope and timeframe. "
        "[Snopes ★★★★☆](https://www.snopes.com/) classifies related narratives as partially "
        "accurate. The available counter-evidence is largely TYPE B — the core fact may be "
        "accurate but the framing omits significant context. I acknowledge this is a relatively "
        "weak counter-case as no TYPE A direct contradiction was found.\n\n"
        "POINTS:\n"
        "- TYPE B — The claim lacks critical context about scope and timeline — [Snopes ★★★★☆](https://www.snopes.com/)\n"
        "- TYPE C — Primary sourcing relies on secondary reports rather than direct documentation — [AP Fact Check ★★★★★](https://apnews.com/hub/ap-fact-check)\n"
        "- TYPE B — Important qualifications in original data are not reflected in the claim — [PolitiFact ★★★★☆](https://www.politifact.com/)\n\n"
        "SOURCE QUALITY: MEDIUM"
    ),
    "judge": (
        '{"verdict": "TRUE", "confidence": 78, '
        '"summary": "The claim is broadly accurate based on available Tier 1/2 evidence. '
        'Agent A produced strong supporting evidence from credible primary sources. '
        'Agent B\'s counter-case consisted of TYPE B and TYPE C evidence only, which per '
        'evaluation rules cannot flip a well-sourced claim to MISLEADING.", '
        '"category": "General", '
        '"reasoning": "STEP 1 — Both agents cited independent sources from different domains. '
        'STEP 2 — Agent A avg score 0.85 (HIGH) with two Tier 1 wire services. Agent B avg 0.71 (MEDIUM). '
        'STEP 3 — Corroboration data supports the core claim. '
        'STEP 4 — No TYPE A counter-evidence from Agent B; all points are TYPE B (missing context) '
        'or TYPE C (source quality challenge) — insufficient to override well-sourced supporting evidence. '
        'STEP 5 — No hallucination detected. STEP 6 — Fact-check data does not contradict Agent A.", '
        '"decisive_factors": ['
        '"Agent A provided Tier 1 primary source evidence directly confirming the core claim.", '
        '"Agent B produced only TYPE B/C counter-evidence — cannot flip TRUE verdict under evaluation rules."'
        '], '
        '"source_quality_assessment": "Agent A: HIGH quality — two independent Tier 1 wire services cross-referenced. Agent B: MEDIUM quality — fact-checkers cited but no direct TYPE A contradiction found.", '
        '"agent_scores": {"agent_a": 8.5, "agent_b": 4.2}}'
    ),
    "extract_claims": (
        "[MOCK] Extracted claims: "
        '["Claim 1: The stated fact is unverified", '
        '"Claim 2: Statistics cited appear manipulated"]'
    ),
    # Probe mocks — returned by each parallel probe in deepfake_pipeline.py
    "deepfake_probe": (
        '{"suspicious": false, "score": 0.18, '
        '"findings": ["No GAN grid artifacts detected in uniform regions", '
        '"Natural pore-level skin variation present — inconsistent with diffusion smoothing"], '
        '"summary": "No synthetic manipulation indicators detected in this analysis pass."}'
    ),
    # Synthesis mocks — final verdict from the synthesiser step
    "deepfake_image": (
        '{"is_fake": false, "confidence": 0.15, '
        '"reasoning": "[MOCK] Both probes returned clean results. '
        'No significant GAN fingerprints, face-swap boundaries, or facial anatomy '
        'inconsistencies were detected. The image appears to be genuine."}'
    ),
    "deepfake_audio": (
        '{"is_fake": false, "confidence": 0.15, '
        '"reasoning": "[MOCK] Both probes returned clean results. '
        'Prosody patterns and spectral characteristics are consistent with natural '
        'human speech. No TTS or voice-cloning fingerprints detected."}'
    ),
    "deepfake_video": (
        '{"is_fake": false, "confidence": 0.15, '
        '"reasoning": "[MOCK] All three probes returned clean results. '
        'No inter-frame flickering, blending boundary shifts, or temporal '
        'inconsistencies consistent with deepfake manipulation were detected."}'
    ),
    # YouTube AI-detection pipeline mocks
    "youtube_defender": (
        "ARGUMENT: Based on the transcript and metadata, there are clear indicators that this "
        "content was produced by a human creator. The transcript contains specific factual "
        "references, natural conversational phrasing with genuine hesitations, and cites "
        "verifiable sources. The channel name and description are consistent with an "
        "established human presence rather than a faceless AI content farm.\n\n"
        "POINTS:\n"
        "- Transcript contains specific cited sources and verifiable claims — inconsistent with generic AI output\n"
        "- Natural speech patterns including corrections and topic tangents present in captions\n"
        "- Channel has established identity with consistent thematic focus\n\n"
        "SOURCE QUALITY: MEDIUM"
    ),
    "youtube_prosecutor": (
        "ARGUMENT: Several indicators suggest this content may have been generated using AI "
        "tools. The transcript shows consistent, unvaried sentence structures typical of "
        "AI-generated scripts with no natural speech disfluencies. The title follows a "
        "template format common in AI content farms, and the channel lacks verifiable "
        "human identity markers. The thumbnail shows moderate AI manipulation signals.\n\n"
        "POINTS:\n"
        "- Transcript lacks personal anecdotes, hesitations, or topic-specific expertise markers\n"
        "- Title follows AI content farm template: generic superlative + broad topic\n"
        "- No citations or sources mentioned in transcript — common in AI-generated content\n\n"
        "SOURCE QUALITY: LOW"
    ),
    "youtube_judge": (
        '{"verdict": "UNCERTAIN", "confidence": 52, '
        '"summary": "Mixed signals detected. The content shows some AI generation indicators '
        '(consistent sentence structure, no citations) but also retains some markers of '
        'human production (channel context, natural topic progression). Further context '
        'is needed for a definitive verdict.", '
        '"ai_indicators": ['
        '"Transcript lacks natural speech disfluencies", '
        '"Title follows generic AI content farm template", '
        '"No citations or external sources referenced"'
        '], '
        '"human_indicators": ['
        '"Channel shows consistent thematic focus", '
        '"Content contains domain-specific terminology"'
        '], '
        '"reasoning": "Both agents presented credible but inconclusive cases. '
        'Agent A identified channel consistency and domain terminology as human signals. '
        'Agent B flagged script uniformity and absent citations as AI indicators. '
        'Without stronger thumbnail AI signal or definitive TTS markers, UNCERTAIN is '
        'the appropriate verdict."}'
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
                  # noqa: PLC0415

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

    async def generate_with_vision(
        self,
        prompt: str,
        media_b64: str,
        mime_type: str,
        response_key: str = "default",
    ) -> str:
        """
        Multimodal analysis — sends the actual image/audio/video bytes inline to Gemini.

        Falls back to text-only generate() if the file exceeds _MAX_VISION_B64 chars
        (too large for inline data; Gemini would reject it).

        Args:
            prompt:      The analysis prompt.
            media_b64:   Base64-encoded media data (full, not truncated).
            mime_type:   MIME type string e.g. "image/jpeg", "audio/mp3", "video/mp4".
            response_key: Mock response key (ignored in real mode).
        """
        if self.mock_mode:
            return _MOCK_RESPONSES.get(response_key, _MOCK_RESPONSES["default"])

        if len(media_b64) > _MAX_VISION_B64:
            logger.warning(
                "Media too large for inline vision (%d chars > %d limit), "
                "falling back to text-only analysis",
                len(media_b64), _MAX_VISION_B64,
            )
            return await self.generate(prompt, response_key=response_key)

        try:
            gemini_model = self._genai.GenerativeModel(GeminiModel.PRO.value)
            contents = [
                {"text": prompt},
                {"inline_data": {"mime_type": mime_type, "data": media_b64}},
            ]
            response = await gemini_model.generate_content_async(contents)
            return response.text
        except Exception as exc:
            logger.error("Gemini Vision API error (mime=%s): %s", mime_type, exc)
            raise


# Module-level singleton — import and use this everywhere
gemini_client = GeminiClient()
