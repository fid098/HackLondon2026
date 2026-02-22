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
from bs4 import BeautifulSoup  # noqa: PLC0415
import base64
import logging
import re
from dataclasses import dataclass, field

import httpx

logger = logging.getLogger(__name__)

_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})"
)

_REDDIT_POST_RE = re.compile(r"reddit\.com/r/[^/]+/comments/")
_TWITTER_STATUS_RE = re.compile(r"(?:twitter\.com|x\.com)/[^/?]+/status/\d+")
_TIKTOK_VIDEO_RE = re.compile(r"tiktok\.com/@[^/?]+/video/\d+")

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


def _is_reddit_post(url: str) -> bool:
    """True only for specific post URLs (/r/<sub>/comments/...), not subreddit feeds."""
    return bool(_REDDIT_POST_RE.search(url))


def _is_twitter_post(url: str) -> bool:
    """True for individual tweet URLs (.../status/<id>)."""
    return bool(_TWITTER_STATUS_RE.search(url))


def _is_tiktok_video(url: str) -> bool:
    """True for individual TikTok video URLs (@user/video/<id>)."""
    return bool(_TIKTOK_VIDEO_RE.search(url))


def _bs_parse(html: str) -> "BeautifulSoup":  # type: ignore[name-defined]
    """Parse html with BS4, falling back to html.parser if lxml is absent."""
    

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
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Referer": "https://www.google.com/",
    "Sec-Ch-Ua": '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    "Sec-Ch-Ua-Mobile": "?0",
    "Sec-Ch-Ua-Platform": '"Windows"',
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "cross-site",
    "Sec-Fetch-User": "?1",
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
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
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


async def extract_from_twitter(url: str) -> tuple[str, str]:
    """
    Fetch tweet text via Twitter's public oEmbed API (no key needed).

    Works for individual tweet URLs only (twitter.com/.../status/<id>).
    The oEmbed response embeds the tweet as HTML; we strip tags to get plain text.
    """
    oembed_url = f"https://publish.twitter.com/oembed?url={url}&omit_script=true"
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            resp = await client.get(
                oembed_url,
                headers={"User-Agent": "TruthGuard/0.1 (content analysis bot)"},
            )
            resp.raise_for_status()
            data = resp.json()

        author = data.get("author_name", "")
        html = data.get("html", "")

        # Extract the tweet text from the <p> inside the blockquote
        tweet_text = ""
        if html:
            soup = _bs_parse(html)
            p = soup.find("p")
            if p:
                tweet_text = p.get_text(separator=" ", strip=True)

        if not tweet_text:
            return "", f"[Could not extract tweet text from {url}]"

        content = f"Author: {author}\nTweet: {tweet_text}"
        return f"Tweet by {author}", content

    except Exception as exc:
        logger.warning("Twitter oEmbed failed for %s: %s", url, exc)
        return "", f"[Could not extract tweet from {url}]"


async def extract_from_tiktok(url: str) -> tuple[str, str]:
    """
    Fetch TikTok video metadata via TikTok's public oEmbed API (no key needed).

    Works for individual video URLs only (@user/video/<id>).
    Returns the video title and author name — enough for meaningful analysis.
    """
    oembed_url = f"https://www.tiktok.com/oembed?url={url}"
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
            resp = await client.get(
                oembed_url,
                headers={"User-Agent": "TruthGuard/0.1 (content analysis bot)"},
            )
            resp.raise_for_status()
            data = resp.json()

        title = data.get("title", "").strip()
        author = data.get("author_name", "").strip()

        if not title and not author:
            return "", f"[Could not extract TikTok content from {url}]"

        content = f"Author: {author}\nVideo title: {title}"
        return title, content

    except Exception as exc:
        logger.warning("TikTok oEmbed failed for %s: %s", url, exc)
        return "", f"[Could not extract TikTok content from {url}]"


async def extract_from_reddit(url: str) -> tuple[str, str]:
    """
    Fetch a Reddit post's title and body via the public JSON API (no key needed).

    Appends .json to the post URL, which Reddit serves without authentication
    for public posts. Returns (title, content) where content is the post title,
    subreddit, and selftext body joined together.
    """
    json_url = url.split("?")[0].rstrip("/") + ".json"
    try:
        async with httpx.AsyncClient(timeout=10, follow_redirects=True) as client:
            resp = await client.get(
                json_url,
                headers={"User-Agent": "TruthGuard/0.1 (content analysis bot)"},
            )
            resp.raise_for_status()
            data = resp.json()

        # Reddit JSON: [post_listing, comments_listing]
        post = data[0]["data"]["children"][0]["data"]
        title = post.get("title", "")
        selftext = post.get("selftext", "").strip()
        subreddit = post.get("subreddit_name_prefixed", "")
        author = post.get("author", "")

        parts = [f"Title: {title}"]
        if subreddit:
            parts.append(f"Subreddit: {subreddit}")
        if author:
            parts.append(f"Posted by: u/{author}")
        if selftext and selftext not in ("[deleted]", "[removed]"):
            parts.append(f"\n{selftext}")

        content = "\n".join(parts)
        return title, content[:_MAX_LEN]

    except Exception as exc:
        logger.warning("Reddit JSON API failed for %s: %s", url, exc)
        return "", f"[Could not extract Reddit post from {url}]"


