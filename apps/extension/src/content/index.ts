/**
 * Content Script — Phase 4 implementation.
 *
 * Injected into matched social-media pages (X, Instagram, Facebook).
 *
 * What this does:
 *   1. Scans visible post elements using platform-specific selectors.
 *   2. Sends each post text to the background service worker for triage.
 *   3. Injects a verdict badge on flagged posts (confidence ≥ BADGE_THRESHOLD).
 *   4. Listens for text selection → shows an "Analyze" tooltip.
 *   5. Handles SHOW_RESULT messages from the context-menu flow.
 *
 * Security rules:
 *   - NEVER embed API keys here.
 *   - All API calls go through the background service worker proxy.
 *   - Only read page content — never modify post text.
 */

import { getPostSelector, extractText, isAnalyzable, truncate, verdictClass } from './utils'

/** Minimum confidence to inject a badge onto a post. */
const BADGE_THRESHOLD = 60

const hostname = window.location.hostname

// ── Badge injection ───────────────────────────────────────────────────────────

function injectBadge(el: HTMLElement, verdict: string, confidence: number): void {
  if (el.querySelector('.tg-badge')) return  // already badged

  const badge = document.createElement('div')
  badge.className = `tg-badge ${verdictClass(verdict)}`
  badge.setAttribute('title', `TruthGuard: ${verdict} — ${confidence}% confidence`)
  badge.innerHTML =
    `<span class="tg-badge-icon">\u{1F6E1}</span>` +
    `<span class="tg-badge-verdict">${verdict}</span>` +
    `<span class="tg-badge-pct">${confidence}%</span>`
  el.appendChild(badge)
}

// ── Selection tooltip ─────────────────────────────────────────────────────────

function removeTooltip(): void {
  document.getElementById('tg-tooltip')?.remove()
}

function showTooltip(text: string, rect: DOMRect): void {
  removeTooltip()

  const tip = document.createElement('div')
  tip.id = 'tg-tooltip'
  tip.className = 'tg-tooltip'
  tip.innerHTML =
    `<span class="tg-tooltip-icon">\u{1F6E1}</span>` +
    `<span class="tg-tooltip-label">Analyze: <em>${truncate(text, 40)}</em></span>` +
    `<button class="tg-tooltip-btn" id="tg-analyze-btn">Check \u2192</button>`

  tip.style.top  = `${rect.bottom + window.scrollY + 6}px`
  tip.style.left = `${rect.left  + window.scrollX}px`
  document.body.appendChild(tip)

  document.getElementById('tg-analyze-btn')?.addEventListener('click', () => {
    removeTooltip()
    sendAnalyze(text, (result) => {
      showResultBanner(result.verdict, result.confidence, result.summary)
    })
  })
}

function showResultBanner(verdict: string, confidence: number, summary: string): void {
  document.getElementById('tg-result-banner')?.remove()
  const banner = document.createElement('div')
  banner.id = 'tg-result-banner'
  banner.className = `tg-result-banner ${verdictClass(verdict)}`
  banner.innerHTML =
    `<div class="tg-result-header">` +
      `<span class="tg-badge-icon">\u{1F6E1}</span>` +
      `<strong>TruthGuard</strong>` +
      `<span class="tg-result-verdict">${verdict} &mdash; ${confidence}%</span>` +
      `<button class="tg-result-close" id="tg-result-close">\u00D7</button>` +
    `</div>` +
    `<p class="tg-result-summary">${summary}</p>`
  document.body.appendChild(banner)
  document.getElementById('tg-result-close')?.addEventListener('click', () => banner.remove())
  setTimeout(() => banner.remove(), 12000)
}

// ── Message passing ───────────────────────────────────────────────────────────

type TriageResult = { verdict: string; confidence: number; summary: string }

function sendAnalyze(text: string, callback: (r: TriageResult) => void): void {
  chrome.runtime.sendMessage({ type: 'ANALYZE_TEXT', payload: text }, (response) => {
    if (chrome.runtime.lastError) return
    if (response?.ok) callback(response.data as TriageResult)
  })
}

// ── Post scanning ─────────────────────────────────────────────────────────────

function scanPosts(): void {
  const selector = getPostSelector(hostname)
  if (!selector) return

  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    if (el.dataset.tgScanned) return
    el.dataset.tgScanned = 'true'

    const text = extractText(el)
    if (!isAnalyzable(text)) return

    sendAnalyze(text, (result) => {
      if (result.confidence >= BADGE_THRESHOLD) {
        const container = el.closest<HTMLElement>('article, [role="article"]') ?? el
        injectBadge(container, result.verdict, result.confidence)
      }
    })
  })
}

// ── Event listeners ───────────────────────────────────────────────────────────

document.addEventListener('mouseup', () => {
  const sel  = window.getSelection()
  const text = sel?.toString().trim() ?? ''
  if (isAnalyzable(text) && sel?.rangeCount) {
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    showTooltip(text, rect)
  } else {
    removeTooltip()
  }
})

document.addEventListener('mousedown', (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('#tg-tooltip')) removeTooltip()
})

// Listen for results pushed by the context-menu flow in background.ts
chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: TriageResult }) => {
    if (message.type === 'SHOW_RESULT' && message.payload) {
      const { verdict, confidence, summary } = message.payload
      showResultBanner(verdict, confidence, summary)
    }
  },
)

// ── Initial scan + MutationObserver ───────────────────────────────────────────

scanPosts()

const _observer = new MutationObserver(() => scanPosts())
_observer.observe(document.body, { childList: true, subtree: true })

export {}
