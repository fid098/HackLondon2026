"""
debate_pipeline.py — Multi-agent AI debate orchestrator.

Architecture:

  Step 0 — Claim classification (Flash, parallel with searches)
    Classifies claim as EVENT_REPORT / STATISTICAL_CLAIM / OPINION / HISTORICAL / GENERAL
    so the Judge can apply the correct sensitivity threshold.

  Step 1 — 4-search pass (all parallel via asyncio.gather)
    a. Pro search   — evidence supporting the claim
    b. Con search   — evidence against the claim
    c. Fact-checker search — targeted at Snopes, Reuters FC, AP FC, PolitiFact, Full Fact
    d. Corroboration search — independent confirmation of the core claim

    All results are scored by source_evaluator.py which assigns each domain a
    credibility tier (★★★★★ Tier 1 → ★☆☆☆☆ Tier 0) before the agents see them.

  Step 2 — Agent A (Evidence Analyst, Supporting)
    Builds an honest supporting case with source ratings inline.
    Must cross-reference ≥2 independent sources. Must flag weak evidence honestly.

  Step 3 — Agent B (Evidence Analyst, Opposing)
    Builds an honest counter-case using only independent sources.
    Must classify counter-evidence as TYPE A (direct contradiction),
    TYPE B (missing context), or TYPE C (source quality challenge).

  Step 4 — Judge (Impartial Evidence Evaluator)
    Receives both arguments, avg source scores, fact-check data, corroboration data.
    Evaluates source independence, quality, and counter-evidence type before verdict.
    Claim-type–calibrated decision rules prevent over-sensitivity on EVENT_REPORT claims.

In mock mode (AI_MOCK_MODE=true) all steps return canned but realistic responses
so the full UI works end-to-end without real credentials or API quotas.
"""

import asyncio
import json
import logging
import re
from dataclasses import dataclass, field

from app.ai.factcheck_adapter import fact_check_adapter as factcheck_adapter
from app.ai.gemini_client import gemini_client
from app.ai.serper_adapter import serper_adapter
from app.ai.source_evaluator import avg_score, quality_label, score_results

logger = logging.getLogger(__name__)


# ── Data classes ──────────────────────────────────────────────────────────────

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


_PRO_PROMPT = """You are Agent A — Evidence Analyst (Supporting). Your mission is to build \
the strongest HONEST, EVIDENCE-BACKED case that the following claim is true or accurate.

CLAIM: {claim}
CLAIM TYPE: {claim_type}

Search results with credibility ratings (★★★★★ = Tier 1 highly credible, ★☆☆☆☆ = unreliable):
{search_results}

─── YOUR INSTRUCTIONS ───────────────────────────────────────────────────────────────────
1. CROSS-REFERENCE: identify the claim's core fact and confirm it in AT LEAST TWO
   INDEPENDENT SOURCES (different domains). State clearly if you cannot find two.

2. RATE SOURCES: cite every source with its credibility rating inline:
   e.g. "According to [BBC News ★★★★★](https://bbc.com/...) the data shows..."

3. LABEL SOURCE TYPE for each citation:
   - PRIMARY: direct reporting of the event/data (journalist on scene, official statement)
   - SECONDARY: commentary, analysis, or aggregation of primary sources
   - REFERENCE: encyclopedic or statistical body

4. FLAG AI-GENERATED CONTENT: if any source shows signs of AI generation (no author,
   no date, template-style prose, suspiciously generic domain) mark it
   [POSSIBLY AI-GENERATED — low weight] and do not treat it as strong evidence.

5. HONESTY OVER RHETORIC: if evidence is weak or only one source confirms the claim,
   say so explicitly. Do NOT infer or extrapolate beyond what sources explicitly state.

6. Identify your single strongest piece of evidence and label it KEY EVIDENCE.

─── FORMAT ──────────────────────────────────────────────────────────────────────────────
ARGUMENT: [2–3 paragraphs. Every factual claim must cite a source with its star rating.]

KEY EVIDENCE: [single most compelling piece of evidence with source citation and star rating]

POINTS:
- [supporting point — [Source ★★★★★](url)]
- [supporting point — [Source ★★★★☆](url)]
- [supporting point — [Source ★★★★☆](url)]

SOURCE QUALITY: [HIGH if avg ≥ ★★★★, MEDIUM if avg ★★★, LOW if avg ★★ or below]"""


