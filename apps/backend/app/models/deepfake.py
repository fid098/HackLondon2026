"""
deepfake.py — Pydantic models for Phase 5 Deepfake Detection API.

Three detection modalities:
  - Image: 2-probe Gemini Vision pipeline — GAN/artifact scan + facial consistency
  - Audio: 2-probe Gemini Vision pipeline — prosody analysis + spectral fingerprint
  - Video: 3-probe Gemini Vision pipeline — visual artifacts + facial + temporal consistency

Each response now includes an `stages` list so the frontend can show per-probe
detail alongside the final verdict.
"""

from pydantic import BaseModel, Field


# ── Shared sub-models ───────────────────────────────────────────────────────────

class AnalysisStage(BaseModel):
    """One step in the deepfake detection pipeline (probe or synthesiser)."""

    name: str    # e.g. "GAN & Artifact Scan", "Temporal Consistency Analysis"
    finding: str # one-sentence summary from this step
    score: float # 0.0 = clean/genuine, 1.0 = definitely manipulated


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

    is_deepfake: bool               # True = manipulated / AI-generated
    confidence:  float              # 0.0 – 1.0
    reasoning:   str                # brief explanation of the verdict
    stages: list[AnalysisStage] = Field(default_factory=list)  # per-probe detail


class DeepfakeAudioResponse(BaseModel):
    """Result of audio synthetic-speech detection."""

    is_synthetic: bool              # True = voice-cloned / TTS-generated
    confidence:   float             # 0.0 – 1.0
    reasoning:    str
    stages: list[AnalysisStage] = Field(default_factory=list)


class DeepfakeVideoResponse(BaseModel):
    """Result of video deepfake analysis."""

    is_deepfake: bool               # True = deepfake / face-swapped
    confidence:  float              # 0.0 – 1.0
    reasoning:   str
    stages: list[AnalysisStage] = Field(default_factory=list)
