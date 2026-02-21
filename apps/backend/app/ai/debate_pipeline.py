"""
debate_pipeline.py — Multi-agent AI debate orchestrator.

Architecture (matches ARCHITECTURE.md):

  Agent A (Pro-side)
    1. Search for supporting evidence via SerperAdapter
    2. Prompt Gemini Pro: "Argue this claim is TRUE"
    3. Returns: pro_argument + sources

  Agent B (Con-side)
    1. Search for counter evidence via SerperAdapter
    2. Prompt Gemini Pro: "Argue this claim is FALSE"
    3. Returns: con_argument + sources

  Judge
    1. Receives both arguments
    2. Prompt Gemini Pro: "As an impartial judge, evaluate..."
    3. Returns: verdict + confidence + explanation + sources

In mock mode (no API keys) all three agents return canned but realistic
responses so the full UI works end-to-end without real credentials.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field

from app.ai.factcheck_adapter import fact_check_adapter as factcheck_adapter
from app.ai.gemini_client import gemini_client
from app.ai.serper_adapter import serper_adapter

logger = logging.getLogger(__name__)


# ── Data classes (internal; converted to Pydantic models by the route) ────────

@dataclass
class SourceRef:
    title: str
    url: str = ""


@dataclass
class DebateResult:
    claim_text: str
    pro_argument: str
    con_argument: str
    judge_reasoning: str
    verdict: str                              # TRUE / FALSE / MISLEADING / UNVERIFIED / SATIRE
    confidence: int                           # 0–100
    summary: str
    pro_points: list[str] = field(default_factory=list)
    con_points: list[str] = field(default_factory=list)
    sources: list[SourceRef] = field(default_factory=list)
    pro_sources: list[SourceRef] = field(default_factory=list)
    con_sources: list[SourceRef] = field(default_factory=list)
    category: str = "General"


# ── Prompts ───────────────────────────────────────────────────────────────────

_CLASSIFIER_PROMPT = """Classify the following content into exactly one claim type.

CONTENT: {content}

Types:
- EVENT_REPORT: a news report or announcement describing an event that occurred or was announced
- STATISTICAL_CLAIM: a claim containing specific numbers, statistics, or measurements
- OPINION: a subjective statement, prediction, or editorial position
- HISTORICAL: a claim about past events or established historical facts
- GENERAL: anything else

Respond with a single word only (e.g. EVENT_REPORT)."""

_PRO_PROMPT = """You are Agent A in a structured fact-checking debate. Your role is to build the \
strongest honest SUPPORTING case for the following claim using the search results provided.

CLAIM: {claim}

Search results (cite these in your argument):
{search_results}

Instructions:
- Write a focused argument (2–3 paragraphs) supporting the claim with specific facts
- Cite sources INLINE using markdown format: [Source Title](URL)
  Example: "According to [Reuters](https://reuters.com/...) the data shows..."
- Include AT LEAST 2 inline citations drawn from the search results above
- List 3–5 key bullet points of supporting evidence after your argument

Format:
ARGUMENT: [your argument with inline citations]
POINTS:
- [point 1]
- [point 2]
- [point 3]"""

_CON_PROMPT = """You are Agent B in a structured fact-checking debate. Your role is to present \
the strongest HONEST COUNTER-CASE against the following claim, based strictly on the search \
results provided.

CLAIM: {claim}

Search results (cite these in your argument):
{search_results}

Instructions:
- Write a balanced counter-argument (2–3 paragraphs) using ONLY evidence from the search results
- Do NOT reinterpret or reuse the same sources as the pro-side to argue the opposite
- If the evidence against the claim is genuinely weak, acknowledge that honestly
- Cite sources INLINE using markdown format: [Source Title](URL)
  Example: "According to [AP Fact Check](https://apnews.com/...) this claim is questioned because..."
- Include AT LEAST 2 inline citations drawn from the search results above
- List 3–5 key bullet points of contradicting or contextualising evidence

Format:
ARGUMENT: [your counter-argument with inline citations]
POINTS:
- [point 1]
- [point 2]
- [point 3]"""

_JUDGE_PROMPT = """You are an impartial senior fact-checker evaluating a structured AI debate.

CLAIM BEING EVALUATED: {claim}
CLAIM TYPE: {claim_type}

AGENT A (Supporting the claim):
{pro_argument}

AGENT B (Opposing the claim):
{con_argument}

Third-party fact-check data:
{factcheck_data}

