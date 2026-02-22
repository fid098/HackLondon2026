"""
deepfake_pipeline.py — Multi-stage deepfake / synthetic-media detection pipeline.

Architecture (mirrors debate_pipeline.py but for visual/audio analysis):

  Image (3 steps):
    Probe A (parallel) — GAN & artifact scan: fingerprints, blending boundaries,
                         compression inconsistencies, background perspective errors.
    Probe B (parallel) — Facial consistency: eye/teeth anomalies, lighting physics,
                         skin texture, hair blending.
    Synthesiser        — Sees the image + both probe reports; issues final verdict.

  Audio (3 steps):
    Probe A (parallel) — Prosody: rhythm, breath patterns, co-articulation, stress.
    Probe B (parallel) — Spectral fingerprint: vocoder artefacts, silence patterns,
                         formant transitions, harmonic distortion.
    Synthesiser        — Sees the audio + both probe reports; issues final verdict.

  Video (4 steps):
    Probe A (parallel) — Visual artifact scan (same as image Probe A but on video).
    Probe B (parallel) — Facial consistency (same as image Probe B but on video).
    Probe C (parallel) — Temporal consistency: inter-frame flicker, blending mask
                         movement, eye-blink patterns, head-pose tracking lag.
    Synthesiser        — Sees the video + all three probe reports; issues final verdict.

In mock mode all steps return realistic canned responses so the full UI pipeline
works without API keys. In real mode each step makes a genuine Gemini Vision call
with the full media data inline (capped at ~11 MB; larger files fall back gracefully).
"""

import asyncio
import base64
import json
import logging
import re
from dataclasses import dataclass, field

from app.ai.cv_deepfake_detector import cv_detector
from app.ai.gemini_client import gemini_client
from app.ai.spatial_artifact_detector import spatial_detector

logger = logging.getLogger(__name__)


# ── Data classes ──────────────────────────────────────────────────────────────

@dataclass
class AnalysisStage:
    name: str     # e.g. "GAN & Artifact Scan"
    finding: str  # one-sentence summary from this probe/step
    score: float  # 0.0 = clean / genuine, 1.0 = definitely manipulated


@dataclass
class DeepfakeResult:
    is_fake: bool          # True = deepfake/synthetic
    confidence: float      # 0.0–1.0
    reasoning: str         # human-readable verdict explanation
    stages: list[AnalysisStage] = field(default_factory=list)
    media_type: str = "image"  # "image" | "audio" | "video"


# ── MIME type helper ──────────────────────────────────────────────────────────

_MIME_MAP = {
    ".jpg":  "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png":  "image/png",
    ".webp": "image/webp",
    ".gif":  "image/gif",
    ".mp3":  "audio/mpeg",
    ".wav":  "audio/wav",
    ".ogg":  "audio/ogg",
    ".m4a":  "audio/mp4",
    ".mp4":  "video/mp4",
    ".webm": "video/webm",
    ".mov":  "video/quicktime",
    ".avi":  "video/x-msvideo",
}


def mime_from_filename(filename: str) -> str:
    """Derive a MIME type from a filename extension."""
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return _MIME_MAP.get(ext, "application/octet-stream")


# ── Prompts ───────────────────────────────────────────────────────────────────

# ── Image probes ──────────────────────────────────────────────────────────────

_IMG_ARTIFACT_PROMPT = """\
You are an expert deepfake detector specialising in GAN, diffusion model, and compositing artefacts.

Carefully analyse this image for:
1. GAN fingerprints — repetitive texture patterns, grid-like high-frequency noise in uniform regions
2. Diffusion model smoothing — overly smooth skin lacking pore-level detail, HDR-style over-enhancement
3. Face-swap boundaries — blending halos, abrupt skin-tone shifts at jawline, hairline, or neck
4. Background inconsistencies — incorrect perspective lines, reflections that don't match the subject
5. Compression inconsistencies — mismatched JPEG/PNG block artefact patterns suggesting compositing

Respond with valid JSON only:
{{
  "suspicious": <true|false>,
  "score": <0.0 = definitely real, 1.0 = definitely manipulated>,
  "findings": ["specific observation 1", "specific observation 2"],
  "summary": "one sentence verdict"
}}"""