_CON_PROMPT = """You are Agent B — Evidence Analyst (Opposing). Your mission is to present \
the most HONEST, EVIDENCE-BACKED counter-case against the following claim.

CLAIM: {claim}
CLAIM TYPE: {claim_type}

Search results with credibility ratings (★★★★★ = Tier 1 highly credible, ★☆☆☆☆ = unreliable):
{search_results}

─── YOUR INSTRUCTIONS ───────────────────────────────────────────────────────────────────
1. INDEPENDENT SOURCES ONLY: cite sources from DIFFERENT DOMAINS than Agent A would use.
   Do NOT reinterpret the same article to argue the opposite conclusion.

2. CLASSIFY EVERY counter-point with its evidence type:
   - TYPE A (Direct Contradiction): the claim's core stated fact is demonstrably wrong
   - TYPE B (Missing Context): the claim is partially true but critically incomplete
   - TYPE C (Source Quality): the evidence FOR the claim is weak or unverified

3. RATE SOURCES inline with star ratings (same format as Agent A).

4. HONESTY OVER DESTRUCTION: if counter-evidence is genuinely weak, acknowledge it.
   Do NOT fabricate doubt or manufacture controversy. A weak counter-case should
   be labelled SOURCE QUALITY: LOW — do not dress it up as stronger than it is.

5. STRICT GROUNDING: do NOT infer or extrapolate beyond what search result snippets
   explicitly state. If a snippet doesn't support a claim, don't make the claim.

6. If the claim is strongly supported, focus on TYPE B or TYPE C and be transparent
   about the limitation of your counter-case.

─── FORMAT ──────────────────────────────────────────────────────────────────────────────
ARGUMENT: [2–3 paragraphs. Every claim must cite a source with its star rating and TYPE label.]

POINTS:
- [TYPE A/B/C — counter-point — [Source ★★★★★](url)]
- [TYPE A/B/C — counter-point — [Source ★★★★☆](url)]
- [TYPE A/B/C — counter-point — [Source ★★★☆☆](url)]

SOURCE QUALITY: [HIGH / MEDIUM / LOW]"""


_JUDGE_PROMPT = """You are the Judge — Impartial Evidence Evaluator. You are NOT deciding \
whether you personally agree with the claim. You are evaluating which agent produced \
stronger, more credible, verifiable evidence and reaching a calibrated verdict.

CLAIM: {claim}
CLAIM TYPE: {claim_type}

AGENT A (Supporting — Evidence Quality: {pro_quality}):
{pro_argument}

AGENT B (Opposing — Evidence Quality: {con_quality}):
{con_argument}

INDEPENDENT FACT-CHECK DATA (for your eyes only — not shown to agents):
{factcheck_data}

INDEPENDENT CORROBORATION DATA (for your eyes only — not shown to agents):
{corroboration_data}

─── EVIDENCE QUALITY SCORES ─────────────────────────────────────────────────────────────
Agent A avg source credibility: {pro_avg_score}/1.0
Agent B avg source credibility: {con_avg_score}/1.0

─── YOUR EVALUATION PROCESS (follow in this order) ──────────────────────────────────────
STEP 1 — Source independence: Did both agents cite genuinely different sources?
  If both cite the same article to reach opposite conclusions, penalise the weaker argument.

STEP 2 — Source quality: Compare avg credibility scores. Tier 1/2 (≥0.65) sources
  outweigh Tier 3/4 (<0.65). A Tier 1 source uncontradicted by another Tier 1 source
  is strong evidence.

STEP 3 — Factual corroboration: How many independent sources agree on the core claim?
  Check the corroboration data above to validate what agents claimed.

STEP 4 — Counter-evidence classification:
  - TYPE A (direct contradiction) from a Tier 1/2 source = strong counter-evidence
  - TYPE B (missing context) alone = cannot flip TRUE to MISLEADING
  - TYPE C (source quality challenge) alone = cannot flip TRUE to MISLEADING

STEP 5 — Hallucination check: Did either agent assert facts NOT present in their
  search result snippets? If yes, penalise that agent's credibility score.

STEP 6 — Cross-reference with fact-check and corroboration data to validate both agents.

─── VERDICT DEFINITIONS ─────────────────────────────────────────────────────────────────
TRUE        — Core assertion factually accurate. Tier 1/2 supporting evidence present.
              No TYPE A counter-evidence from Tier 1/2 source.
              EVENT_REPORT rule: if the event/announcement demonstrably occurred as
              described and Agent B provides only TYPE B/C, verdict is TRUE.

FALSE       — Core assertion demonstrably wrong. Direct TYPE A contradiction from a
              Tier 1/2 source.

MISLEADING  — HIGH BAR. Requires ALL THREE: (a) a kernel of truth, (b) a significant
              omission or misframing, AND (c) a reasonable reader would reach a
              materially false conclusion about the core claim.
              TYPE B or TYPE C alone ≠ MISLEADING. Legal uncertainty, downstream
              implications, or political controversy ≠ MISLEADING.
              Prefer UNVERIFIED over MISLEADING when in doubt.

UNVERIFIED  — Insufficient reliable (Tier 1/2) evidence on either side. Neither agent
              produced strong verifiable evidence. Sources conflict without clear winner.

SATIRE      — Content is clearly satirical and not intended as factual reporting.

─── CLAIM-TYPE CALIBRATION ──────────────────────────────────────────────────────────────
EVENT_REPORT    → Need ≥1 Tier 1/2 source confirming the event. TYPE B/C alone → TRUE.
STATISTICAL_CLAIM → Require ≥2 independent sources matching the specific figures cited.
                    Wrong numbers confirmed by Tier 1 source → FALSE.
OPINION         → Return UNVERIFIED immediately. Opinions cannot be fact-checked.
HISTORICAL      → Weight academic/encyclopedic sources (Tier 1/2) higher than news.
GENERAL         → Standard evidence weighting rules above apply.

─── CONFIDENCE GUIDE ────────────────────────────────────────────────────────────────────
90–100 : Multiple Tier 1 sources in agreement, no credible TYPE A counter-evidence
75–89  : Tier 1/2 source(s) support claim, minor TYPE B/C counter-points only
55–74  : Mixed evidence or Tier 2/3 sources with some counter-evidence
35–54  : Weak evidence both sides or significant uncertainty remains
15–34  : Little reliable evidence; largely inconclusive
0–14   : Unable to assess with available information

─── SOURCE LEGITIMACY NOTES ─────────────────────────────────────────────────────────────
- If a source is marked [POSSIBLY AI-GENERATED] by an agent, exclude it from weighting.
- Tier 0 sources (★☆☆☆☆): discard as evidence entirely.
- If Agent A's KEY EVIDENCE is Tier 1/2 and uncontradicted by TYPE A from Agent B → TRUE.
- Both agents citing only Tier 3/4 → UNVERIFIED unless corroboration data confirms.

Respond with valid JSON only:
{{
  "verdict": "TRUE",
  "confidence": 88,
  "summary": "...",
  "category": "Politics",
  "reasoning": "...",
  "decisive_factors": ["Factor 1 explaining verdict", "Factor 2"],
  "source_quality_assessment": "Agent A: [quality summary]. Agent B: [quality summary].",
  "agent_scores": {{"agent_a": 8.5, "agent_b": 4.2}}
}}"""