─── VERDICT DEFINITIONS (choose exactly one) ────────────────────────────────────────
TRUE        — The core assertion is factually accurate; strong supporting evidence,
              no credible direct counter-evidence.
              For EVENT_REPORT claims: if the event was demonstrably announced or
              occurred as described, return TRUE.

FALSE       — The core assertion is demonstrably wrong; clear evidence directly
              contradicts it.

MISLEADING  — HIGH BAR. The core assertion leads a reasonable reader to a materially
              false conclusion. Requires ALL THREE of:
              (a) a kernel of truth exists,
              (b) a significant omission or misframing is present, AND
              (c) a reasonable reader would draw a substantially wrong conclusion.
              Do NOT use MISLEADING merely because nuance exists, context is complex,
              or implications are contested. News announcements and factual reports
              are rarely MISLEADING unless the core stated fact is wrong.

UNVERIFIED  — Insufficient reliable evidence to confirm or deny. Use when neither
              agent produced strong verifiable evidence, or when sources conflict
              without a clear winner.

SATIRE      — Content is clearly satirical and not intended as factual reporting.

─── DECISION RULES ──────────────────────────────────────────────────────────────────
1. EVENT_REPORT: if Agent A shows the event/announcement occurred as described,
   return TRUE (confidence 75–90) UNLESS Agent B presents direct factual contradictions
   — not merely legal uncertainty, political controversy, or added context.
2. Legal uncertainty or contested downstream implications of a factual announcement
   do NOT make that announcement MISLEADING.
3. Prefer UNVERIFIED over MISLEADING when unsure the omission is significant enough
   to deceive a reasonable reader.
4. Missing context that adds nuance ≠ MISLEADING. The claim must actively mislead.

─── CONFIDENCE GUIDE ────────────────────────────────────────────────────────────────
85–100 : Overwhelming, consistent evidence from multiple independent sources
65–84  : Strong evidence with minor counter-points
45–64  : Mixed evidence or meaningful uncertainty remains
25–44  : Little reliable evidence; mostly speculation
0–24   : Unable to assess

Evaluate which argument was better supported by verifiable evidence. Name the specific
factors that were most decisive. Explain why you chose this verdict over alternatives.