_IMG_FACIAL_PROMPT = """\
You are an expert deepfake detector specialising in facial anatomy and lighting physics.

Carefully analyse this image for:
1. Eye anomalies — asymmetric catchlights, absent specular highlights, distorted iris/pupil, glass-eye effect
2. Teeth irregularities — unnatural smoothness, absent inter-tooth shadows, inconsistent dentition
3. Lighting physics — catchlights must appear at identical angles in both eyes; mismatched lighting direction on face vs background
4. Skin texture — overly smooth or plastic-looking (diffusion); unnatural pore repetition (GAN)
5. Hair and edges — unnatural blending with background, missing strand-level detail, visible halo effect

Respond with valid JSON only:
{{
  "suspicious": <true|false>,
  "score": <0.0 = definitely real, 1.0 = definitely manipulated>,
  "findings": ["specific observation 1", "specific observation 2"],
  "summary": "one sentence verdict"
}}"""

_IMG_SYNTH_PROMPT = """\
You are the final adjudicator in a deepfake detection pipeline for an image.

Two specialist Gemini probes and two dedicated CV/ML models have already analysed this image:

PROBE A — GAN & Artifact Scan:
  Score: {probe_a_score}/1.0
  Findings:
{probe_a_findings}
  Summary: {probe_a_summary}

PROBE B — Facial Consistency Check:
  Score: {probe_b_score}/1.0
  Findings:
{probe_b_findings}
  Summary: {probe_b_summary}

CV MODEL (ViT) — AI-Generated Image Detector (umm-maybe, trained on SD/MidJourney/DALL-E/GANs):
  Label: {cv_label}
  Score: {cv_score}/1.0  (0 = real/natural, 1 = AI-generated)

SPATIAL CNN (EfficientNet) — Face-Swap Artifact Detector (dima806, trained on face-swap deepfakes):
  Label: {spatial_label}
  Score: {spatial_score}/1.0  (0 = no artifacts, 1 = spatial/compositing artifacts detected)

Now examine the image yourself and give the final verdict using majority-vote weighting across all 4 signals:

WEIGHTING RULES (in priority order):
1. If both Gemini probes score ≥ 0.70 AND both CNN scores < 0.30:
   → CNNs are likely false negatives for this image type; Trust Gemini; issue FAKE.
2. If Spatial CNN score ≥ 0.80: face-swap compositing artifacts confirmed; weight strongly for FAKE.
3. If ViT CV score ≥ 0.80: AI-generated content confirmed; weight strongly for FAKE.
4. If 3 or 4 signals agree on FAKE (score > 0.5): issue FAKE; confidence scales with agreement strength.
5. If 3 or 4 signals agree on REAL (score ≤ 0.5): issue REAL; confidence scales with agreement strength.
6. If signals are split 2-vs-2 or all conflict: issue UNCERTAIN (confidence 40–55).
7. NEVER let one low-confidence signal override three high-confidence opposing signals.

Respond with valid JSON only:
{{
  "is_fake": <true|false>,
  "confidence": <0.0 = definitely real, 1.0 = definitely fake>,
  "reasoning": "2–3 sentences explaining the final verdict referencing all four signals"
}}"""


# ── Audio probes ──────────────────────────────────────────────────────────────

_AUD_PROSODY_PROMPT = """\
You are an expert in detecting AI-synthesised speech and voice cloning.

Analyse this audio for prosody-level indicators of synthetic generation:
1. Rhythm anomalies — unnatural word-level timing, missing micro-pauses between phrases
2. Breath patterns — absent or mechanically regular inhalation sounds between sentences
3. Stress patterns — TTS often misplaces lexical stress; flat or over-regularised sentence stress
4. Emotional consistency — flat affect in emotionally-charged content, or unnatural emotion extremes
5. Co-articulation — clipped phoneme transitions at word boundaries typical of concatenative TTS

Respond with valid JSON only:
{{
  "suspicious": <true|false>,
  "score": <0.0 = definitely real speech, 1.0 = definitely synthetic>,
  "findings": ["specific observation 1", "specific observation 2"],
  "summary": "one sentence verdict"
}}"""

