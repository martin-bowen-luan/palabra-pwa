import { describe, expect, it } from 'vitest'
import { applyReview, isDue, normalizeSpelling } from './reviewScheduler'
import type { WordProgress } from '../types'

const baseProgress: WordProgress = {
  wordId: 'hola',
  language: 'es',
  stage: 2,
  status: 'learning',
  nextReviewAt: '2026-09-25T00:00:00.000Z',
  reviewCount: 3,
  correctCount: 2,
  lastReviewedAt: '2026-09-24T00:00:00.000Z',
}

describe('review scheduling', () => {
  it('advances a known word to the next interval', () => {
    const result = applyReview(baseProgress, 'known', new Date('2026-09-25T08:00:00.000Z'))
    expect(result.stage).toBe(3)
    expect(result.nextReviewAt).toBe('2026-10-09T08:00:00.000Z')
    expect(result.correctCount).toBe(3)
  })

  it('moves a fuzzy word back one stage', () => {
    const result = applyReview(baseProgress, 'fuzzy', new Date('2026-09-25T08:00:00.000Z'))
    expect(result.stage).toBe(1)
    expect(result.nextReviewAt).toBe('2026-09-28T08:00:00.000Z')
  })

  it('resets a forgotten word to one day', () => {
    const result = applyReview(baseProgress, 'forgotten', new Date('2026-09-25T08:00:00.000Z'))
    expect(result.stage).toBe(0)
    expect(result.nextReviewAt).toBe('2026-09-26T08:00:00.000Z')
  })

  it('treats a review scheduled earlier today as due', () => {
    expect(isDue(baseProgress, new Date('2026-09-25T08:00:00.000Z'))).toBe(true)
  })
})

describe('spelling normalization', () => {
  it('ignores casing and surrounding spaces', () => {
    expect(normalizeSpelling('  También ')).toBe('también')
  })

  it('preserves accents and ñ', () => {
    expect(normalizeSpelling('año')).not.toBe(normalizeSpelling('ano'))
    expect(normalizeSpelling('si')).not.toBe(normalizeSpelling('sí'))
  })
})
