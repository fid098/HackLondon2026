"""
deepfake.py — Pydantic models for Phase 5 Deepfake Detection API.

Three detection modalities:
  - Image: CNN + Gemini Pro VLM — detects face-swaps, GAN artifacts, composite images
  - Audio: SVM MFCC + Gemini Pro — detects voice cloning, synthetic speech
  - Video: Frame-sample image pipeline + temporal consistency — detects video deepfakes
"""

from pydantic import BaseModel, Field


# ── Request models ─────────────────────────────────────────────────────────────

class DeepfakeImageRequest(BaseModel):
    """Base64-encoded image submitted for deepfake analysis."""

    image_b64: str = Field(..., min_length=1, description="Base64-encoded image data (JPEG/PNG/WebP)")
    filename: str  = Field(default="image.jpg", description="Original filename (used for MIME hint)")


class DeepfakeAudioRequest(BaseModel):
    """Base64-encoded audio submitted for synthetic-speech detection."""

    audio_b64: str = Field(..., min_length=1, description="Base64-encoded audio data (MP3/WAV/OGG)")
    filename: str  = Field(default="audio.mp3", description="Original filename (used for MIME hint)")


class DeepfakeVideoRequest(BaseModel):
    """Base64-encoded video submitted for deepfake analysis."""

    video_b64: str = Field(..., min_length=1, description="Base64-encoded video data (MP4/WebM)")
    filename: str  = Field(default="video.mp4", description="Original filename (used for MIME hint)")


# ── Response models ────────────────────────────────────────────────────────────

class DeepfakeImageResponse(BaseModel):
    """Result of image deepfake analysis."""

    is_deepfake: bool   # True = manipulated / AI-generated
    confidence:  float  # 0.0 – 1.0
    reasoning:   str    # brief explanation of the verdict


class DeepfakeAudioResponse(BaseModel):
    """Result of audio synthetic-speech detection."""

    is_synthetic: bool  # True = voice-cloned / TTS-generated
    confidence:   float # 0.0 – 1.0
    reasoning:    str


class DeepfakeVideoResponse(BaseModel):
    """Result of video deepfake analysis."""

    is_deepfake: bool   # True = deepfake / face-swapped
    confidence:  float  # 0.0 – 1.0
    reasoning:   str
