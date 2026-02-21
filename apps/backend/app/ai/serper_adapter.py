"""
SerperAdapter — Web search via Serper.dev API.

Used by the fact-check debate agents to retrieve live evidence.

Graceful degradation: if SERPER_API_KEY is not set, all search calls
return an empty list with a logged warning. The pipeline continues with
degraded quality (AI relies on training data only).

To swap to a different search provider (SerpAPI, Brave, Bing):
  1. Implement the same `search()` interface
  2. Update the module-level singleton alias
"""

import logging
from typing import Any

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

SERPER_BASE_URL = "https://google.serper.dev"


class SerperAdapter:
    """
    Thin async wrapper around the Serper.dev REST API.

    Serper.dev provides Google Search results via a simple POST endpoint.
    Returns organic results with title, link, and snippet — suitable for
    feeding into the AI debate agents as source context.
    """

    def __init__(self) -> None:
        self.api_key = settings.serper_api_key
        self.enabled = bool(self.api_key)

        if not self.enabled:
            logger.warning(
                "SERPER_API_KEY not set — web search disabled. "
                "Fact-checking will work but AI agents won't have live search results."
            )

    async def search(
        self,
        query: str,
        num_results: int = 5,
        search_type: str = "search",  # "search" | "news" | "images"
    ) -> list[dict[str, Any]]:
        """
        Run a Google search via Serper.

        Args:
            query:       Search query string.
            num_results: Number of results to return (max 10 free tier).
            search_type: Serper endpoint type.

        Returns:
            List of organic result dicts with keys: title, link, snippet.
            Returns [] if not configured or on any error.
        """
        if not self.enabled:
            return []

        async with httpx.AsyncClient(timeout=10.0) as client:
            try:
                response = await client.post(
                    f"{SERPER_BASE_URL}/{search_type}",
                    headers={
                        "X-API-KEY": self.api_key,
                        "Content-Type": "application/json",
                    },
                    json={"q": query, "num": num_results},
                )
                response.raise_for_status()
                data = response.json()
                return data.get("organic", [])

            except httpx.HTTPStatusError as exc:
                logger.error(
                    "Serper API error: %s — %s",
                    exc.response.status_code,
                    exc.response.text[:200],
                )
                return []
            except Exception as exc:
                logger.error("Serper request failed: %s", exc)
                return []

    async def news_search(self, query: str, num_results: int = 5) -> list[dict[str, Any]]:
        """Convenience wrapper for news search."""
        return await self.search(query, num_results, search_type="news")


# Module-level singleton
serper_adapter = SerperAdapter()
