"""
spatial_artifact_detector.py — CNN-based spatial artifact detection for deepfakes.

Model: dima806/deepfake_vs_real_image_detection (HuggingFace)
  - EfficientNet-based architecture trained on ~140k face images
  - Binary classification: "Fake" / "Real"
  - Specialises in FACE-SWAP deepfake spatial artifacts:
      * texture irregularities at blending boundaries
      * GAN fingerprints in uniform skin/background regions
      * compositing seams (mismatched block-artefact patterns)
  - Complements umm-maybe/AI-image-detector (ViT):
      * ViT catches: AI-generated images from scratch (SD, MidJourney, DALL-E)
      * CNN catches: face-swap compositing artifacts, pixel-level manipulation

Design:
  - Lazy loading: model initialises on first call, not at import.
  - Thread-safe async: asyncio.to_thread() wraps sync PyTorch inference.
  - Mock mode: AI_MOCK_MODE=true returns canned result instantly.
  - Graceful fallback: any error returns score=0.5 / label="UNCERTAIN".
"""

import asyncio
import base64
import logging
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)

_MOCK_RESULT = {"score": 0.18, "label": "REAL"}


class SpatialArtifactDetector:
    """
    CNN-based deepfake detector focused on spatial pixel-level artifacts.

    Complementary to CvDeepfakeDetector (ViT / umm-maybe):
      - ViT model: detects AI-generated images (diffusion / GAN from scratch)
      - CNN model: detects face-swap deepfakes via spatial artifact signatures
                   (EfficientNet trained on DFDC-style manipulations)

    Usage:
        result = await spatial_detector.detect_image(image_b64)
        # result = {"score": 0.91, "label": "FAKE"}
        # score: 0.0 = real, 1.0 = face-swap / spatial artifact detected
    """

    def __init__(self):
        self._pipe = None
        self._load_attempted = False

    # ── Model loading ──────────────────────────────────────────────────────────

    def _load(self) -> bool:
        """
        Load the HuggingFace EfficientNet pipeline.
        Returns True on success, False on failure.
        Called at most once (guarded by _load_attempted).
        """
        if self._load_attempted:
            return self._pipe is not None

        self._load_attempted = True
        try:
            from transformers import pipeline as hf_pipeline

            logger.info("Loading spatial artifact CNN (dima806/deepfake_vs_real_image_detection)…")
            self._pipe = hf_pipeline(
                "image-classification",
                model="dima806/deepfake_vs_real_image_detection",
                device="cpu",
            )
            logger.info("Spatial artifact CNN loaded successfully.")
            return True
        except Exception as exc:
            logger.error("Failed to load spatial artifact CNN: %s", exc)
            self._pipe = None
            return False

    # ── Synchronous inference ──────────────────────────────────────────────────

    def _detect_sync(self, image_b64: str) -> dict:
        """
        Decode base64 image, run EfficientNet inference, return normalised score.

        Returns:
            {"score": float 0–1, "label": "FAKE"|"REAL"}
            score = probability the image contains face-swap / compositing artifacts
        """
        if not self._load():
            return {"score": 0.5, "label": "UNCERTAIN"}

        try:
            from PIL import Image

            img_bytes = base64.b64decode(image_b64)
            img = Image.open(BytesIO(img_bytes)).convert("RGB")

            results = self._pipe(img)
            # dima806 outputs: [{"label": "Fake", "score": 0.91}, {"label": "Real", "score": 0.09}]

            fake_entry = next(
                (r for r in results if r["label"].lower() in ("fake", "deepfake", "ai", "artificial")),
                None,
            )
            real_entry = next(
                (r for r in results if r["label"].lower() in ("real", "genuine", "authentic")),
                None,
            )

            if fake_entry is not None:
                fake_score = float(fake_entry["score"])
            elif real_entry is not None:
                fake_score = 1.0 - float(real_entry["score"])
            else:
                fake_score = 0.5

            label = "FAKE" if fake_score >= 0.5 else "REAL"
            return {"score": round(fake_score, 4), "label": label}

        except Exception as exc:
            logger.warning("Spatial artifact inference error: %s", exc)
            return {"score": 0.5, "label": "UNCERTAIN"}

    # ── Public async API ───────────────────────────────────────────────────────

    async def detect_image(self, image_b64: str) -> dict:
        """
        Async wrapper: runs sync EfficientNet inference in a thread pool.

        Returns:
            {"score": float 0–1, "label": "FAKE"|"REAL"|"UNCERTAIN"}
        """
        if settings.ai_mock_mode:
            return _MOCK_RESULT

        try:
            return await asyncio.to_thread(self._detect_sync, image_b64)
        except Exception as exc:
            logger.warning("Spatial artifact async wrapper error: %s", exc)
            return {"score": 0.5, "label": "UNCERTAIN"}


# Module-level singleton — imported by deepfake_pipeline.py
spatial_detector = SpatialArtifactDetector()