_AUD_SPECTRAL_PROMPT = """\
You are an expert in audio forensics specialising in neural vocoder fingerprints.

Analyse this audio for spectral indicators of AI generation:
1. Neural vocoder artefacts — smoothed spectral envelope typical of WaveNet/HiFi-GAN output
2. Silence patterns — real speech has irregular micro-silences; TTS silences are too uniform
3. Formant transitions — overly smooth F1/F2 formant transitions between vowels (TTS smoothing)
4. Background noise — real recordings have consistent room tone; spliced audio has discontinuous noise floors
5. Harmonic distortion — TTS models often produce slight harmonic distortion absent in real speech

Respond with valid JSON only:
{{
  "suspicious": <true|false>,
  "score": <0.0 = definitely real speech, 1.0 = definitely synthetic>,
  "findings": ["specific observation 1", "specific observation 2"],
  "summary": "one sentence verdict"
}}"""

_AUD_SYNTH_PROMPT = """\
You are the final adjudicator in a synthetic speech detection pipeline.

Two specialist probes have already analysed this audio:

PROBE A — Prosody Analysis:
  Score: {probe_a_score}/1.0
  Findings:
{probe_a_findings}
  Summary: {probe_a_summary}

PROBE B — Spectral Fingerprint Analysis:
  Score: {probe_b_score}/1.0
  Findings:
{probe_b_findings}
  Summary: {probe_b_summary}

Now listen to the audio yourself and give the final verdict.

Respond with valid JSON only:
{{
  "is_fake": <true|false>,
  "confidence": <0.0 = definitely real, 1.0 = definitely synthetic>,
  "reasoning": "2–3 sentences explaining the final verdict"
}}"""


# ── Video probes ──────────────────────────────────────────────────────────────

_VID_TEMPORAL_PROMPT = """\
You are an expert deepfake detector specialising in temporal video analysis.

Analyse this video for temporal inconsistencies indicating face-swap or AI generation:
1. Inter-frame flickering — facial region flickers while background remains stable (GAN refresh artefact)
2. Blending boundary movement — face-swap mask boundary shifts slightly between frames
3. Motion blur consistency — face motion blur should match head movement; inconsistency = compositing
4. Eye blink patterns — deepfakes often fail at natural blinks (too regular or entirely absent)
5. Head pose tracking — composite faces sometimes show slight position lag relative to head movement

Respond with valid JSON only:
{{
  "suspicious": <true|false>,
  "score": <0.0 = definitely real, 1.0 = definitely manipulated>,
  "findings": ["specific observation 1", "specific observation 2"],
  "summary": "one sentence verdict"
}}"""

