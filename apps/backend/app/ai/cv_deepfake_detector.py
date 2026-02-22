"""
cv_deepfake_detector.py — Purpose-built CV/ML deepfake detection using a
Vision Transformer (ViT) fine-tuned on real/fake image datasets.

Model: umm-maybe/AI-image-detector (HuggingFace)
  - Trained on Stable Diffusion 1.4/1.5/2.0/2.1, MidJourney, DALL-E 2, GAN outputs
  - Binary classification: "artificial" / "real"
  - Covers AI-generated art AND GAN manipulations (broader than face-swap-only models)
  - ~350 MB download, cached at ~/.cache/huggingface/ after first use

Design:
  - Lazy loading: model is not loaded at import time; it initialises on the
    first call to detect_image(). This keeps startup fast.
  - Thread-safe async: PyTorch inference is synchronous; asyncio.to_thread()
    wraps it so the FastAPI event loop is never blocked.
  - Mock mode: if AI_MOCK_MODE=true, returns a canned result immediately
    without downloading or loading the model.
  - Graceful fallback: any error (download failure, decode error, OOM) returns
    score=0.5 / label="UNCERTAIN" so the rest of the pipeline continues.
"""

import asyncio
import base64
import logging
from io import BytesIO

from app.core.config import settings

logger = logging.getLogger(__name__)

# Mock result returned when AI_MOCK_MODE=true
_MOCK_RESULT = {"score": 0.12, "label": "REAL"}


class CvDeepfakeDetector:
    """
    Wraps the HuggingFace ViT deepfake classification pipeline.

    Usage:
        result = await cv_detector.detect_image(image_b64)
        # result = {"score": 0.87, "label": "FAKE"}
        # score: 0.0 = definitely real, 1.0 = definitely fake
    """

    def __init__(self):
        self._pipe = None       # HuggingFace pipeline, loaded lazily
        self._load_attempted = False  # Avoid retrying after a failed load

    # ── Model loading ─────────────────────────────────────────────────────────

    def _load(self) -> bool:
        """
        Load the HuggingFace image-classification pipeline.
        Returns True on success, False on failure.
        Called at most once (guarded by _load_attempted).
        """
        if self._load_attempted:
            return self._pipe is not None

        self._load_attempted = True
        try:
            from transformers import pipeline as hf_pipeline

            logger.info("Loading CV deepfake model (umm-maybe/AI-image-detector)…")
            self._pipe = hf_pipeline(
                "image-classification",
                model="umm-maybe/AI-image-detector",
                device="cpu",
            )
            logger.info("CV deepfake model loaded successfully.")
            return True
        except Exception as exc:
            logger.error("Failed to load CV deepfake model: %s", exc)
            self._pipe = None
            return False

    # ── Synchronous inference ─────────────────────────────────────────────────

    def _detect_sync(self, image_b64: str) -> dict:
        """
        Decode base64 image, run ViT inference, return normalised score.

        Returns:
            {"score": float 0–1, "label": "FAKE"|"REAL"}
            score = probability the image is FAKE (1.0 = definitely fake)
        """
        if not self._load():
            return {"score": 0.5, "label": "UNCERTAIN"}

        try:
            from PIL import Image

            img_bytes = base64.b64decode(image_b64)
            img = Image.open(BytesIO(img_bytes)).convert("RGB")

            results = self._pipe(img)
            # results is a list like:
            # [{"label": "Fake", "score": 0.923}, {"label": "Real", "score": 0.077}]

            # Find the "Fake" entry regardless of capitalisation.
            # umm-maybe/AI-image-detector uses "artificial" / "real" labels.
            # dima806 fallback uses "fake" / "real" labels.
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
                # Fallback: take 1 - highest score for the first label
                fake_score = 0.5

            label = "FAKE" if fake_score >= 0.5 else "REAL"
            return {"score": round(fake_score, 4), "label": label}

        except Exception as exc:
            logger.warning("CV deepfake inference error: %s", exc)
            return {"score": 0.5, "label": "UNCERTAIN"}

    # ── Public async API ──────────────────────────────────────────────────────

    async def detect_image(self, image_b64: str) -> dict:
        """
        Async wrapper: runs sync inference in a thread pool so the event loop
        is not blocked during model forward pass.

        Returns:
            {"score": float 0–1, "label": "FAKE"|"REAL"|"UNCERTAIN"}
        """
        if settings.ai_mock_mode:
            return _MOCK_RESULT

        try:
            return await asyncio.to_thread(self._detect_sync, image_b64)
        except Exception as exc:
            logger.warning("CV deepfake async wrapper error: %s", exc)
            return {"score": 0.5, "label": "UNCERTAIN"}


# Module-level singleton — imported by deepfake_pipeline.py
cv_detector = CvDeepfakeDetector()
