/**
 * utils.ts — Pure utility functions for the TruthGuard content script.
 *
 * No Chrome APIs here — these functions are fully unit-testable in jsdom.
 */

/** Minimum text length (chars) worth sending to the triage API. */
export const MIN_TEXT_LENGTH = 20

/** Platform-specific CSS selectors for post text elements. */
const POST_SELECTORS: Record<string, string> = {
  'x.com':               '[data-testid="tweetText"]',
  'twitter.com':         '[data-testid="tweetText"]',
  'www.instagram.com':   '._a9zs',
  'instagram.com':       '._a9zs',
  'www.facebook.com':    '[data-ad-preview="message"]',
  'facebook.com':        '[data-ad-preview="message"]',
}

/**
 * Returns the post-text CSS selector for a given hostname, or null if
 * the hostname is not a supported platform.
 */
export function getPostSelector(hostname: string): string | null {
  return POST_SELECTORS[hostname] ?? null
}

/** Extracts trimmed text content from a DOM element. */
export function extractText(el: HTMLElement): string {
  return el.textContent?.trim() ?? ''
}

/** True if the text is long enough to be worth analysing. */
export function isAnalyzable(text: string): boolean {
  return text.trim().length >= MIN_TEXT_LENGTH
}

/**
 * Truncates text to `max` characters, appending an ellipsis if truncated.
 * Used to fit text into badge tooltips and selection popups.
 */
export function truncate(text: string, max = 60): string {
  if (text.length <= max) return text
  return text.slice(0, max).trimEnd() + '\u2026'
}

/**
 * Maps a verdict string to a CSS modifier class.
 * e.g. "FALSE" → "tg-verdict-false"
 */
export function verdictClass(verdict: string): string {
  return `tg-verdict-${verdict.toLowerCase()}`
}

/**
 * Returns a human-readable severity label based on confidence.
 *   ≥ 70 → high
 *   ≥ 40 → medium
 *    < 40 → low
 */
export function getSeverity(confidence: number): 'high' | 'medium' | 'low' {
  if (confidence >= 70) return 'high'
  if (confidence >= 40) return 'medium'
  return 'low'
}