_VID_SYNTH_PROMPT = """\
You are the final adjudicator in a video deepfake detection pipeline.

Three specialist Gemini probes and two dedicated CV/ML models have analysed this video:

PROBE A — Visual Artifact Scan:
  Score: {probe_a_score}/1.0
  Findings:
{probe_a_findings}
  Summary: {probe_a_summary}

PROBE B — Facial Consistency Check:
  Score: {probe_b_score}/1.0
  Findings:
{probe_b_findings}
  Summary: {probe_b_summary}

PROBE C — Temporal Consistency Analysis:
  Score: {probe_c_score}/1.0
  Findings:
{probe_c_findings}
  Summary: {probe_c_summary}

CV MODEL (ViT) — AI-Generated Image Detector on keyframe (umm-maybe, trained on SD/MidJourney/DALL-E/GANs):
  Label: {cv_label}
  Score: {cv_score}/1.0  (0 = real/natural, 1 = AI-generated)

SPATIAL CNN (EfficientNet) — Face-Swap Artifact Detector on keyframe (dima806, trained on face-swap deepfakes):
  Label: {spatial_label}
  Score: {spatial_score}/1.0  (0 = no spatial artifacts, 1 = compositing/face-swap artifacts detected)

Now examine the video yourself and give the final verdict using majority-vote weighting across all 5 signals:

WEIGHTING RULES (in priority order):
1. If all 3 Gemini probes score ≥ 0.60: strong FAKE consensus from temporal + visual analysis; weight heavily.
2. If Spatial CNN score ≥ 0.80: face-swap compositing artifacts confirmed in keyframe; weight strongly for FAKE.
3. If ViT CV score ≥ 0.80: AI-generated frame content confirmed; weight strongly for FAKE.
4. If both CNN models score ≥ 0.70: pixel-level manipulation confirmed; weight strongly for FAKE.
5. If 3 or more of the 5 signals agree on FAKE: issue FAKE; confidence scales with agreement strength.
6. If 4 or more signals agree on REAL (score ≤ 0.5): issue REAL with high confidence.
7. If CNN keyframe scores are UNCERTAIN (no extractable frame): rely entirely on Gemini probes.
8. If signals are evenly split with no clear majority: issue UNCERTAIN (confidence 40–55).
9. NEVER let one low-confidence signal override four high-confidence opposing signals.

Respond with valid JSON only:
{{
  "is_fake": <true|false>,
  "confidence": <0.0 = definitely real, 1.0 = definitely fake>,
  "reasoning": "2–3 sentences explaining the final verdict referencing the key signals"
}}"""


# ── Parsing helpers ────────────────────────────────────────────────────────────

def _parse_probe(raw: str) -> dict:
    """Parse a probe response; returns safe defaults on failure."""
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"suspicious": False, "score": 0.5, "findings": [], "summary": "Parse error — inconclusive."}


def _parse_synthesis(raw: str) -> dict:
    """Parse a synthesiser response; returns safe defaults on failure."""
    m = re.search(r"\{[\s\S]*\}", raw)
    if m:
        try:
            return json.loads(m.group())
        except json.JSONDecodeError:
            pass
    return {"is_fake": False, "confidence": 0.5, "reasoning": "Unable to parse synthesiser response."}


def _fmt_findings(findings: list) -> str:
    """Format a findings list as an indented bullet list for the synthesiser prompt."""
    if not findings:
        return "  - No specific findings recorded."
    return "\n".join(f"  - {f}" for f in findings)


