"""
embeddings.py — Text embedding generation for Atlas Vector Search.

Supports two modes controlled by settings.ai_mock_mode:

  Real mode  (ai_mock_mode=False, gemini_api_key set)
    Calls Google's text-embedding-004 model via the google-genai SDK.
    Returns a 768-dimension unit-norm float vector.

  Mock mode  (ai_mock_mode=True OR no API key)
    Returns a deterministic 768-dimension unit-norm vector derived from
    a SHA-256 hash of the input text. Identical input always produces
    identical output — useful for tests and local development without
    an API key.

Usage
─────
    from app.services.embeddings import embed_text, EMBEDDING_DIM

    vec = await embed_text("Vaccine microchip conspiracy claims surge")
    # → list[float], len=768, unit-normalised

Atlas Vector Search index (create once in Atlas UI)
────────────────────────────────────────────────────
Collection: narratives
Index name: narrative_vector_index
JSON definition:
  {
    "fields": [
      { "type": "vector", "path": "embedding",
        "numDimensions": 768, "similarity": "cosine" },
      { "type": "filter", "path": "category" }
    ]
  }

Collection: heatmap_events
Index name: event_vector_index
JSON definition:
  {
    "fields": [
      { "type": "vector", "path": "embedding",
        "numDimensions": 768, "similarity": "cosine" },
      { "type": "filter", "path": "category" },
      { "type": "filter", "path": "region"   }
    ]
  }

Both can be created under Atlas → Search & Vectorize → Create Search Index
→ Atlas Vector Search → JSON Editor.
"""

import hashlib
import logging
import math
from typing import Optional

logger = logging.getLogger(__name__)

EMBEDDING_DIM = 768   # text-embedding-004 output dimension


def _mock_embedding(text: str) -> list[float]:
    """
    Deterministic 768-dim unit vector derived from the text's SHA-256 hash.

    Uses a linear congruential generator seeded from the hash so the output
    is always the same for the same input while being spread across [-1, 1].
    """
    seed = int(hashlib.sha256(text.encode("utf-8")).hexdigest(), 16)
    values: list[float] = []
    for _ in range(EMBEDDING_DIM):
        # LCG parameters from Numerical Recipes
        seed = (seed * 1_664_525 + 1_013_904_223) & 0xFFFF_FFFF
        values.append((seed / 0xFFFF_FFFF) * 2.0 - 1.0)          # → [-1, 1]

    # Normalise to unit length so cosine similarity is meaningful
    norm = math.sqrt(sum(v * v for v in values))
    return [v / norm for v in values]


async def embed_text(text: str, mock: Optional[bool] = None) -> list[float]:
    """
    Generate a 768-dimension embedding for `text`.

    Args:
        text:  Input string to embed.
        mock:  Override mock mode. If None, reads settings.ai_mock_mode.

    Returns:
        list[float] of length EMBEDDING_DIM (768), unit-normalised.

    Never raises — falls back to mock embedding on any API error.
    """
    # Resolve mock flag
    if mock is None:
        try:
            from app.core.config import settings
            mock = settings.ai_mock_mode or not settings.gemini_api_key
        except Exception:
            mock = True

    if mock:
        return _mock_embedding(text)

    try:
        from google import genai
        from app.core.config import settings

        client = genai.Client(api_key=settings.gemini_api_key)
        # text-embedding-004: 768 dims, use "text-embedding-004" (SDK adds models/ prefix)
        response = await client.aio.models.embed_content(
            model="text-embedding-004",
            contents=text,
        )
        values = list(response.embeddings[0].values)
        logger.debug("Embedded %d chars → %d-dim vector", len(text), len(values))
        return values

    except Exception as exc:
        logger.warning(
            "Embedding API call failed (%s: %s) — using mock embedding",
            type(exc).__name__,
            exc,
        )
        return _mock_embedding(text)


def build_narrative_text(title: str, category: str) -> str:
    """Canonical text representation of a narrative for embedding."""
    return f"{category}: {title}"


def build_event_text(label: str, category: str, severity: str) -> str:
    """Canonical text representation of a heatmap event for embedding."""
    return f"{severity} {category} activity detected in {label}"
