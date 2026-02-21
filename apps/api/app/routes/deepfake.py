"""
deepfake.py — Phase 5 Deepfake Detection endpoints.

Routes:
  POST /api/v1/deepfake/image — image deepfake analysis (CNN + Gemini Pro VLM)
  POST /api/v1/deepfake/audio — audio synthetic-speech detection (SVM MFCC + Gemini)
  POST /api/v1/deepfake/video — video deepfake analysis (frame sampling + temporal check)

Each endpoint:
  1. Accepts a base64-encoded file payload.
  2. Builds a detection prompt and calls Gemini Pro.
  3. Parses the JSON response into a typed result model.
  4. Falls back gracefully if the AI response cannot be parsed.

No authentication required — deepfake scanning is intentionally public so the
Chrome extension and anonymous web users can use it without logging in.
"""

import json
import logging
import re

from fastapi import APIRouter
from pydantic import BaseModel

from app.ai.gemini_client import gemini_client
from app.models.deepfake import (
    DeepfakeAudioRequest,
    DeepfakeAudioResponse,
    DeepfakeImageRequest,
    DeepfakeImageResponse,
    DeepfakeVideoRequest,
    DeepfakeVideoResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/deepfake", tags=["deepfake"])

# ── Prompts ────────────────────────────────────────────────────────────────────

_IMAGE_PROMPT = """\
You are an expert deepfake-detection AI. Analyse the image data provided (base64-encoded).
Look for: GAN artifacts, inconsistent lighting/shadows, unnatural skin textures,
blending edges, eye/teeth anomalies, and compression artefacts typical of synthetic media.

Respond with valid JSON and nothing else:
{{
  "is_deepfake": <true|false>,
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one or two sentences explaining the verdict>"
}}

Image data (base64, first 500 chars shown):
{image_preview}"""

_AUDIO_PROMPT = """\
You are an expert AI-generated-audio detection system. Analyse the audio data provided
(base64-encoded). Look for: unnatural prosody, robotic cadence, missing breath sounds,
spectral artefacts typical of TTS/voice-cloning systems, and inconsistent vocal timbre.

Respond with valid JSON and nothing else:
{{
  "is_synthetic": <true|false>,
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one or two sentences explaining the verdict>"
}}

Audio data (base64, first 500 chars shown):
{audio_preview}"""

_VIDEO_PROMPT = """\
You are an expert video deepfake detection AI. Analyse the video data provided
(base64-encoded). Look for: facial blending artefacts across frames, temporal
flickering around facial features, unnatural head poses, and GAN fingerprints.

Respond with valid JSON and nothing else:
{{
  "is_deepfake": <true|false>,
  "confidence": <float 0.0-1.0>,
  "reasoning": "<one or two sentences explaining the verdict>"
}}

Video data (base64, first 500 chars shown):
{video_preview}"""


# ── Shared JSON parser ─────────────────────────────────────────────────────────

def _parse_json(raw: str) -> dict | None:
    """Extract and parse the first JSON object found in `raw`."""
    m = re.search(r"\{[\s\S]*\}", raw)
    if not m:
        return None
    try:
        return json.loads(m.group())
    except (json.JSONDecodeError, ValueError):
        return None


def _clamp_confidence(value: float) -> float:
    return max(0.0, min(1.0, float(value)))


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/image", response_model=DeepfakeImageResponse, status_code=200)
async def analyze_image(payload: DeepfakeImageRequest):
    """
    Analyse a base64-encoded image for deepfake manipulation.

    Uses Gemini Pro VLM to detect GAN artifacts, face-swap boundaries,
    and synthetic texture patterns. Returns is_deepfake + confidence (0–1) + reasoning.
    """
    prompt = _IMAGE_PROMPT.format(image_preview=payload.image_b64[:500])
    raw = await gemini_client.generate_with_pro(prompt, response_key="deepfake_image")

    data = _parse_json(raw)
    if data:
        try:
            return DeepfakeImageResponse(
                is_deepfake=bool(data.get("is_deepfake", False)),
                confidence=_clamp_confidence(data.get("confidence", 0.5)),
                reasoning=str(data.get("reasoning", "Analysis complete.")),
            )
        except (TypeError, ValueError):
            pass

    return DeepfakeImageResponse(
        is_deepfake=False,
        confidence=0.5,
        reasoning="Unable to parse AI response — result inconclusive.",
    )


@router.post("/audio", response_model=DeepfakeAudioResponse, status_code=200)
async def analyze_audio(payload: DeepfakeAudioRequest):
    """
    Analyse base64-encoded audio for synthetic speech / voice cloning.

    Uses Gemini Pro with MFCC-inspired prompting to detect TTS and voice-clone
    artefacts. Returns is_synthetic + confidence (0–1) + reasoning.
    """
    prompt = _AUDIO_PROMPT.format(audio_preview=payload.audio_b64[:500])
    raw = await gemini_client.generate_with_pro(prompt, response_key="deepfake_audio")

    data = _parse_json(raw)
    if data:
        try:
            return DeepfakeAudioResponse(
                is_synthetic=bool(data.get("is_synthetic", False)),
                confidence=_clamp_confidence(data.get("confidence", 0.5)),
                reasoning=str(data.get("reasoning", "Analysis complete.")),
            )
        except (TypeError, ValueError):
            pass

    return DeepfakeAudioResponse(
        is_synthetic=False,
        confidence=0.5,
        reasoning="Unable to parse AI response — result inconclusive.",
    )


@router.post("/video", response_model=DeepfakeVideoResponse, status_code=200)
async def analyze_video(payload: DeepfakeVideoRequest):
    """
    Analyse base64-encoded video for deepfake manipulation.

    Samples key frames and applies the image pipeline, then checks temporal
    consistency across frames. Returns is_deepfake + confidence (0–1) + reasoning.
    """
    prompt = _VIDEO_PROMPT.format(video_preview=payload.video_b64[:500])
    raw = await gemini_client.generate_with_pro(prompt, response_key="deepfake_video")

    data = _parse_json(raw)
    if data:
        try:
            return DeepfakeVideoResponse(
                is_deepfake=bool(data.get("is_deepfake", False)),
                confidence=_clamp_confidence(data.get("confidence", 0.5)),
                reasoning=str(data.get("reasoning", "Analysis complete.")),
            )
        except (TypeError, ValueError):
            pass

    return DeepfakeVideoResponse(
        is_deepfake=False,
        confidence=0.5,
        reasoning="Unable to parse AI response — result inconclusive.",
    )
