"""
source_evaluator.py — Domain credibility tier system for fact-checking.

Assigns a credibility score and tier label to any web domain based on its
established reputation as a reliable information source. Used by the debate
pipeline to weight evidence quality before passing search results to AI agents.

Tier system:
  Tier 1 (★★★★★, 0.85–1.0)  — Wire services, peer-reviewed journals, official gov bodies
  Tier 2 (★★★★☆, 0.65–0.84) — Major newspapers, established fact-checkers
  Tier 3 (★★★☆☆, 0.40–0.64) — Regional news, Wikipedia, industry publications
  Tier 4 (★★☆☆☆, 0.15–0.39) — Blogs, personal sites, unknown/generic domains
  Tier 0 (★☆☆☆☆, 0.00–0.14) — Known disinfo networks, AI content farms, satire sites
"""

import re
from urllib.parse import urlparse

# ── Domain tier registry ──────────────────────────────────────────────────────
# Format: domain → (tier, score, display_name)
# More specific entries (longer strings) take priority over shorter parent domains.
_TIER_REGISTRY: dict[str, tuple[int, float, str]] = {

    # ── Tier 1: Wire services & primary news agencies ──────────────────────────
    "reuters.com":              (1, 0.97, "Reuters"),
    "apnews.com":               (1, 0.97, "Associated Press"),
    "afp.com":                  (1, 0.95, "AFP"),
    "bbc.com":                  (1, 0.93, "BBC"),
    "bbc.co.uk":                (1, 0.93, "BBC"),

    # ── Tier 1: Peer-reviewed / academic ──────────────────────────────────────
    "nature.com":               (1, 0.98, "Nature"),
    "science.org":              (1, 0.98, "Science"),
    "pubmed.ncbi.nlm.nih.gov":  (1, 0.97, "PubMed"),
    "ncbi.nlm.nih.gov":         (1, 0.96, "NCBI"),
    "thelancet.com":            (1, 0.97, "The Lancet"),
    "nejm.org":                 (1, 0.97, "NEJM"),
    "bmj.com":                  (1, 0.96, "BMJ"),
    "jamanetwork.com":          (1, 0.96, "JAMA"),

    # ── Tier 1: Official government & intergovernmental bodies ────────────────
    "who.int":                  (1, 0.95, "WHO"),
    "cdc.gov":                  (1, 0.95, "CDC"),
    "nih.gov":                  (1, 0.95, "NIH"),
    "gov.uk":                   (1, 0.93, "UK Government"),
    "gov.au":                   (1, 0.92, "Australian Government"),
    "europa.eu":                (1, 0.91, "European Union"),
    "un.org":                   (1, 0.90, "United Nations"),
    "whitehouse.gov":           (1, 0.88, "White House"),
    "congress.gov":             (1, 0.90, "US Congress"),
    "senate.gov":               (1, 0.90, "US Senate"),
    "parliament.uk":            (1, 0.91, "UK Parliament"),

    # ── Tier 2: Major newspapers ───────────────────────────────────────────────
    "nytimes.com":              (2, 0.82, "New York Times"),
    "washingtonpost.com":       (2, 0.81, "Washington Post"),
    "theguardian.com":          (2, 0.80, "The Guardian"),
    "ft.com":                   (2, 0.82, "Financial Times"),
    "economist.com":            (2, 0.82, "The Economist"),
    "wsj.com":                  (2, 0.80, "Wall Street Journal"),
    "telegraph.co.uk":          (2, 0.75, "The Telegraph"),
    "thetimes.co.uk":           (2, 0.76, "The Times"),
    "independent.co.uk":        (2, 0.73, "The Independent"),
    "sky.com":                  (2, 0.75, "Sky News"),
    "cnn.com":                  (2, 0.74, "CNN"),
    "nbcnews.com":              (2, 0.74, "NBC News"),
    "abcnews.go.com":           (2, 0.74, "ABC News"),
    "cbsnews.com":              (2, 0.73, "CBS News"),
    "npr.org":                  (2, 0.80, "NPR"),
    "pbs.org":                  (2, 0.79, "PBS"),
    "politico.com":             (2, 0.76, "Politico"),
    "thehill.com":              (2, 0.72, "The Hill"),
    "axios.com":                (2, 0.76, "Axios"),
    "dw.com":                   (2, 0.78, "Deutsche Welle"),
    "aljazeera.com":            (2, 0.74, "Al Jazeera"),
    "time.com":                 (2, 0.73, "TIME"),
    "theatlantic.com":          (2, 0.76, "The Atlantic"),
    "vox.com":                  (2, 0.71, "Vox"),
    "wired.com":                (2, 0.72, "Wired"),
    "scientificamerican.com":   (2, 0.80, "Scientific American"),
    "newscientist.com":         (2, 0.79, "New Scientist"),

    # ── Tier 2: Established fact-checkers ─────────────────────────────────────
    "snopes.com":               (2, 0.83, "Snopes"),
    "politifact.com":           (2, 0.83, "PolitiFact"),
    "factcheck.org":            (2, 0.84, "FactCheck.org"),
    "fullfact.org":             (2, 0.84, "Full Fact"),
    "checkyourfact.com":        (2, 0.72, "Check Your Fact"),
    "leadstories.com":          (2, 0.71, "Lead Stories"),
    "verafiles.org":            (2, 0.73, "Vera Files"),
    "africacheck.org":          (2, 0.76, "Africa Check"),

    # ── Tier 3: Reference & secondary ─────────────────────────────────────────
    "wikipedia.org":            (3, 0.60, "Wikipedia"),
    "britannica.com":           (3, 0.65, "Encyclopaedia Britannica"),
    "statista.com":             (3, 0.58, "Statista"),
    "worldbank.org":            (3, 0.62, "World Bank"),
    "imf.org":                  (3, 0.63, "IMF"),

    # ── Tier 0: Known disinfo / satire ────────────────────────────────────────
    "infowars.com":             (0, 0.02, "InfoWars"),
    "naturalnews.com":          (0, 0.03, "Natural News"),
    "beforeitsnews.com":        (0, 0.02, "Before It's News"),
    "theonion.com":             (0, 0.05, "The Onion (Satire)"),
    "babylonbee.com":           (0, 0.05, "Babylon Bee (Satire)"),
    "worldnewsdailyreport.com": (0, 0.02, "WNDR (Satire)"),
    "empirenews.net":           (0, 0.02, "Empire News (Satire)"),
}

