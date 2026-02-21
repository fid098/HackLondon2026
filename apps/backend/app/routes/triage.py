"""
triage.py — Phase 4 Quick Triage endpoint (Chrome Extension).

Route:
  POST /api/v1/triage — single Gemini Flash call, no debate pipeline.

Unlike /factcheck (3-agent debate, ~10 s), this makes one Flash call (~1 s)
and is designed for the Chrome extension's real-time post scanning.
No authentication required — the extension triage is intentionally public.

When the submitted text looks like a URL (starts with "URL: "), the endpoint
fetches the actual page content and sends that to Gemini instead of just the
URL string, producing far more accurate verdicts in real (non-mock) mode.
"""

import json
import logging
import re

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.ai.gemini_client import gemini_client
from app.core.rate_limit import limiter
from app.services.content_extractor import extract_article_for_triage, extract_title_only

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/triage", tags=["triage"])

_URL_PATTERN = re.compile(r"https?://\S+")

# Social-media domains that rarely have extractable article body text.
# For these, we skip content extraction and fall back to URL-only analysis.
_SKIP_EXTRACTION = {
    "twitter.com", "x.com",
    "instagram.com",
    "tiktok.com",
    "facebook.com", "fb.com",
    "reddit.com",
    "telegram.org",
}


def _should_skip_extraction(url: str) -> bool:
    try:
        from urllib.parse import urlparse  # noqa: PLC0415
        host = urlparse(url).hostname or ""
        host = host.lstrip("www.")
        return any(host == d or host.endswith("." + d) for d in _SKIP_EXTRACTION)
    except Exception:
        return False


def _mock_key_for_text(text: str) -> str:
    """Pick a platform-specific mock response key based on URL patterns in text."""
    m = _URL_PATTERN.search(text)
    if not m:
        return "quick_triage"
    url = m.group().lower()
    if "youtube.com" in url or "youtu.be" in url:
        return "quick_triage_youtube"
    if "tiktok.com" in url:
        return "quick_triage_tiktok"
    if "twitter.com" in url or "x.com" in url:
        return "quick_triage_twitter"
    if "instagram.com" in url:
        return "quick_triage_instagram"
    if "reddit.com" in url:
        return "quick_triage_reddit"
    if "facebook.com" in url or "fb.com" in url:
        return "quick_triage_facebook"
    return "quick_triage_article"


# Five varied article mock templates. Picked deterministically by
# hash(url) % len so the same URL always returns the same verdict,
# but different articles get different results.
_ARTICLE_MOCK_TEMPLATES = [
    {
        "verdict": "TRUE",
        "confidence": 88,
        "summary": (
            '"{title}" — The core claims are well-sourced. Three independent '
            "fact-checkers have verified the primary statistics and the "
            "publication has a strong editorial track record."
        ),
    },
    {
        "verdict": "MISLEADING",
        "confidence": 67,
        "summary": (
            '"{title}" — The article contains accurate background information '
            "but the headline overstates the findings. The cited study is real, "
            "but applies only to a narrow sub-group, not the general population."
        ),
    },
    {
        "verdict": "UNVERIFIED",
        "confidence": 42,
        "summary": (
            '"{title}" — Key claims could not be independently verified. '
            "The primary source is paywalled and the statistics appear "
            "unconfirmed by any secondary reporting."
        ),
    },
    {
        "verdict": "FALSE",
        "confidence": 79,
        "summary": (
            '"{title}" — The central claim has been debunked by AP Fact Check '
            "and Reuters. The statistic quoted was taken from a retracted paper "
            "that has since been corrected by the original authors."
        ),
    },
    {
        "verdict": "MISLEADING",
        "confidence": 58,
        "summary": (
            '"{title}" — Selectively quotes a real expert but omits the full '
            "context of their statement. The expert subsequently clarified that "
            "the article misrepresents their position."
        ),
    },
]


_TRIAGE_PROMPT_URL = """\
You are an AI content integrity analyst specialising in misinformation and AI-generated media detection.

Analyse the article below and answer these questions:
1. Are the factual claims accurate and well-supported?
2. Does the writing style, phrasing, or structure suggest AI generation (e.g. repetitive phrasing, unnaturally smooth prose, lack of original reporting, hallucinated citations)?
3. Is context missing or selectively presented to mislead the reader?
4. Are there signs of synthetic or manipulated media described in the content?

SOURCE URL: {url}
PAGE TITLE: {title}

PAGE CONTENT:
{content}

Classify the content using these verdicts:
- TRUE: Claims are accurate and well-sourced; no signs of AI fabrication or manipulation.
- FALSE: Contains provably false claims or fabricated facts.
- MISLEADING: Technically accurate but omits critical context, cherry-picks data, or frames facts to create a false impression.
- AI_GENERATED: Content appears to be AI-written with hallucinated, unverifiable, or fabricated claims.
- UNVERIFIED: Cannot be confirmed or denied without further investigation.
- SATIRE: Clearly satirical or parody content.

Respond with valid JSON and nothing else:
{{
  "verdict": "<TRUE|FALSE|MISLEADING|AI_GENERATED|UNVERIFIED|SATIRE>",
  "confidence": <integer 0-100>,
  "summary": "<one or two sentences: state whether it appears human-authored or AI-generated, and whether the claims are accurate, misleading, or unverifiable>"
}}"""

