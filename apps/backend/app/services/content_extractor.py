"""
content_extractor.py — Extract plain text from URLs and YouTube videos.

Strategy:
  - YouTube URLs: fetch transcript via youtube-transcript-api if installed;
    fall back to page title + description scrape.
  - General URLs: fetch with httpx, strip HTML tags with a simple regex,
    return first ~8 000 chars (enough for a 32k-context Gemini prompt).
  - Text: returned as-is.

All errors are caught and a best-effort string is returned so the pipeline
never fails at the extraction stage.
"""

import base64
import logging
import re
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})"
)


@dataclass
class YouTubeData:
    """Rich YouTube video metadata returned by extract_youtube_full()."""
    video_id:      str
    url:           str
    title:         str = ""
    channel:       str = ""
    description:   str = ""
    transcript:    str = ""
    has_transcript: bool = False
    thumbnail_b64: str = ""           # base64 JPEG thumbnail (empty if download failed)
    thumbnail_url: str = ""

_SCRIPT_RE = re.compile(r"<script[^>]*>.*?</script>", re.DOTALL | re.IGNORECASE)
_STYLE_RE  = re.compile(r"<style[^>]*>.*?</style>",  re.DOTALL | re.IGNORECASE)
_TAG_RE    = re.compile(r"<[^>]+>")
_WS_RE     = re.compile(r"\s{3,}")
_MAX_LEN   = 8_000


def _is_youtube(url: str) -> bool:
    return bool(_YT_RE.search(url))


def _strip_html(html: str) -> str:
    # Remove script and style blocks first (including JSON-LD, inline JS, CSS)
    text = _SCRIPT_RE.sub(" ", html)
    text = _STYLE_RE.sub(" ", text)
    text = _TAG_RE.sub(" ", text)
    text = _WS_RE.sub("\n\n", text)
    return text.strip()


async def extract_from_url(url: str) -> str:
    """
    Fetch *url* and return the cleaned plain-text body (up to _MAX_LEN chars).

    Falls back to an empty string on network or parse errors.
    """
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            headers = {
                "User-Agent": (
                    "Mozilla/5.0 (compatible; TruthGuardBot/1.0; "
                    "+https://truthguard.ai/bot)"
                )
            }
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
            text = _strip_html(resp.text)
            return text[:_MAX_LEN]
    except Exception as exc:
        logger.warning("extract_from_url failed for %s: %s", url, exc)
        return f"[Could not fetch content from {url}]"


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
            from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore

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
            resp = await client.get(url)
            resp.raise_for_status()

        title_m = re.search(r"<title[^>]*>(.*?)</title>", resp.text, re.IGNORECASE | re.DOTALL)
        desc_m  = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
            resp.text, re.IGNORECASE,
        )
        title = _strip_html(title_m.group(1)) if title_m else "Unknown YouTube video"
        desc  = _strip_html(desc_m.group(1))  if desc_m  else ""
        return f"{title}\n\n{desc}"[:_MAX_LEN]
    except Exception as exc:
        logger.warning("YouTube scrape fallback failed for %s: %s", url, exc)
        return f"[Could not extract YouTube content from {url}]"


async def extract_youtube_full(url: str) -> YouTubeData:
    """
    Fetch rich metadata for a YouTube video: transcript, title, channel,
    description, and thumbnail (base64-encoded JPEG).

    Never raises — all failures are logged and safe defaults returned.
    """
    m = _YT_RE.search(url)
    if not m:
        return YouTubeData(video_id="", url=url)

    video_id = m.group(1)
    data = YouTubeData(video_id=video_id, url=url)

    # ── Transcript ──────────────────────────────────────────────────────────
    try:
        from youtube_transcript_api import YouTubeTranscriptApi  # type: ignore
        segments = YouTubeTranscriptApi.get_transcript(video_id)
        data.transcript = " ".join(s["text"] for s in segments)[:_MAX_LEN]
        data.has_transcript = True
    except ImportError:
        logger.debug("youtube-transcript-api not installed")
    except Exception as exc:
        logger.warning("Transcript fetch failed for %s: %s", video_id, exc)

    # ── Page metadata (title, channel, description) ─────────────────────────
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            html = resp.text

        title_m = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
        if title_m:
            data.title = _strip_html(title_m.group(1)).replace(" - YouTube", "").strip()

        # Channel name from itemprop or meta author
        ch_m = re.search(r'"author"\s*:\s*"([^"]{1,120})"', html)
        if ch_m:
            data.channel = ch_m.group(1)

        desc_m = re.search(
            r'<meta[^>]+name=["\']description["\'][^>]+content=["\'](.*?)["\']',
            html, re.IGNORECASE,
        )
        if desc_m:
            data.description = _strip_html(desc_m.group(1))[:500]

    except Exception as exc:
        logger.warning("YouTube page scrape failed for %s: %s", video_id, exc)

    # ── Thumbnail (maxresdefault → hqdefault fallback) ──────────────────────
    for res in ("maxresdefault", "hqdefault"):
        thumb_url = f"https://img.youtube.com/vi/{video_id}/{res}.jpg"
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                tr = await client.get(thumb_url)
                if tr.status_code == 200 and len(tr.content) > 5_000:
                    data.thumbnail_b64 = base64.b64encode(tr.content).decode()
                    data.thumbnail_url = thumb_url
                    break
        except Exception as exc:
            logger.debug("Thumbnail fetch %s failed: %s", thumb_url, exc)

    # Fallback transcript from title+description if no captions
    if not data.transcript and data.title:
        data.transcript = f"{data.title}\n\n{data.description}"

    return data


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
