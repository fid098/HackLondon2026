/**
 * Content Script — Phase 4 implementation.
 *
 * DEVELOPER: Fidel
 * ─────────────────────────────────────────────────────────────────────────────
 * This script is injected by Chrome into every page that matches the URLs
 * listed in manifest.json → content_scripts.matches (X, Instagram, Facebook).
 *
 * WHAT THIS SCRIPT DOES
 * ──────────────────────
 * 1. On page load: runs scanPosts() to find existing post elements and
 *    send each one to the background worker for triage analysis.
 * 2. For each post that scores confidence ≥ BADGE_THRESHOLD:
 *    injects a coloured verdict badge (tg-badge) onto the post element.
 * 3. Listens for user text selection (mouseup) and shows a "Check →" tooltip.
 * 4. Listens for SHOW_RESULT messages pushed by the background worker when
 *    the user triggers analysis via the right-click context menu.
 * 5. Runs a MutationObserver to re-scan whenever new posts appear in the DOM
 *    (handles infinite scroll on Twitter, Instagram, etc.).
 *
 * SECURITY RULES
 * ───────────────
 * - NEVER embed API keys here. This file is readable by any webpage's devtools.
 * - ALL API calls go through the background worker (sendAnalyze → ANALYZE_TEXT).
 * - ONLY read page content — never modify post text or submit forms.
 *
 * HOW BADGES WORK
 * ────────────────
 * Badges are <div class="tg-badge tg-{verdict}"> elements appended to the post.
 * They are styled by overlay.css (injected alongside this script).
 * The verdict CSS classes are: tg-true, tg-false, tg-misleading, tg-unverified.
 * See utils.ts → verdictClass() for the verdict → class mapping.
 *
 * HOW THE CONTEXT MENU FLOW WORKS
 * ─────────────────────────────────
 * User selects text → right-click → "Analyze with TruthGuard"
 * → background worker calls analyzeViaAPI() → sends SHOW_RESULT to this script
 * → showResultBanner() displays a result bar at the bottom of the page.
 *
 * See docs/developers/FIDEL.md for full architecture diagram and task list.
 */

import { getPostSelector, extractText, isAnalyzable, truncate, verdictClass } from './utils'

// ── Badge threshold ────────────────────────────────────────────────────────────
//
// A badge is only injected when the triage confidence >= BADGE_THRESHOLD.
// This prevents noisy badges on low-confidence verdicts.
//
// This value should mirror the sensitivity setting stored in chrome.storage.sync:
//   low      → threshold 80  (only flag very high-confidence findings)
//   medium   → threshold 60  (current default — balanced)
//   high     → threshold 40  (flag more posts, more false positives)
//
// TODO (Fidel): Load the threshold dynamically from chrome.storage.sync by
// calling chrome.runtime.sendMessage({ type: 'GET_SETTINGS' }) on startup
// and using settings.sensitivity to derive the threshold.
const BADGE_THRESHOLD = 60

// Cache the current page's hostname to avoid repeated window.location.hostname calls
const hostname = window.location.hostname

// ── Badge injection ────────────────────────────────────────────────────────────

function injectBadge(el: HTMLElement, verdict: string, confidence: number): void {
  // Guard: skip if this element already has a badge (prevents duplicate badges
  // if scanPosts() is called multiple times by the MutationObserver).
  if (el.querySelector('.tg-badge')) return

  const badge = document.createElement('div')
  // verdictClass() maps e.g. 'FALSE' → 'tg-false' (used for CSS colour in overlay.css)
  badge.className = `tg-badge ${verdictClass(verdict)}`
  badge.setAttribute('title', `TruthGuard: ${verdict} — ${confidence}% confidence`)
  badge.innerHTML =
    `<span class="tg-badge-icon">\u{1F6E1}</span>` +            // 🛡
    `<span class="tg-badge-verdict">${verdict}</span>` +
    `<span class="tg-badge-pct">${confidence}%</span>`
  el.appendChild(badge)
}

// ── Selection tooltip ──────────────────────────────────────────────────────────

// Remove any existing tooltip before showing a new one
function removeTooltip(): void {
  document.getElementById('tg-tooltip')?.remove()
}

// Show a floating "Check →" tooltip near the user's text selection.
// rect = the bounding box of the selected range, used for positioning.
function showTooltip(text: string, rect: DOMRect): void {
  removeTooltip()

  const tip = document.createElement('div')
  tip.id = 'tg-tooltip'
  tip.className = 'tg-tooltip'
  tip.innerHTML =
    `<span class="tg-tooltip-icon">\u{1F6E1}</span>` +          // 🛡
    `<span class="tg-tooltip-label">Analyze: <em>${truncate(text, 40)}</em></span>` +
    `<button class="tg-tooltip-btn" id="tg-analyze-btn">Check \u2192</button>`  // →

  // Position tooltip just below the selection
  tip.style.top  = `${rect.bottom + window.scrollY + 6}px`
  tip.style.left = `${rect.left  + window.scrollX}px`
  document.body.appendChild(tip)

  // When "Check →" is clicked: remove tooltip, send text to background for analysis,
  // then show the result in a banner at the bottom of the page.
  document.getElementById('tg-analyze-btn')?.addEventListener('click', () => {
    removeTooltip()
    sendAnalyze(text, (result) => {
      showResultBanner(result.verdict, result.confidence, result.summary)
    })
  })
}