_TRIAGE_PROMPT_TEXT = """\
You are an AI content integrity analyst specialising in misinformation and AI-generated content detection.

Analyse the following text and answer:
1. Do the claims appear factually accurate?
2. Does the writing style, structure, or phrasing suggest AI generation (e.g. generic filler phrases, unnaturally fluent prose, no specific sources, vague authority references)?
3. Is important context omitted or is the framing designed to mislead?

TEXT:
{text}

Classify using these verdicts:
- TRUE: Accurate, well-supported, and appears human-authored.
- FALSE: Contains provably false or fabricated claims.
- MISLEADING: Omits key context or frames accurate facts to create a false impression.
- AI_GENERATED: Text appears AI-written with unverifiable, hallucinated, or fabricated content.
- UNVERIFIED: Cannot be confirmed or denied.
- SATIRE: Clearly satirical or parody content.

Respond with valid JSON and nothing else:
{{
  "verdict": "<TRUE|FALSE|MISLEADING|AI_GENERATED|UNVERIFIED|SATIRE>",
  "confidence": <integer 0-100>,
  "summary": "<one or two sentences: state whether it appears human-authored or AI-generated, and whether the claims hold up>"
}}"""


class TriageRequest(BaseModel):
    text: str = Field(..., min_length=10, max_length=2000, description="Text to triage")


class TriageResponse(BaseModel):
    verdict: str     # TRUE | FALSE | MISLEADING | UNVERIFIED | SATIRE
    confidence: int  # 0–100
    summary: str


def _mock_article_response(url: str, title: str) -> TriageResponse:
    """Return a deterministic, title-personalised mock article verdict."""
    template = _ARTICLE_MOCK_TEMPLATES[hash(url) % len(_ARTICLE_MOCK_TEMPLATES)]
    display_title = title if title else url
    return TriageResponse(
        verdict=template["verdict"],
        confidence=template["confidence"],
        summary=template["summary"].format(title=display_title[:80]),
    )


def _parse_response(raw: str) -> TriageResponse | None:
    """Try to extract a TriageResponse from a raw Gemini reply string."""
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            data = json.loads(m.group())
            return TriageResponse(
                verdict=str(data.get("verdict", "UNVERIFIED")).upper(),
                confidence=max(0, min(100, int(data.get("confidence", 30)))),
                summary=str(data.get("summary", "Triage complete.")),
            )
        except (json.JSONDecodeError, ValueError, TypeError):
            pass

    # Keyword fallback
    upper = raw.upper()
    for v in ("AI_GENERATED", "TRUE", "FALSE", "MISLEADING", "SATIRE"):
        if v in upper:
            return TriageResponse(verdict=v, confidence=50, summary=raw[:200])

    return None


@router.post("", response_model=TriageResponse, status_code=200)
@limiter.limit("60/minute")
async def quick_triage(request: Request, payload: TriageRequest):
    """
    Fast single-model fact-check using Gemini Flash.

    Returns verdict + confidence in ~1 s vs the full debate pipeline's ~10 s.
    Intended for Chrome extension content-script real-time triaging.

    When the text contains a URL and the site supports extraction (news articles,
    YouTube transcripts), the page content is fetched and analysed rather than
    just the URL string alone.
    """
    mock_key = _mock_key_for_text(payload.text)

    # ── Build the prompt ──────────────────────────────────────────────────────
    url_match = _URL_PATTERN.search(payload.text)
    prompt: str

    if url_match and not gemini_client.mock_mode:
        url = url_match.group()
        if _should_skip_extraction(url):
            # Social media — no useful body content to scrape, use text prompt
            prompt = _TRIAGE_PROMPT_TEXT.format(text=payload.text[:2000])
        else:
            title, content = await extract_article_for_triage(url)
            if content and not content.startswith("[Could not"):
                prompt = _TRIAGE_PROMPT_URL.format(
                    url=url,
                    title=title or "Unknown",
                    content=content[:6000],  # Leave room for prompt wrapper
                )
            else:
                # Extraction failed — fall back to URL-only prompt
                logger.warning("Content extraction failed for %s, falling back to text prompt", url)
                prompt = _TRIAGE_PROMPT_TEXT.format(text=payload.text[:2000])

    elif url_match and gemini_client.mock_mode and mock_key == "quick_triage_article":
        # Mock mode + article URL: fetch just the title so the response
        # references the real page name rather than being generic.
        url = url_match.group()
        title = await extract_title_only(url)
        return _mock_article_response(url, title)

    else:
        # Mock mode (social/video/plain text) OR no URL — use plain text prompt
        prompt = _TRIAGE_PROMPT_TEXT.format(text=payload.text[:2000])

    # ── Call Gemini ───────────────────────────────────────────────────────────
    try:
        raw = await gemini_client.generate_with_flash(prompt, response_key=mock_key)
    except Exception as exc:
        msg = str(exc)
        if "429" in msg or "quota" in msg.lower() or "resource exhausted" in msg.lower():
            raise HTTPException(
                status_code=429,
                detail="Gemini rate limit reached — please try again shortly.",
            )
        raise

    result = _parse_response(raw)
    if result:
        return result

    return TriageResponse(verdict="UNVERIFIED", confidence=20, summary="Unable to parse AI response.")
