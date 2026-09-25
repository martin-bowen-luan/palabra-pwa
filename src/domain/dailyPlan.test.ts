import { describe, expect, it } from 'vitest'
import { buildDailyPlan } from './dailyPlan'
import type { VocabularyEntry, WordProgress } from '../types'

const vocabulary: VocabularyEntry[] = Array.from({ length: 12 }, (_, index) => ({
  id: `word-${index}`,
  spanish: `palabra-${index}`,
  partOfSpeech: '名词',
  chinese: `词-${index}`,
  category: '基础',
  example: `Una palabra ${index}.`,
  exampleZh: `一个词 ${index}。`,
}))

describe('daily plan', () => {
  it('places due reviews before unseen words', () => {
    const progress: Record<string, WordProgress> = {
      'word-10': {
        wordId: 'word-10',
        stage: 1,
        status: 'learning',
        nextReviewAt: '2026-09-24T00:00:00.000Z',
        reviewCount: 1,
        correctCount: 1,
        lastReviewedAt: '2026-09-21T00:00:00.000Z',
      },
    }
    const plan = buildDailyPlan(vocabulary, progress, 3, new Date('2026-09-25T08:00:00.000Z'))
    expect(plan.review.map((word) => word.id)).toEqual(['word-10'])
    expect(plan.newWords).toHaveLength(3)
    expect(plan.newWords.some((word) => word.id === 'word-10')).toBe(false)
  })

  it('never exceeds the requested number of new words', () => {
    const plan = buildDailyPlan(vocabulary, {}, 5, new Date('2026-09-25T08:00:00.000Z'))
    expect(plan.newWords).toHaveLength(5)
  })
})
