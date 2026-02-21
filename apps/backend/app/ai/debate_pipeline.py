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

_PRO_PROMPT = """You are Agent A in a fact-checking debate. Your role is to find the STRONGEST \
SUPPORTING evidence for the following claim.

CLAIM: {claim}

Search results available to you:
{search_results}

Based on the evidence, write:
1. A concise argument (2-3 paragraphs) supporting the claim with specific facts
2. Key bullet points of supporting evidence (3-5 points, each starting with "- ")

Format your response as:
ARGUMENT: [your argument here]
POINTS:
- [point 1]
- [point 2]
- [point 3]"""

_CON_PROMPT = """You are Agent B in a fact-checking debate. Your role is to find the STRONGEST \
COUNTER-EVIDENCE against the following claim.

CLAIM: {claim}

Search results available to you:
{search_results}

Based on the evidence, write:
1. A concise counter-argument (2-3 paragraphs) challenging the claim with specific facts
2. Key bullet points of contradicting evidence (3-5 points, each starting with "- ")

Format your response as:
ARGUMENT: [your counter-argument here]
POINTS:
- [point 1]
- [point 2]
- [point 3]"""

_JUDGE_PROMPT = """You are an impartial AI judge evaluating a fact-checking debate.

CLAIM BEING EVALUATED: {claim}

AGENT A (Supporting):
{pro_argument}

AGENT B (Opposing):
{con_argument}

Additional fact-check data:
{factcheck_data}

Based on both arguments and all available evidence, provide:
1. A VERDICT from exactly one of: TRUE, FALSE, MISLEADING, UNVERIFIED, SATIRE
2. A CONFIDENCE score (integer 0-100)
3. A one-paragraph SUMMARY for a general audience
4. A CATEGORY from: Health, Politics, Finance, Science, Conflict, Climate, General

Format your response as valid JSON:
{{
  "verdict": "FALSE",
  "confidence": 85,
  "summary": "...",
  "category": "Health",
  "reasoning": "..."
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
    for r in results[:5]:
        title   = r.get("title", "Unknown")
        snippet = r.get("snippet", "")
        link    = r.get("link", "")
        lines.append(f"• {title}: {snippet} [{link}]")
    return "\n".join(lines)


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
        logger.info("Starting debate pipeline for claim: %.80s…", claim_text)

        # ── 1. Search ──────────────────────────────────────────────────────────
        pro_search = await serper_adapter.search(f"evidence supports: {claim_text[:200]}")
        con_search = await serper_adapter.search(f"evidence against debunks: {claim_text[:200]}")
        fc_results = await factcheck_adapter.search(claim_text[:200])

        pro_text_results = _format_search(pro_search)
        con_text_results = _format_search(con_search)
        fc_text = _format_search(fc_results) if fc_results else "No third-party fact-checks found."

        # ── 2. Pro agent ───────────────────────────────────────────────────────
        pro_prompt = _PRO_PROMPT.format(claim=claim_text, search_results=pro_text_results)
        pro_raw = await gemini_client.generate_with_pro(pro_prompt, response_key="agent_pro")
        pro_argument, pro_points = _parse_argument(pro_raw)
        pro_sources = _extract_sources(pro_search)

        # ── 3. Con agent ───────────────────────────────────────────────────────
        con_prompt = _CON_PROMPT.format(claim=claim_text, search_results=con_text_results)
        con_raw = await gemini_client.generate_with_pro(con_prompt, response_key="agent_con")
        con_argument, con_points = _parse_argument(con_raw)
        con_sources = _extract_sources(con_search)

        # ── 4. Judge ───────────────────────────────────────────────────────────
        judge_prompt = _JUDGE_PROMPT.format(
            claim=claim_text,
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
            claim_text=claim_text,
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