# ── Parsing helpers ───────────────────────────────────────────────────────────

def _parse_argument(text: str) -> tuple[str, list[str]]:
    """Extract ARGUMENT and bullet POINTS from agent response."""
    argument = text
    points: list[str] = []

    arg_m = re.search(r"ARGUMENT:\s*(.*?)(?=KEY EVIDENCE:|POINTS:|SOURCE QUALITY:|$)", text, re.DOTALL | re.IGNORECASE)
    pts_m = re.search(r"POINTS:\s*(.*?)(?=SOURCE QUALITY:|$)", text, re.DOTALL | re.IGNORECASE)

    if arg_m:
        argument = arg_m.group(1).strip()
    if pts_m:
        raw = pts_m.group(1).strip()
        points = [p.lstrip("- •").strip() for p in raw.splitlines() if p.strip().startswith("-")]

    return argument, points


def _parse_judge(text: str) -> dict:
    """Extract JSON from judge response, with fallback to defaults."""
    json_m = re.search(r"\{[\s\S]*\}", text)
    if json_m:
        try:
            return json.loads(json_m.group())
        except json.JSONDecodeError:
            pass

    upper = text.upper()
    for v in ("TRUE", "FALSE", "MISLEADING", "SATIRE"):
        if v in upper:
            return {"verdict": v, "confidence": 60, "summary": text[:300], "category": "General", "reasoning": text}

    return {"verdict": "UNVERIFIED", "confidence": 30, "summary": text[:300], "category": "General", "reasoning": text}