_STAR_MAP = {
    1: "★★★★★",
    2: "★★★★☆",
    3: "★★★☆☆",
    4: "★★☆☆☆",
    0: "★☆☆☆☆",
}


def _extract_domain(url: str) -> str:
    """Return the bare domain from a URL, stripping www. prefix."""
    try:
        host = urlparse(url).netloc.lower()
        return re.sub(r"^www\.", "", host)
    except Exception:
        return ""


def score_result(result: dict) -> dict:
    """
    Attach credibility metadata to a single Serper search result dict.

    Adds keys:
      credibility_score (float 0–1)
      tier              (int 0–4)
      tier_label        (str display name)
      stars             (str unicode star rating)
    """
    url = result.get("link", "")
    domain = _extract_domain(url)

    # Default: unknown domain → Tier 4
    tier, score, name = 4, 0.30, domain or "Unknown source"

    # Try longest matching suffix first (more specific wins)
    best_match_len = 0
    for registered, data in _TIER_REGISTRY.items():
        if (domain == registered or domain.endswith("." + registered)):
            if len(registered) > best_match_len:
                tier, score, name = data
                best_match_len = len(registered)

    result = dict(result)
    result["credibility_score"] = score
    result["tier"]              = tier
    result["tier_label"]        = name
    result["stars"]             = _STAR_MAP.get(tier, "★★☆☆☆")
    return result


def score_results(results: list[dict]) -> list[dict]:
    """Score an entire list of Serper results."""
    return [score_result(r) for r in results]


def avg_score(results: list[dict]) -> float:
    """Average credibility score across a list of already-scored results."""
    if not results:
        return 0.0
    scores = [r.get("credibility_score", 0.30) for r in results]
    return round(sum(scores) / len(scores), 3)


def quality_label(score: float) -> str:
    """Convert avg credibility score to HIGH / MEDIUM / LOW label."""
    if score >= 0.70:
        return "HIGH"
    if score >= 0.45:
        return "MEDIUM"
    return "LOW"
