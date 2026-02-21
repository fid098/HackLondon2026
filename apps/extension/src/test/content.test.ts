/**
 * Content script unit tests.
 *
 * Tests pure functions extracted from the content script.
 * Phase 4 will add more substantial tests for DOM extraction logic.
 *
 * Note: Chrome APIs (chrome.runtime, etc.) are not available in Vitest's
 * jsdom environment. Tests should only cover pure functions, not chrome.* calls.
 */

import { describe, it, expect } from 'vitest'

// ─── Pure utility functions (testable without browser/Chrome APIs) ──────────

/**
 * Extracts post text from a DOM element, trimming whitespace.
 * This is the kind of helper that will be used in the real content script.
 */
function extractPostText(element: HTMLElement): string {
  return element.textContent?.trim() ?? ''
}

/**
 * Checks if a text is long enough to be worth analyzing.
 * Minimum 20 chars to avoid analyzing single words.
 */
function isAnalyzable(text: string): boolean {
  return text.trim().length >= 20
}

/**
 * Truncates text for display in overlay badges.
 */
function truncateForBadge(text: string, maxLength = 50): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength).trimEnd() + '…'
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('extractPostText', () => {
  it('extracts text content from a DOM element', () => {
    const el = document.createElement('div')
    el.textContent = '  Hello world  '
    expect(extractPostText(el)).toBe('Hello world')
  })

  it('returns empty string for empty element', () => {
    const el = document.createElement('div')
    expect(extractPostText(el)).toBe('')
  })
})

describe('isAnalyzable', () => {
  it('returns true for text >= 20 chars', () => {
    expect(isAnalyzable('This is a long enough text to analyze')).toBe(true)
  })

  it('returns false for very short text', () => {
    expect(isAnalyzable('Too short')).toBe(false)
  })

  it('returns false for exactly 19 chars', () => {
    expect(isAnalyzable('1234567890123456789')).toBe(false)
  })

  it('returns true for exactly 20 chars', () => {
    expect(isAnalyzable('12345678901234567890')).toBe(true)
  })
})

describe('truncateForBadge', () => {
  it('returns text unchanged when shorter than maxLength', () => {
    expect(truncateForBadge('Short text', 50)).toBe('Short text')
  })

  it('truncates long text with ellipsis', () => {
    const long = 'A'.repeat(60)
    const result = truncateForBadge(long, 50)
    expect(result.endsWith('…')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(51) // 50 chars + ellipsis
  })

  it('uses default maxLength of 50', () => {
    const long = 'B'.repeat(60)
    const result = truncateForBadge(long)
    expect(result.endsWith('…')).toBe(true)
  })
})