def _format_search(results: list[dict]) -> str:
    """Format scored search results for inclusion in an agent prompt."""
    if not results:
        return "No search results available."
    lines = []
    for i, r in enumerate(results[:5], 1):
        title   = r.get("title", "Unknown")
        snippet = r.get("snippet", "")
        link    = r.get("link", "")
        stars   = r.get("stars", "★★☆☆☆")
        name    = r.get("tier_label", "")
        lines.append(
            f"[{i}] {title} {stars} ({name})\n"
            f"    URL: {link}\n"
            f"    Excerpt: {snippet}"
        )
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
    Orchestrates the three-agent fact-checking debate with source credibility scoring.

    Works in both mock mode (default, no API keys needed) and real mode
    (requires GEMINI_API_KEY and optionally SERPER_API_KEY).
    """

    async def run(self, claim_text: str) -> DebateResult:
        # Use only the first line (headline) as the search query — avoids polluting
        # Serper with JSON or article body text when a URL is submitted.
        search_query = claim_text.split("\n")[0].strip()[:200]
        logger.info("Starting debate pipeline for claim: %.80s…", search_query)

        # ── 0 & 1. Classify + 4-search pass (all in parallel) ─────────────────
        classifier_prompt = _CLASSIFIER_PROMPT.format(content=search_query)
        (
            pro_raw, con_raw, fc_results,
            fc_search_raw, corr_raw, claim_type_raw,
        ) = await asyncio.gather(
            serper_adapter.search(f"evidence supports: {search_query}"),
            serper_adapter.search(f"evidence against debunks: {search_query}"),
            factcheck_adapter.search(search_query),
            serper_adapter.search(
                f'"{search_query[:120]}" '
                f"site:reuters.com OR site:apnews.com OR site:snopes.com "
                f"OR site:politifact.com OR site:fullfact.org OR site:factcheck.org"
            ),
            serper_adapter.search(f"{search_query[:150]} confirmed verified"),
            gemini_client.generate_with_flash(classifier_prompt, response_key="default"),
        )

        # Normalise classifier output
        claim_type = claim_type_raw.strip().upper().split()[0]
        if claim_type not in {"EVENT_REPORT", "STATISTICAL_CLAIM", "OPINION", "HISTORICAL", "GENERAL"}:
            claim_type = "GENERAL"
        logger.info("Claim type classified as: %s", claim_type)

        # ── Score all search results for credibility ───────────────────────────
        pro_search  = score_results(pro_raw)
        con_search  = score_results(con_raw)
        fc_search   = score_results(fc_search_raw)
        corr_search = score_results(corr_raw)

        pro_avg   = avg_score(pro_search)
        con_avg   = avg_score(con_search)
        pro_qual  = quality_label(pro_avg)
        con_qual  = quality_label(con_avg)

        pro_text  = _format_search(pro_search)
        con_text  = _format_search(con_search)
        fc_text   = _format_search(fc_results) if fc_results else "No third-party fact-checks found."

        # Merge dedicated fact-checker search results with the factcheck adapter results
        fc_combined = fc_text
        if fc_search:
            fc_combined += "\n\nDedicated fact-checker search:\n" + _format_search(fc_search)

        corr_text = _format_search(corr_search) if corr_search else "No corroboration results."

        # ── 2 & 3. Pro and Con agents in parallel ──────────────────────────────
        pro_prompt = _PRO_PROMPT.format(
            claim=search_query, claim_type=claim_type, search_results=pro_text
        )
        con_prompt = _CON_PROMPT.format(
            claim=search_query, claim_type=claim_type, search_results=con_text
        )

        pro_agent_raw, con_agent_raw = await asyncio.gather(
            gemini_client.generate_with_pro(pro_prompt, response_key="agent_pro"),
            gemini_client.generate_with_pro(con_prompt, response_key="agent_con"),
        )

        pro_argument, pro_points = _parse_argument(pro_agent_raw)
        con_argument, con_points = _parse_argument(con_agent_raw)

        pro_sources = _extract_sources(pro_search)
        if not pro_sources:
            pro_sources = [
                SourceRef(title="Reuters Fact Check", url="https://www.reuters.com/fact-check/"),
                SourceRef(title="WHO — News & Updates", url="https://www.who.int/news/"),
            ]

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
            pro_quality=pro_qual,
            con_quality=con_qual,
            pro_avg_score=pro_avg,
            con_avg_score=con_avg,
            pro_argument=pro_agent_raw,   # pass full agent output including KEY EVIDENCE
            con_argument=con_agent_raw,
            factcheck_data=fc_combined,
            corroboration_data=corr_text,
        )
        judge_raw  = await gemini_client.generate_with_pro(judge_prompt, response_key="judge")
        judge_data = _parse_judge(judge_raw)

        verdict    = judge_data.get("verdict", "UNVERIFIED").upper()
        confidence = int(judge_data.get("confidence", 50))
        summary    = judge_data.get("summary", judge_data.get("reasoning", "No summary available."))
        category   = judge_data.get("category", "General")

        all_sources = (pro_sources + con_sources)[:6]

        logger.info("Debate complete: verdict=%s confidence=%d claim_type=%s", verdict, confidence, claim_type)

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
