/**
 * Content Script — Injected into matched social media pages.
 *
 * Phase 0: Scaffold only. Logs that the script loaded successfully.
 *
 * Phase 4 will implement:
 *   1. DOM scanning — identify post/tweet/caption elements by platform selectors
 *   2. Text extraction — pull post text for quick triage
 *   3. Gemini Flash triage — send to backend, get back a confidence score
 *   4. Overlay badge injection — subtle "⚠ Check" badge on flagged posts
 *   5. Selection listener — user highlights text → "Analyze with TruthGuard" tooltip
 *   6. Message passing — send analysis requests to background service worker
 *
 * Security rules (NEVER violate):
 *   - NEVER embed API keys in content scripts
 *   - All AI calls go through background → API proxy
 *   - Respect CSP; don't eval() or inject arbitrary scripts
 *   - Only read, never modify, post content without user intent
 */

console.log(
  '[TruthGuard] Content script active on',
  window.location.hostname,
  '— Phase 4 will add post scanning.',
)

// Phase 4: Platform-specific selectors for post text extraction
// const PLATFORM_SELECTORS = {
//   'x.com': '[data-testid="tweetText"]',
//   'twitter.com': '[data-testid="tweetText"]',
//   'instagram.com': '._a9zs',  // Subject to change; test regularly
// }

// Phase 4: Listen for text selection to show "Analyze" tooltip
// document.addEventListener('mouseup', () => {
//   const selection = window.getSelection()?.toString().trim()
//   if (selection && selection.length > 20) {
//     showAnalyzeTooltip(selection)
//   }
// })

export {}  // Makes this a module (avoids global scope pollution)
