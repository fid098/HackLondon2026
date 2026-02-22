"""
youtube.py — YouTube AI-content detection endpoint.

Route:
  POST /api/v1/youtube/analyze
    Accepts a YouTube URL, extracts transcript + metadata + thumbnail,
    runs the 3-agent debate pipeline (Defender / Prosecutor / Judge),
    and returns a verdict on whether the content is AI-generated.

HOW THE DATA FLOWS
──────────────────
1. Validate the URL is a YouTube link.
2. extract_youtube_full() fetches: transcript, title, channel, description,
   thumbnail (base64 JPEG from YouTube CDN).
3. youtube_pipeline.run() orchestrates:
     a. Thumbnail deepfake scan (deepfake_pipeline.run_image)
     b. Channel credibility Serper search
     c. Agent A (Defender) — argues HUMAN-CREATED
     d. Agent B (Prosecutor) — argues AI-GENERATED      (c and d run in parallel)
     e. Judge — issues AI_GENERATED / HUMAN_CREATED / UNCERTAIN verdict
4. Returns YouTubeAnalysisResponse.
"""

import logging
import re

from fastapi import APIRouter, HTTPException, Request

from app.ai.youtube_pipeline import youtube_pipeline
from app.core.rate_limit import limiter
from app.models.youtube import YouTubeAnalysisRequest, YouTubeAnalysisResponse
from app.services.content_extractor import extract_youtube_full

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/youtube", tags=["youtube"])

_YT_RE = re.compile(
    r"(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/shorts/)([A-Za-z0-9_-]{11})"
)


@router.post("/analyze", response_model=YouTubeAnalysisResponse, status_code=200)
@limiter.limit("10/minute")
async def analyze_youtube(request: Request, payload: YouTubeAnalysisRequest):
    """
    Analyse a YouTube video for AI-generated content.

    Runs a 3-agent debate (Defender / Prosecutor / Judge) on the video's
    transcript + metadata + thumbnail to determine:
      - AI_GENERATED  — strong evidence of AI script/voice/visuals
      - HUMAN_CREATED — strong evidence of genuine human creation
      - UNCERTAIN     — mixed or insufficient signals

    Returns verdict, confidence, per-side indicators, and full debate transcript.
    """
    if not _YT_RE.search(payload.url):
        raise HTTPException(
            status_code=422,
            detail="URL does not appear to be a valid YouTube link.",
        )

    # Extract rich metadata + thumbnail
    yt_data = await extract_youtube_full(payload.url)

    if not yt_data.video_id:
        raise HTTPException(
            status_code=422,
            detail="Could not extract video ID from the provided URL.",
        )

    # Run the pipeline
    try:
        result = await youtube_pipeline.run(yt_data)
    except Exception as exc:
        logger.error("YouTube pipeline error for %s: %s", payload.url, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis pipeline error: {exc}")

    return YouTubeAnalysisResponse(
        video_id=result.video_id,
        title=result.title,
        channel=result.channel,
        verdict=result.verdict,
        confidence=result.confidence,
        summary=result.summary,
        ai_indicators=result.ai_indicators,
        human_indicators=result.human_indicators,
        thumbnail_is_ai=result.thumbnail_is_ai,
        thumbnail_confidence=result.thumbnail_confidence,
        defender_argument=result.defender_argument,
        prosecutor_argument=result.prosecutor_argument,
        judge_reasoning=result.judge_reasoning,
        has_transcript=result.has_transcript,
        thumbnail_url=yt_data.thumbnail_url,
    )
