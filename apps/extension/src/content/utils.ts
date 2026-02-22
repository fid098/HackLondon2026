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
  'www.youtube.com':     '#content-text, #title h1 yt-formatted-string',
  'youtube.com':         '#content-text, #title h1 yt-formatted-string',
  'www.tiktok.com':      '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]',
  'tiktok.com':          '[data-e2e="browse-video-desc"], [data-e2e="video-desc"]',
  'web.telegram.org':    '.message .text-content',
  'telegram.org':        '.message .text-content',
}

/** Platform-specific CSS selectors for playable video elements. */
const VIDEO_SELECTORS: Record<string, string> = {
  'x.com':             'video',
  'twitter.com':       'video',
  'www.instagram.com': 'video',
  'instagram.com':     'video',
  'www.facebook.com':  'video',
  'facebook.com':      'video',
  'www.youtube.com':   'video.html5-main-video, video',
  'youtube.com':       'video.html5-main-video, video',
  'www.tiktok.com':    'video',
  'tiktok.com':        'video',
  'web.telegram.org':  'video',
  'telegram.org':      'video',
  'meet.google.com':   'video',
  'zoom.us':           'video',
  'app.zoom.us':       'video',
  'localhost':         'video',
  '127.0.0.1':         'video',
}

/**
 * Returns the post-text CSS selector for a given hostname, or null if
 * the hostname is not a supported platform.
 */
export function getPostSelector(hostname: string): string | null {
  return POST_SELECTORS[hostname] ?? null
}

/**
 * Returns the video CSS selector for a hostname, or null if unsupported.
 * Used by the content script's real-time deepfake frame-sampling pipeline.
 */
export function getVideoSelector(hostname: string): string | null {
  const direct = VIDEO_SELECTORS[hostname]
  if (direct) return direct

  // Covers subdomains such as us05web.zoom.us, eu01web.zoom.us, etc.
  if (hostname.endsWith('.zoom.us')) return 'video'
  return null
}

/**
 * Returns true when a hostname is a live-meeting surface where camera feeds
 * are commonly rendered as <video> elements.
 */
export function isMeetingHostname(hostname: string): boolean {
  const host = hostname.toLowerCase()
  return (
    host === 'meet.google.com' ||
    host === 'zoom.us' ||
    host === 'app.zoom.us' ||
    host.endsWith('.zoom.us') ||
    host === 'localhost' ||
    host === '127.0.0.1'
  )
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
