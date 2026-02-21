"""
FactCheckAdapter — Google Fact Check Tools API.

Searches for existing human-verified fact-checks on a given claim/query.
Used as an additional signal before or alongside the AI Agent Debate.

Graceful degradation: returns [] if GOOGLE_FACT_CHECK_API_KEY is unset.

API docs: https://developers.google.com/fact-check/tools/api/reference/rest
"""

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

FACT_CHECK_BASE_URL = "https://factchecktools.googleapis.com/v1alpha1/claims:search"


class FactCheckAdapter:
    """
    Adapter for the Google Fact Check Tools API.

    Cross-references a claim against claims already reviewed by professional
    fact-checkers (e.g., Snopes, PolitiFact, AFP). Provides an independent
    signal separate from the AI debate pipeline.

    The returned claimReview objects include: publisher, title, url,
    textualRating, languageCode — all of which enrich the final report.
    """

    def __init__(self) -> None:
        self.api_key = settings.google_fact_check_api_key
        self.enabled = bool(self.api_key)

        if not self.enabled:
            logger.warning(
                "GOOGLE_FACT_CHECK_API_KEY not set — fact check API disabled. "
                "Pipeline will rely solely on AI debate for verdicts."
            )

    async def search(
        self,
        query: str,
        language: str = "en",
        max_results: int = 5,
    ) -> list[dict[str, Any]]:
        """
        Search for fact-checked claims matching the query.

        Args:
            query:       The claim text or search query.
            language:    BCP-47 language code filter.
            max_results: Maximum number of claim objects to return.

        Returns:
            List of claim objects. Each has: text, claimant, claimDate,
            claimReview (list with rating, url, publisher).
            Returns [] if not configured or on any API error.
        """
        if not self.enabled:
            return []

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.get(
                    FACT_CHECK_BASE_URL,
                    params={
                        "query": query,
                        "languageCode": language,
                        "pageSize": max_results,
                        "key": self.api_key,
                    },
                )
                response.raise_for_status()
                data = response.json()
                return data.get("claims", [])

            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Fact Check API error: %s — %s",
                    exc.response.status_code,
                    exc.response.text[:200],
                )
                return []
            except Exception as exc:
                logger.error("Fact Check API request failed: %s", exc)
                return []


# Module-level singleton
fact_check_adapter = FactCheckAdapter()
