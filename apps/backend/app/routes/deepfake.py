"""
deepfake.py — Deepfake / synthetic-media detection endpoints.

DEVELOPER: Ishaan
─────────────────────────────────────────────────────────────────────────────
Routes:
  POST /api/v1/deepfake/image — image deepfake detection (GAN artifacts, face-swap)
  POST /api/v1/deepfake/audio — synthetic speech / voice-clone detection
  POST /api/v1/deepfake/video — video deepfake detection (frame + temporal analysis)

HOW THE DATA FLOWS
──────────────────
1. Frontend reads the uploaded file with FileReader.readAsDataURL(), strips the
   "data:...;base64," prefix, and sends the raw base64 string in the JSON body.
2. This route detects the MIME type from the filename and passes the FULL base64
   to deepfake_pipeline.py (not just the first 500 chars as before).
3. The pipeline runs 2–3 parallel Gemini Vision probes then a synthesiser:
     Image: GAN artifact scan + facial consistency → synthesiser
     Audio: prosody analysis + spectral fingerprint → synthesiser
     Video: visual artifacts + facial + temporal consistency → synthesiser
4. Each probe sees the actual media inline (up to ~11 MB). Larger files fall back
   to text-only analysis gracefully.
5. The response includes:
     is_deepfake / is_synthetic  — final verdict
     confidence                  — 0.0–1.0
     reasoning                   — synthesiser explanation
     stages                      — per-probe findings list for the frontend to display

TESTING
────────
  cd apps/backend && pytest tests/test_deepfake.py -v

  # Manual image test:
  base64 sample.jpg | tr -d '\\n' > /tmp/b64.txt
  curl -X POST http://localhost:8000/api/v1/deepfake/image \\
    -H 'Content-Type: application/json' \\
    -d "{\"image_b64\": \"$(cat /tmp/b64.txt)\", \"filename\": \"sample.jpg\"}"
"""

import logging

from fastapi import APIRouter, HTTPException, Request

from app.ai.deepfake_pipeline import DeepfakeResult, deepfake_pipeline, mime_from_filename
from app.core.rate_limit import limiter
from app.models.deepfake import (
    AnalysisStage,
    DeepfakeAudioRequest,
    DeepfakeAudioResponse,
    DeepfakeImageRequest,
    DeepfakeImageResponse,
    DeepfakeVideoRequest,
    DeepfakeVideoResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/deepfake", tags=["deepfake"])

_MAX_B64_CHARS = 67_000_000  # ~50 MB file → ~67 MB base64


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _validate_size(b64: str, label: str) -> None:
    if len(b64) > _MAX_B64_CHARS:
        raise HTTPException(
            status_code=413,
            detail=f"{label} exceeds the 50 MB file size limit.",
        )


def _to_stage_models(result: DeepfakeResult) -> list[AnalysisStage]:
    return [
        AnalysisStage(name=s.name, finding=s.finding, score=s.score)
        for s in result.stages
    ]


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.post("/image", response_model=DeepfakeImageResponse, status_code=200)
@limiter.limit("20/minute")
async def analyze_image(request: Request, payload: DeepfakeImageRequest):
    """
    Analyse a base64-encoded image for deepfake manipulation.

    Runs a 2-probe + synthesiser Gemini Vision pipeline:
      Probe A — GAN fingerprints, blending boundaries, compression inconsistencies
      Probe B — Eye/teeth anomalies, lighting physics, skin texture
      Synthesiser — Final calibrated verdict with both probe reports in context

    Returns is_deepfake + confidence (0–1) + reasoning + per-probe stages.
    """
    _validate_size(payload.image_b64, "Image")
    mime = mime_from_filename(payload.filename)

    try:
        result = await deepfake_pipeline.run_image(payload.image_b64, mime)
    except Exception as exc:
        logger.error("Image deepfake pipeline error: %s", exc, exc_info=True)
        return DeepfakeImageResponse(
            is_deepfake=False,
            confidence=0.5,
            reasoning="Analysis failed — result inconclusive.",
            stages=[],
        )

    return DeepfakeImageResponse(
        is_deepfake=result.is_fake,
        confidence=result.confidence,
        reasoning=result.reasoning,
        stages=_to_stage_models(result),
    )


@router.post("/audio", response_model=DeepfakeAudioResponse, status_code=200)
@limiter.limit("20/minute")
async def analyze_audio(request: Request, payload: DeepfakeAudioRequest):
    """
    Analyse base64-encoded audio for synthetic speech / voice cloning.

    Runs a 2-probe + synthesiser Gemini Vision pipeline:
      Probe A — Prosody: rhythm, breath patterns, stress, co-articulation
      Probe B — Spectral: vocoder artefacts, silence patterns, formant transitions
      Synthesiser — Final calibrated verdict

    Returns is_synthetic + confidence (0–1) + reasoning + per-probe stages.
    """
    _validate_size(payload.audio_b64, "Audio")
    mime = mime_from_filename(payload.filename)

    try:
        result = await deepfake_pipeline.run_audio(payload.audio_b64, mime)
    except Exception as exc:
        logger.error("Audio deepfake pipeline error: %s", exc, exc_info=True)
        return DeepfakeAudioResponse(
            is_synthetic=False,
            confidence=0.5,
            reasoning="Analysis failed — result inconclusive.",
            stages=[],
        )

    return DeepfakeAudioResponse(
        is_synthetic=result.is_fake,
        confidence=result.confidence,
        reasoning=result.reasoning,
        stages=_to_stage_models(result),
    )


@router.post("/video", response_model=DeepfakeVideoResponse, status_code=200)
@limiter.limit("20/minute")
async def analyze_video(request: Request, payload: DeepfakeVideoRequest):
    """
    Analyse base64-encoded video for deepfake manipulation.

    Runs a 3-probe + synthesiser Gemini Vision pipeline:
      Probe A — Visual artifact scan (GAN fingerprints, blending boundaries)
      Probe B — Facial consistency (eyes, lighting, skin texture)
      Probe C — Temporal consistency (inter-frame flicker, blink patterns, head-pose lag)
      Synthesiser — Final calibrated verdict

    Returns is_deepfake + confidence (0–1) + reasoning + per-probe stages.
    """
    _validate_size(payload.video_b64, "Video")
    mime = mime_from_filename(payload.filename)

    try:
        result = await deepfake_pipeline.run_video(payload.video_b64, mime)
    except Exception as exc:
        logger.error("Video deepfake pipeline error: %s", exc, exc_info=True)
        return DeepfakeVideoResponse(
            is_deepfake=False,
            confidence=0.5,
            reasoning="Analysis failed — result inconclusive.",
            stages=[],
        )

    return DeepfakeVideoResponse(
        is_deepfake=result.is_fake,
        confidence=result.confidence,
        reasoning=result.reasoning,
        stages=_to_stage_models(result),
    )