// Show a result banner fixed at the bottom of the page.
// Auto-dismisses after 12 seconds. Has a manual close button.
function showResultBanner(verdict: string, confidence: number, summary: string): void {
  // Remove any existing banner before showing a new one
  document.getElementById('tg-result-banner')?.remove()

  const banner = document.createElement('div')
  banner.id = 'tg-result-banner'
  // verdictClass maps verdict to a CSS class that sets the border/text colour
  banner.className = `tg-result-banner ${verdictClass(verdict)}`
  banner.innerHTML =
    `<div class="tg-result-header">` +
      `<span class="tg-badge-icon">\u{1F6E1}</span>` +
      `<strong>TruthGuard</strong>` +
      `<span class="tg-result-verdict">${verdict} &mdash; ${confidence}%</span>` +
      `<button class="tg-result-close" id="tg-result-close">\u00D7</button>` +  // ×
    `</div>` +
    `<p class="tg-result-summary">${summary}</p>`
  document.body.appendChild(banner)

  // Manual close button
  document.getElementById('tg-result-close')?.addEventListener('click', () => banner.remove())
  // Auto-dismiss after 12 seconds
  setTimeout(() => banner.remove(), 12000)
}

// ── Message passing to the background worker ───────────────────────────────────

type TriageResult = { verdict: string; confidence: number; summary: string }

// Send text to the background worker for triage analysis.
//
// WHY NOT CALL THE API DIRECTLY FROM HERE?
// Content scripts run in the page's security origin. A fetch() to
// http://localhost:8000 from a page on x.com would be blocked by CORS.
// The background worker runs in the extension's own origin and is exempt.
//
// The background worker receives ANALYZE_TEXT, calls POST /api/v1/triage,
// and sends back { ok: true, data: TriageResult } via sendResponse.
//
// IMPORTANT: chrome.runtime.lastError must be checked in the callback —
// if the background worker restarts (service worker lifecycle), the channel
// closes and this would otherwise throw an uncaught error.
function sendAnalyze(text: string, callback: (r: TriageResult) => void): void {
  chrome.runtime.sendMessage({ type: 'ANALYZE_TEXT', payload: text }, (response) => {
    if (chrome.runtime.lastError) return   // background worker may have restarted
    if (response?.ok) callback(response.data as TriageResult)
  })
}

// ── Post scanning ──────────────────────────────────────────────────────────────

function scanPosts(): void {
  // getPostSelector returns the CSS selector for "post" elements on this platform.
  // Returns null if the platform is not yet supported (e.g. LinkedIn).
  const selector = getPostSelector(hostname)
  if (!selector) return

  document.querySelectorAll<HTMLElement>(selector).forEach((el) => {
    // data-tgScanned prevents the same post from being sent for analysis multiple
    // times. MutationObserver fires very frequently (every DOM change), so without
    // this guard we would send thousands of duplicate requests.
    if (el.dataset.tgScanned) return
    el.dataset.tgScanned = 'true'   // mark as scanned immediately (before async response)

    const text = extractText(el)
    // isAnalyzable checks min length (≥ 30 chars) — skip very short posts
    if (!isAnalyzable(text)) return

    sendAnalyze(text, (result) => {
      if (result.confidence >= BADGE_THRESHOLD) {
        // Inject the badge on the closest article container for better positioning
        const container = el.closest<HTMLElement>('article, [role="article"]') ?? el
        injectBadge(container, result.verdict, result.confidence)
      }
    })
  })
}

// ── Event listeners ────────────────────────────────────────────────────────────

// Show tooltip when user releases mouse after selecting text
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

// Hide tooltip when user clicks elsewhere (not inside the tooltip itself)
document.addEventListener('mousedown', (e: MouseEvent) => {
  if (!(e.target as HTMLElement).closest('#tg-tooltip')) removeTooltip()
})

// Listen for SHOW_RESULT messages from the background worker (context-menu flow).
// The background worker sends this after the user right-clicks → "Analyze with TruthGuard".
chrome.runtime.onMessage.addListener(
  (message: { type: string; payload?: TriageResult }) => {
    if (message.type === 'SHOW_RESULT' && message.payload) {
      const { verdict, confidence, summary } = message.payload
      showResultBanner(verdict, confidence, summary)
    }
  },
)

// ── Initial scan + MutationObserver for infinite scroll ───────────────────────

// Run once immediately to badge any posts already in the DOM on page load
scanPosts()

// MutationObserver watches for DOM changes (new nodes added).
// WHY: Twitter, Instagram, and most social media sites use infinite scroll —
// they add new post elements to the DOM as the user scrolls down.
// Without this observer, only the initial page load would be scanned.
// childList: true = watch for element additions/removals
// subtree: true   = watch the entire document tree, not just direct children
const _observer = new MutationObserver(() => scanPosts())
_observer.observe(document.body, { childList: true, subtree: true })

export {}