def _clamp(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


# ── Pipeline ──────────────────────────────────────────────────────────────────

class DeepfakePipeline:
    """
    Orchestrates multi-stage deepfake and synthetic-media detection using Gemini Vision.

    Each media type runs 2–3 parallel specialist probes followed by a synthesiser
    that sees both the media AND the probe reports to produce a calibrated final verdict.
    """

    # ── Image ──────────────────────────────────────────────────────────────────

    async def run_image(self, image_b64: str, mime_type: str = "image/jpeg") -> DeepfakeResult:
        """Run the 2 Gemini probes + CV model (parallel) + synthesiser pipeline on an image."""
        logger.info("Starting image deepfake pipeline (mime=%s, size=%d chars)", mime_type, len(image_b64))

        # Step 1: run Gemini probes + ViT CV model + Spatial CNN all in parallel
        probe_a_raw, probe_b_raw, cv_result, spatial_result = await asyncio.gather(
            gemini_client.generate_with_vision(
                _IMG_ARTIFACT_PROMPT, image_b64, mime_type, response_key="deepfake_probe"
            ),
            gemini_client.generate_with_vision(
                _IMG_FACIAL_PROMPT, image_b64, mime_type, response_key="deepfake_probe"
            ),
            cv_detector.detect_image(image_b64),
            spatial_detector.detect_image(image_b64),
        )

        probe_a = _parse_probe(probe_a_raw)
        probe_b = _parse_probe(probe_b_raw)

        logger.info(
            "CV model result: label=%s score=%.2f | Spatial CNN: label=%s score=%.2f",
            cv_result.get("label"), cv_result.get("score", 0.5),
            spatial_result.get("label"), spatial_result.get("score", 0.5),
        )

        # Step 2: synthesiser sees image + all four probe reports
        synth_prompt = _IMG_SYNTH_PROMPT.format(
            probe_a_score=round(_clamp(probe_a.get("score", 0.5)), 2),
            probe_a_findings=_fmt_findings(probe_a.get("findings", [])),
            probe_a_summary=probe_a.get("summary", ""),
            probe_b_score=round(_clamp(probe_b.get("score", 0.5)), 2),
            probe_b_findings=_fmt_findings(probe_b.get("findings", [])),
            probe_b_summary=probe_b.get("summary", ""),
            cv_label=cv_result.get("label", "UNCERTAIN"),
            cv_score=round(_clamp(cv_result.get("score", 0.5)), 2),
            spatial_label=spatial_result.get("label", "UNCERTAIN"),
            spatial_score=round(_clamp(spatial_result.get("score", 0.5)), 2),
        )
        synth_raw = await gemini_client.generate_with_vision(
            synth_prompt, image_b64, mime_type, response_key="deepfake_image"
        )
        synth = _parse_synthesis(synth_raw)

        stages = [
            AnalysisStage(
                name="GAN & Artifact Scan",
                finding=probe_a.get("summary", "Inconclusive."),
                score=_clamp(probe_a.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Facial Consistency Check",
                finding=probe_b.get("summary", "Inconclusive."),
                score=_clamp(probe_b.get("score", 0.5)),
            ),
            AnalysisStage(
                name="ViT AI-Image Classifier",
                finding=f"ViT (umm-maybe): {cv_result.get('label', 'UNCERTAIN')} "
                        f"({cv_result.get('score', 0.5):.0%} AI-generated probability)",
                score=_clamp(cv_result.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Spatial Artifact CNN",
                finding=f"EfficientNet (dima806): {spatial_result.get('label', 'UNCERTAIN')} "
                        f"({spatial_result.get('score', 0.5):.0%} face-swap artifact probability)",
                score=_clamp(spatial_result.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Synthesis Verdict",
                finding=synth.get("reasoning", "Inconclusive.")[:300],
                score=_clamp(synth.get("confidence", 0.5)),
            ),
        ]

        logger.info(
            "Image pipeline complete: is_fake=%s confidence=%.2f",
            synth.get("is_fake"), synth.get("confidence"),
        )
        return DeepfakeResult(
            is_fake=bool(synth.get("is_fake", False)),
            confidence=_clamp(synth.get("confidence", 0.5)),
            reasoning=synth.get("reasoning", "Analysis complete."),
            stages=stages,
            media_type="image",
        )

    # ── Audio ──────────────────────────────────────────────────────────────────

    async def run_audio(self, audio_b64: str, mime_type: str = "audio/mpeg") -> DeepfakeResult:
        """Run the 2-probe + synthesiser pipeline on an audio file."""
        logger.info("Starting audio deepfake pipeline (mime=%s, size=%d chars)", mime_type, len(audio_b64))

        probe_a_raw, probe_b_raw = await asyncio.gather(
            gemini_client.generate_with_vision(
                _AUD_PROSODY_PROMPT, audio_b64, mime_type, response_key="deepfake_probe"
            ),
            gemini_client.generate_with_vision(
                _AUD_SPECTRAL_PROMPT, audio_b64, mime_type, response_key="deepfake_probe"
            ),
        )

        probe_a = _parse_probe(probe_a_raw)
        probe_b = _parse_probe(probe_b_raw)

        synth_prompt = _AUD_SYNTH_PROMPT.format(
            probe_a_score=round(_clamp(probe_a.get("score", 0.5)), 2),
            probe_a_findings=_fmt_findings(probe_a.get("findings", [])),
            probe_a_summary=probe_a.get("summary", ""),
            probe_b_score=round(_clamp(probe_b.get("score", 0.5)), 2),
            probe_b_findings=_fmt_findings(probe_b.get("findings", [])),
            probe_b_summary=probe_b.get("summary", ""),
        )
        synth_raw = await gemini_client.generate_with_vision(
            synth_prompt, audio_b64, mime_type, response_key="deepfake_audio"
        )
        synth = _parse_synthesis(synth_raw)

        stages = [
            AnalysisStage(
                name="Prosody Analysis",
                finding=probe_a.get("summary", "Inconclusive."),
                score=_clamp(probe_a.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Spectral Fingerprint Analysis",
                finding=probe_b.get("summary", "Inconclusive."),
                score=_clamp(probe_b.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Synthesis Verdict",
                finding=synth.get("reasoning", "Inconclusive.")[:300],
                score=_clamp(synth.get("confidence", 0.5)),
            ),
        ]

        logger.info(
            "Audio pipeline complete: is_fake=%s confidence=%.2f",
            synth.get("is_fake"), synth.get("confidence"),
        )
        return DeepfakeResult(
            is_fake=bool(synth.get("is_fake", False)),
            confidence=_clamp(synth.get("confidence", 0.5)),
            reasoning=synth.get("reasoning", "Analysis complete."),
            stages=stages,
            media_type="audio",
        )

    # ── Video ──────────────────────────────────────────────────────────────────

    async def _extract_jpeg_frame(self, video_b64: str) -> str | None:
        """
        Extract the first JPEG keyframe from raw video bytes.
        MP4/WebM containers embed JPEG-encoded frames detectable by the
        JPEG SOI marker (0xFF 0xD8 0xFF). Returns base64 frame or None.
        """
        try:
            raw = base64.b64decode(video_b64)
            jpeg_start = raw.find(b"\xff\xd8\xff")
            if jpeg_start == -1:
                logger.debug("No JPEG keyframe found in video bytes.")
                return None
            jpeg_end = raw.find(b"\xff\xd9", jpeg_start)
            if jpeg_end == -1:
                return None
            frame_bytes = raw[jpeg_start: jpeg_end + 2]
            return base64.b64encode(frame_bytes).decode()
        except Exception as exc:
            logger.debug("JPEG frame extraction failed: %s", exc)
            return None

    async def _cv_video_best_effort(self, video_b64: str) -> dict:
        """
        Best-effort ViT CV analysis on the first extractable JPEG keyframe.
        Returns neutral UNCERTAIN score if no frame can be extracted.
        """
        frame_b64 = await self._extract_jpeg_frame(video_b64)
        if frame_b64 is None:
            return {"score": 0.5, "label": "UNCERTAIN"}
        return await cv_detector.detect_image(frame_b64)

    async def _spatial_video_best_effort(self, video_b64: str) -> dict:
        """
        Best-effort Spatial CNN analysis on the first extractable JPEG keyframe.
        Detects face-swap compositing artifacts in video frames.
        Returns neutral UNCERTAIN score if no frame can be extracted.
        """
        frame_b64 = await self._extract_jpeg_frame(video_b64)
        if frame_b64 is None:
            return {"score": 0.5, "label": "UNCERTAIN"}
        return await spatial_detector.detect_image(frame_b64)

    async def run_video(self, video_b64: str, mime_type: str = "video/mp4") -> DeepfakeResult:
        """Run the 3 Gemini probes + CV frame analysis + synthesiser pipeline on a video."""
        logger.info("Starting video deepfake pipeline (mime=%s, size=%d chars)", mime_type, len(video_b64))

        # 3 Gemini probes + ViT CV model + Spatial CNN — all 5 in parallel
        probe_a_raw, probe_b_raw, probe_c_raw, cv_result, spatial_result = await asyncio.gather(
            gemini_client.generate_with_vision(
                _IMG_ARTIFACT_PROMPT, video_b64, mime_type, response_key="deepfake_probe"
            ),
            gemini_client.generate_with_vision(
                _IMG_FACIAL_PROMPT, video_b64, mime_type, response_key="deepfake_probe"
            ),
            gemini_client.generate_with_vision(
                _VID_TEMPORAL_PROMPT, video_b64, mime_type, response_key="deepfake_probe"
            ),
            self._cv_video_best_effort(video_b64),
            self._spatial_video_best_effort(video_b64),
        )
        logger.info(
            "Video CV frame result: label=%s score=%.2f | Spatial CNN: label=%s score=%.2f",
            cv_result.get("label"), cv_result.get("score", 0.5),
            spatial_result.get("label"), spatial_result.get("score", 0.5),
        )

        probe_a = _parse_probe(probe_a_raw)
        probe_b = _parse_probe(probe_b_raw)
        probe_c = _parse_probe(probe_c_raw)

        synth_prompt = _VID_SYNTH_PROMPT.format(
            probe_a_score=round(_clamp(probe_a.get("score", 0.5)), 2),
            probe_a_findings=_fmt_findings(probe_a.get("findings", [])),
            probe_a_summary=probe_a.get("summary", ""),
            probe_b_score=round(_clamp(probe_b.get("score", 0.5)), 2),
            probe_b_findings=_fmt_findings(probe_b.get("findings", [])),
            probe_b_summary=probe_b.get("summary", ""),
            probe_c_score=round(_clamp(probe_c.get("score", 0.5)), 2),
            probe_c_findings=_fmt_findings(probe_c.get("findings", [])),
            probe_c_summary=probe_c.get("summary", ""),
            cv_label=cv_result.get("label", "UNCERTAIN"),
            cv_score=round(_clamp(cv_result.get("score", 0.5)), 2),
            spatial_label=spatial_result.get("label", "UNCERTAIN"),
            spatial_score=round(_clamp(spatial_result.get("score", 0.5)), 2),
        )
        synth_raw = await gemini_client.generate_with_vision(
            synth_prompt, video_b64, mime_type, response_key="deepfake_video"
        )
        synth = _parse_synthesis(synth_raw)

        _has_frame = cv_result.get("label") != "UNCERTAIN"
        cv_finding = (
            f"ViT (umm-maybe) on keyframe: {cv_result.get('label', 'UNCERTAIN')} "
            f"({cv_result.get('score', 0.5):.0%} AI-generated probability)"
            if _has_frame
            else "No extractable keyframe — ViT CV model skipped."
        )
        spatial_finding = (
            f"EfficientNet (dima806) on keyframe: {spatial_result.get('label', 'UNCERTAIN')} "
            f"({spatial_result.get('score', 0.5):.0%} face-swap artifact probability)"
            if _has_frame
            else "No extractable keyframe — Spatial CNN skipped."
        )
        stages = [
            AnalysisStage(
                name="Visual Artifact Scan",
                finding=probe_a.get("summary", "Inconclusive."),
                score=_clamp(probe_a.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Facial Consistency Check",
                finding=probe_b.get("summary", "Inconclusive."),
                score=_clamp(probe_b.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Temporal Consistency Analysis",
                finding=probe_c.get("summary", "Inconclusive."),
                score=_clamp(probe_c.get("score", 0.5)),
            ),
            AnalysisStage(
                name="ViT AI-Image Classifier",
                finding=cv_finding,
                score=_clamp(cv_result.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Spatial Artifact CNN",
                finding=spatial_finding,
                score=_clamp(spatial_result.get("score", 0.5)),
            ),
            AnalysisStage(
                name="Synthesis Verdict",
                finding=synth.get("reasoning", "Inconclusive.")[:300],
                score=_clamp(synth.get("confidence", 0.5)),
            ),
        ]

        logger.info(
            "Video pipeline complete: is_fake=%s confidence=%.2f",
            synth.get("is_fake"), synth.get("confidence"),
        )
        return DeepfakeResult(
            is_fake=bool(synth.get("is_fake", False)),
            confidence=_clamp(synth.get("confidence", 0.5)),
            reasoning=synth.get("reasoning", "Analysis complete."),
            stages=stages,
            media_type="video",
        )


# Module-level singleton
deepfake_pipeline = DeepfakePipeline()
