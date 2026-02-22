"""
deepfake.py — Phase 5 Deepfake Detection endpoints.

DEVELOPER: Ishaan
─────────────────────────────────────────────────────────────────────────────
This file owns the deepfake / synthetic-media detection endpoints.

Routes:
  POST /api/v1/deepfake/image — image deepfake detection (GAN artifacts, face-swap)
  POST /api/v1/deepfake/audio — synthetic speech / voice-clone detection
  POST /api/v1/deepfake/video — video deepfake detection (frame + temporal analysis)

HOW THE DATA FLOWS
──────────────────
1. The frontend reads the uploaded file with FileReader.readAsDataURL(), which
   returns a data: URL like "data:image/jpeg;base64,/9j/4AAQ...".
   The JavaScript then strips the "data:...;base64," prefix to get raw base64.
2. The base64 string is sent as image_b64 / audio_b64 / video_b64 in the JSON body.
3. This endpoint builds a detection prompt and sends it to Gemini Pro.
4. Gemini returns a JSON object with is_deepfake / is_synthetic, confidence, reasoning.
5. The response is parsed by _parse_json() and returned as a Pydantic model.
6. If parsing fails (Gemini returned garbled output), a safe inconclusive fallback
   (confidence=0.5) is returned rather than crashing.

WHAT GEMINI IS ASKED TO LOOK FOR
──────────────────────────────────
  Image: GAN artifacts, inconsistent lighting/shadows, eye and teeth anomalies,
         blending edges at face boundaries, unnatural skin textures
  Audio: unnatural prosody, missing breath sounds, robotic cadence,
         spectral TTS fingerprints, inconsistent vocal timbre
  Video: temporal flickering around face region, blending artifacts across frames,
         unnatural head poses, GAN fingerprints in keyframes

WHAT TO IMPROVE (your tasks as Ishaan)
────────────────────────────────────────
- Real CNN model: integrate FaceForensics++ weights via ONNX or a HuggingFace
  model (e.g. deepware-scanner or similar) for offline image detection without
  needing a Gemini API call.
- Frame sampling for video: use ffmpeg-python to extract N keyframes from the
  video and pass each to the image detector before doing the full video prompt.
  Currently Gemini only sees the first 500 base64 characters.
- Audio MFCC features: compute Mel-Frequency Cepstral Coefficients using librosa
  before prompting Gemini — richer features = more accurate verdicts.
- Server-side file size enforcement: currently only enforced client-side (50 MB).
  Add a check here and raise HTTPException(413) if exceeded.

TESTING YOUR CHANGES
─────────────────────
  cd apps/backend
  pytest tests/test_deepfake.py -v

  # Manual test — image:
  base64 -i tests/fixtures/sample.jpg | tr -d '\\n' > /tmp/b64.txt
  curl -X POST http://localhost:8000/api/v1/deepfake/image \\
    -H 'Content-Type: application/json' \\
    -d "{\"image_b64\": \"$(cat /tmp/b64.txt)\", \"filename\": \"sample.jpg\"}"

  # Manual test — audio:
  base64 -i tests/fixtures/sample.mp3 | tr -d '\\n' > /tmp/b64.txt
  curl -X POST http://localhost:8000/api/v1/deepfake/audio \\
    -H 'Content-Type: application/json' \\
    -d "{\"audio_b64\": \"$(cat /tmp/b64.txt)\", \"filename\": \"sample.mp3\"}"

No authentication required — public endpoints used by both the web app and the
Chrome extension.
"""

import json
import logging
import re

from fastapi import APIRouter, Request

from app.ai.gemini_client import gemini_client
from app.core.rate_limit import limiter
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
@limiter.limit("20/minute")
async def analyze_image(request: Request, payload: DeepfakeImageRequest):
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
@limiter.limit("20/minute")
async def analyze_audio(request: Request, payload: DeepfakeAudioRequest):
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
@limiter.limit("20/minute")
async def analyze_video(request: Request, payload: DeepfakeVideoRequest):
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
