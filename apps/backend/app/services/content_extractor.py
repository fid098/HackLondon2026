"""
content_extractor.py — Extract plain text from URLs and YouTube videos.

Strategy:
  - YouTube URLs: fetch transcript via youtube-transcript-api if installed;
    fall back to page title + description scrape.
  - General URLs: fetch with httpx, parse HTML with BeautifulSoup to extract
    just the article body (removes nav, header, footer, scripts, ads).
    Returns up to _MAX_LEN chars — enough for a 32k-context Gemini prompt.
  - Text: returned as-is.

All errors are caught and a best-effort string is returned so the pipeline
never fails at the extraction stage.
"""

import logging
import re

import httpx

logger = logging.getLogger(__name__)

_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})"
)

_MAX_LEN = 8_000

# CSS selectors tried in priority order to find the main article body.
_ARTICLE_SELECTORS = [
    "article",
    "main",
    '[role="main"]',
    ".article-body",
    ".article-content",
    ".post-content",
    ".entry-content",
    ".story-body",
    ".article__body",
    "#article-body",
    "#main-content",
]

# Elements that are never part of the article body.
_NOISE_TAGS = [
    "script", "style", "noscript", "nav", "header", "footer",
    "aside", "form", "figure", "figcaption", "button", "svg",
    "iframe", "ads", "advertisement",
]


def _is_youtube(url: str) -> bool:
    return bool(_YT_RE.search(url))


def _bs_parse(html: str) -> "BeautifulSoup":  # type: ignore[name-defined]
    """Parse html with BS4, falling back to html.parser if lxml is absent."""
    from bs4 import BeautifulSoup  # noqa: PLC0415

    for parser in ("lxml", "html.parser"):
        try:
            return BeautifulSoup(html, parser)
        except Exception:
            continue
    return BeautifulSoup(html, "html.parser")


def _extract_article_bs4(html: str) -> tuple[str, str]:
    """
    Return (title, body_text) from raw HTML using BeautifulSoup.

    Tries semantic selectors first, then falls back to collecting all
    paragraphs longer than 40 chars.
    """
    soup = _bs_parse(html)

    # Remove noise
    for tag in soup(_NOISE_TAGS):
        tag.decompose()

    title = ""
    if soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Try og:title for a cleaner title
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()

    # Try semantic article containers first
    body = ""
    for selector in _ARTICLE_SELECTORS:
        el = soup.select_one(selector)
        if el:
            body = el.get_text(separator=" ", strip=True)
            if len(body) > 200:
                break

    # Fallback: aggregate paragraphs
    if not body:
        paras = soup.find_all("p")
        body = " ".join(
            p.get_text(separator=" ", strip=True)
            for p in paras
            if len(p.get_text(strip=True)) > 40
        )

    return title, body[:_MAX_LEN]


_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/122.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    "Accept-Encoding": "gzip, deflate, br",
    "Referer": "https://www.google.com/",
    "DNT": "1",
    "Upgrade-Insecure-Requests": "1",
}


async def extract_from_url(url: str) -> str:
    """
    Fetch *url* and return cleaned plain-text body (up to _MAX_LEN chars).

    Used by the existing factcheck pipeline — returns a plain str.
    Falls back to an empty string on network or parse errors.
    """
    _, content = await _fetch_structured(url)
    return content or f"[Could not fetch content from {url}]"


async def _fetch_structured(url: str) -> tuple[str, str]:
    """Internal: return (title, content) for any non-YouTube URL."""
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()
            title, content = _extract_article_bs4(resp.text)
            return title, content
    except Exception as exc:
        logger.warning("_fetch_structured failed for %s: %s", url, exc)
        return "", f"[Could not fetch content from {url}]"


async def extract_title_only(url: str) -> str:
    """
    Fetch just the page title (og:title or <title>) with a short timeout.

    Used in mock mode to personalise responses without a full article scrape.
    Returns an empty string on any failure.
    """
    try:
        async with httpx.AsyncClient(timeout=5, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()
        soup = _bs_parse(resp.text)
        og = soup.find("meta", property="og:title")
        if og and og.get("content"):
            return og["content"].strip()
        if soup.title and soup.title.string:
            return soup.title.string.strip()
    except Exception as exc:
        logger.debug("extract_title_only failed for %s: %s", url, exc)
    return ""


async def extract_article_for_triage(url: str) -> tuple[str, str]:
    """
    Return (title, body_text) suitable for a triage Gemini prompt.

    Handles YouTube separately (transcript); everything else goes through
    the BeautifulSoup article extractor.
    """
    if _is_youtube(url):
        content = await extract_from_youtube(url)
        return "YouTube video", content
    return await _fetch_structured(url)


async def extract_from_youtube(url: str) -> str:
    """
    Extract transcript from a YouTube video URL.

    Tries youtube-transcript-api first; falls back to page-scrape.
    Returns transcript text (up to _MAX_LEN chars).
    """
    video_id = None
    m = _YT_RE.search(url)
    if m:
        video_id = m.group(1)

    # Try youtube-transcript-api (optional dependency)
    if video_id:
        try:
            from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore  # noqa: PLC0415

            transcript = YouTubeTranscriptApi.get_transcript(video_id)
            text = " ".join(seg["text"] for seg in transcript)
            return text[:_MAX_LEN]
        except ImportError:
            logger.debug("youtube-transcript-api not installed, falling back to scrape")
        except Exception as exc:
            logger.warning("YouTube transcript fetch failed for %s: %s", video_id, exc)

    # Fallback: scrape the page for title + description meta tags
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()

        soup = _bs_parse(resp.text)
        title = soup.title.string.strip() if (soup.title and soup.title.string) else "Unknown YouTube video"
        desc_tag = soup.find("meta", attrs={"name": "description"})
        desc = desc_tag["content"].strip() if desc_tag and desc_tag.get("content") else ""
        return f"{title}\n\n{desc}"[:_MAX_LEN]
    except Exception as exc:
        logger.warning("YouTube scrape fallback failed for %s: %s", url, exc)
        return f"[Could not extract YouTube content from {url}]"


async def extract_content(source_type: str, url: str | None, text: str | None) -> str:
    """
    Unified entry point used by the factcheck pipeline.

    Returns a plain-text string suitable for feeding into Gemini.
    """
    if source_type == "url" and url:
        if _is_youtube(url):
            return await extract_from_youtube(url)
        return await extract_from_url(url)

    if source_type == "text" and text:
        return text[:_MAX_LEN]

    # Media type: callers should pre-convert to text before reaching here
    return text or "[No extractable text content]"