async def extract_article_for_triage(url: str) -> tuple[str, str]:
    """
    Return (title, body_text) suitable for a triage Gemini prompt.

    Platform-specific handlers (in priority order):
      - YouTube  → transcript via youtube-transcript-api, fallback to page scrape
      - Twitter/X → tweet text via public oEmbed API
      - TikTok   → video title/author via public oEmbed API
      - Reddit   → post title + body via public JSON API (post URLs only)
      - Everything else → BeautifulSoup article extractor
    """
    if _is_youtube(url):
        content = await extract_from_youtube(url)
        # Extract title from "Title: <name>\n..." formatted content
        title = "YouTube video"
        if content and not content.startswith("[Could not"):
            for line in content.splitlines():
                if line.startswith("Title: "):
                    title = line[7:].strip()
                    break
        return title, content
    if _is_twitter_post(url):
        return await extract_from_twitter(url)
    if _is_tiktok_video(url):
        return await extract_from_tiktok(url)
    if _is_reddit_post(url):
        return await extract_from_reddit(url)
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

    # Fallback 1: YouTube oEmbed API (public, no key needed, most reliable)
    if video_id:
        try:
            oembed_url = f"https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v={video_id}&format=json"
            async with httpx.AsyncClient(timeout=8, follow_redirects=True) as client:
                resp = await client.get(
                    oembed_url,
                    headers={"User-Agent": "TruthGuard/0.1 (content analysis bot)"},
                )
                resp.raise_for_status()
                data = resp.json()

            title = data.get("title", "").strip()
            author = data.get("author_name", "").strip()

            if title or author:
                parts = []
                if title:
                    parts.append(f"Title: {title}")
                if author:
                    parts.append(f"Channel: {author}")
                parts.append(f"Video ID: {video_id}")
                return "\n".join(parts)
        except Exception as exc:
            logger.warning("YouTube oEmbed failed for %s: %s", video_id, exc)

    # Fallback 2: scrape the page for og meta tags
    try:
        async with httpx.AsyncClient(timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, headers=_HEADERS)
            resp.raise_for_status()

        soup = _bs_parse(resp.text)

        # Prefer og:title (cleaner than <title> which appends " - YouTube")
        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            title = og_title["content"].strip()
        elif soup.title and soup.title.string:
            title = soup.title.string.strip().removesuffix(" - YouTube").strip()
        else:
            title = ""

        # og:description is populated by YouTube in server HTML
        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            desc = og_desc["content"].strip()
        else:
            desc_tag = soup.find("meta", attrs={"name": "description"})
            desc = desc_tag["content"].strip() if desc_tag and desc_tag.get("content") else ""

        parts = []
        if title:
            parts.append(f"Title: {title}")
        if desc:
            parts.append(f"Description: {desc}")
        if video_id:
            parts.append(f"Video ID: {video_id}")

        content = "\n".join(parts)
        if len(content) < 30:
            return f"[Could not extract YouTube content from {url}]"
        return content[:_MAX_LEN]
    except Exception as exc:
        logger.warning("YouTube scrape fallback failed for %s: %s", url, exc)
        return f"[Could not extract YouTube content from {url}]"


@dataclass
class YouTubeData:
    """Rich metadata container for a single YouTube video."""

    video_id:       str
    url:            str
    title:          str  = ""
    channel:        str  = ""
    description:    str  = ""
    transcript:     str  = ""
    has_transcript: bool = False
    thumbnail_b64:  str  = ""   # base64-encoded JPEG bytes
    thumbnail_url:  str  = ""


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

        soup = _bs_parse(html)

        og_title = soup.find("meta", property="og:title")
        if og_title and og_title.get("content"):
            data.title = og_title["content"].strip()
        elif soup.title and soup.title.string:
            data.title = soup.title.string.strip().removesuffix(" - YouTube").strip()

        # Channel name from author meta or JSON-LD
        ch_m = re.search(r'"author"\s*:\s*"([^"]{1,120})"', html)
        if ch_m:
            data.channel = ch_m.group(1)

        og_desc = soup.find("meta", property="og:description")
        if og_desc and og_desc.get("content"):
            data.description = og_desc["content"].strip()[:500]
        else:
            desc_tag = soup.find("meta", attrs={"name": "description"})
            if desc_tag and desc_tag.get("content"):
                data.description = desc_tag["content"].strip()[:500]

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
