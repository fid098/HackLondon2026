/**
 * content.test.ts — Unit tests for TruthGuard content-script utilities.
 *
 * Tests pure functions from utils.ts — no Chrome APIs involved.
 * Phase 4: imports directly from utils.ts rather than redefining functions.
 */

import { describe, it, expect } from 'vitest'
import {
  MIN_TEXT_LENGTH,
  getPostSelector,
  extractText,
  isAnalyzable,
  truncate,
  verdictClass,
  getSeverity,
} from '../content/utils'

// ── getPostSelector ───────────────────────────────────────────────────────────

describe('getPostSelector', () => {
  it('returns selector for x.com', () => {
    expect(getPostSelector('x.com')).toBe('[data-testid="tweetText"]')
  })

  it('returns selector for twitter.com', () => {
    expect(getPostSelector('twitter.com')).toBe('[data-testid="tweetText"]')
  })

  it('returns selector for www.instagram.com', () => {
    expect(getPostSelector('www.instagram.com')).toBe('._a9zs')
  })

  it('returns null for an unsupported hostname', () => {
    expect(getPostSelector('example.com')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(getPostSelector('')).toBeNull()
  })
})

// ── extractText ───────────────────────────────────────────────────────────────

describe('extractText', () => {
  it('extracts and trims text from a DOM element', () => {
    const el = document.createElement('div')
    el.textContent = '  Breaking news: new study published  '
    expect(extractText(el)).toBe('Breaking news: new study published')
  })

  it('returns empty string for an empty element', () => {
    const el = document.createElement('div')
    expect(extractText(el)).toBe('')
  })
})

// ── isAnalyzable ──────────────────────────────────────────────────────────────

describe('isAnalyzable', () => {
  it(`returns true for text of exactly ${MIN_TEXT_LENGTH} chars`, () => {
    expect(isAnalyzable('A'.repeat(MIN_TEXT_LENGTH))).toBe(true)
  })

  it(`returns false for text shorter than ${MIN_TEXT_LENGTH} chars`, () => {
    expect(isAnalyzable('Too short')).toBe(false)
  })

  it(`returns false for exactly ${MIN_TEXT_LENGTH - 1} chars`, () => {
    expect(isAnalyzable('A'.repeat(MIN_TEXT_LENGTH - 1))).toBe(false)
  })

  it('returns true for a realistic social-media post', () => {
    expect(isAnalyzable('Vaccines contain microchips — this has been proven by scientists.')).toBe(true)
  })
})

// ── truncate ──────────────────────────────────────────────────────────────────

describe('truncate', () => {
  it('returns text unchanged when within max', () => {
    expect(truncate('Short text', 50)).toBe('Short text')
  })

  it('truncates with ellipsis when over max', () => {
    const long = 'A'.repeat(70)
    const result = truncate(long, 60)
    expect(result.endsWith('\u2026')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(61)
  })

  it('uses default max of 60', () => {
    const long = 'B'.repeat(80)
    const result = truncate(long)
    expect(result.endsWith('\u2026')).toBe(true)
    expect(result.length).toBeLessThanOrEqual(61)
  })

  it('does not truncate text equal to max', () => {
    const text = 'C'.repeat(60)
    expect(truncate(text, 60)).toBe(text)
  })
})

// ── verdictClass ──────────────────────────────────────────────────────────────

describe('verdictClass', () => {
  it('maps FALSE to tg-verdict-false', () => {
    expect(verdictClass('FALSE')).toBe('tg-verdict-false')
  })

  it('maps MISLEADING to tg-verdict-misleading', () => {
    expect(verdictClass('MISLEADING')).toBe('tg-verdict-misleading')
  })

  it('maps TRUE to tg-verdict-true', () => {
    expect(verdictClass('TRUE')).toBe('tg-verdict-true')
  })

  it('lowercases the verdict string', () => {
    expect(verdictClass('SATIRE')).toBe('tg-verdict-satire')
  })
})

// ── getSeverity ───────────────────────────────────────────────────────────────

describe('getSeverity', () => {
  it('returns "high" for confidence >= 70', () => {
    expect(getSeverity(70)).toBe('high')
    expect(getSeverity(95)).toBe('high')
    expect(getSeverity(100)).toBe('high')
  })

  it('returns "medium" for confidence 40-69', () => {
    expect(getSeverity(40)).toBe('medium')
    expect(getSeverity(55)).toBe('medium')
    expect(getSeverity(69)).toBe('medium')
  })

  it('returns "low" for confidence < 40', () => {
    expect(getSeverity(39)).toBe('low')
    expect(getSeverity(10)).toBe('low')
    expect(getSeverity(0)).toBe('low')
  })
})