Respond with valid JSON only:
{{
  "verdict": "TRUE",
  "confidence": 82,
  "summary": "...",
  "category": "Politics",
  "reasoning": "...",
  "decisive_factors": ["Factor 1 that most influenced the verdict", "Factor 2"]
}}"""


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _parse_argument(text: str) -> tuple[str, list[str]]:
    """Extract ARGUMENT and bullet POINTS from agent response."""
    argument = text
    points: list[str] = []

    arg_m = re.search(r"ARGUMENT:\s*(.*?)(?=POINTS:|$)", text, re.DOTALL | re.IGNORECASE)
    pts_m = re.search(r"POINTS:\s*(.*)", text, re.DOTALL | re.IGNORECASE)

    if arg_m:
        argument = arg_m.group(1).strip()
    if pts_m:
        raw = pts_m.group(1).strip()
        points = [p.lstrip("- •").strip() for p in raw.splitlines() if p.strip().startswith("-")]

    return argument, points


def _parse_judge(text: str) -> dict:
    """Extract JSON from judge response, with fallback to defaults."""
    # Try to find JSON block in the response
    json_m = re.search(r"\{[\s\S]*\}", text)
    if json_m:
        try:
            return json.loads(json_m.group())
        except json.JSONDecodeError:
            pass

    # Fallback: scan for verdict keyword in free text
    upper = text.upper()
    for v in ("TRUE", "FALSE", "MISLEADING", "SATIRE"):
        if v in upper:
            return {"verdict": v, "confidence": 60, "summary": text[:300], "category": "General", "reasoning": text}

    return {"verdict": "UNVERIFIED", "confidence": 30, "summary": text[:300], "category": "General", "reasoning": text}


def _format_search(results: list[dict]) -> str:
    if not results:
        return "No search results available."
    lines = []
    for i, r in enumerate(results[:5], 1):
        title   = r.get("title", "Unknown")
        snippet = r.get("snippet", "")
        link    = r.get("link", "")
        lines.append(f"[{i}] {title}\n    URL: {link}\n    Excerpt: {snippet}")
    return "\n\n".join(lines)


def _extract_sources(search_results: list[dict]) -> list[SourceRef]:
    sources = []
    for r in search_results[:3]:
        title = r.get("title") or r.get("snippet", "Source")[:60]
        url   = r.get("link", "")
        if title:
            sources.append(SourceRef(title=title, url=url))
    return sources


# ── Pipeline ──────────────────────────────────────────────────────────────────

class DebatePipeline:
    """
    Orchestrates the three-agent fact-checking debate.

    Works in both mock mode (default, no API keys needed) and real mode
    (requires GEMINI_API_KEY and optionally SERPER_API_KEY).
    """

    async def run(self, claim_text: str) -> DebateResult:
        # Use only the first line (headline) as the search query — avoids polluting
        # Serper with JSON or article body text when a URL is submitted.
        search_query = claim_text.split("\n")[0].strip()[:200]
        logger.info("Starting debate pipeline for claim: %.80s…", search_query)

        # ── 1. Search + classify in parallel ───────────────────────────────────
        classifier_prompt = _CLASSIFIER_PROMPT.format(content=search_query)
        (pro_search, con_search, fc_results, claim_type_raw) = await asyncio.gather(
            serper_adapter.search(f"evidence supports: {search_query}"),
            serper_adapter.search(f"evidence against debunks: {search_query}"),
            factcheck_adapter.search(search_query),
            gemini_client.generate_with_flash(classifier_prompt, response_key="default"),
        )

        # Normalise classifier output to one of the known labels
        claim_type = claim_type_raw.strip().upper().split()[0]
        valid_types = {"EVENT_REPORT", "STATISTICAL_CLAIM", "OPINION", "HISTORICAL", "GENERAL"}
        if claim_type not in valid_types:
            claim_type = "GENERAL"
        logger.info("Claim type classified as: %s", claim_type)

        pro_text_results = _format_search(pro_search)
        con_text_results = _format_search(con_search)
        fc_text = _format_search(fc_results) if fc_results else "No third-party fact-checks found."

        # ── 2 & 3. Pro and Con agents in parallel ──────────────────────────────
        pro_prompt = _PRO_PROMPT.format(claim=search_query, search_results=pro_text_results)
        con_prompt = _CON_PROMPT.format(claim=search_query, search_results=con_text_results)

        pro_raw, con_raw = await asyncio.gather(
            gemini_client.generate_with_pro(pro_prompt, response_key="agent_pro"),
            gemini_client.generate_with_pro(con_prompt, response_key="agent_con"),
        )

        pro_argument, pro_points = _parse_argument(pro_raw)
        pro_sources = _extract_sources(pro_search)
        # When Serper has no key or returns nothing, inject representative fact-checking
        # organisation links so the UI always has real sources to display.
        if not pro_sources:
            pro_sources = [
                SourceRef(title="Reuters Fact Check", url="https://www.reuters.com/fact-check/"),
                SourceRef(title="WHO — News & Updates", url="https://www.who.int/news/"),
            ]

        con_argument, con_points = _parse_argument(con_raw)
        con_sources = _extract_sources(con_search)
        if not con_sources:
            con_sources = [
                SourceRef(title="AP Fact Check", url="https://apnews.com/hub/ap-fact-check"),
                SourceRef(title="Snopes — Fact Checking", url="https://www.snopes.com/"),
                SourceRef(title="PolitiFact", url="https://www.politifact.com/"),
            ]

        # ── 4. Judge ───────────────────────────────────────────────────────────
        judge_prompt = _JUDGE_PROMPT.format(
            claim=search_query,
            claim_type=claim_type,
            pro_argument=pro_argument,
            con_argument=con_argument,
            factcheck_data=fc_text,
        )
        judge_raw = await gemini_client.generate_with_pro(judge_prompt, response_key="judge")
        judge_data = _parse_judge(judge_raw)

        verdict    = judge_data.get("verdict", "UNVERIFIED").upper()
        confidence = int(judge_data.get("confidence", 50))
        summary    = judge_data.get("summary", judge_data.get("reasoning", "No summary available."))
        category   = judge_data.get("category", "General")

        # Merge sources (judge summary + both agent sources)
        all_sources = (pro_sources + con_sources)[:6]

        logger.info("Debate complete: verdict=%s confidence=%d", verdict, confidence)

        return DebateResult(
            claim_text=search_query,
            pro_argument=pro_argument,
            con_argument=con_argument,
            judge_reasoning=judge_data.get("reasoning", summary),
            verdict=verdict,
            confidence=confidence,
            summary=summary,
            pro_points=pro_points,
            con_points=con_points,
            sources=all_sources,
            pro_sources=pro_sources,
            con_sources=con_sources,
            category=category,
        )


# Module-level singleton
debate_pipeline = DebatePipeline()
