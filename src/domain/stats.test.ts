import { describe, expect, it } from 'vitest'
import { calculateStreak, summarizeStages } from './stats'
import type { StudySession, WordProgress } from '../types'

describe('learning statistics', () => {
  it('counts consecutive completed local dates ending today', () => {
    const sessions: StudySession[] = [
      { id: 'a', language: 'es', date: '2026-09-25', newCount: 4, reviewCount: 2, correctCount: 5, totalCount: 6, durationSeconds: 120, completed: true },
      { id: 'b', language: 'es', date: '2026-09-24', newCount: 3, reviewCount: 1, correctCount: 4, totalCount: 4, durationSeconds: 90, completed: true },
      { id: 'c', language: 'es', date: '2026-09-22', newCount: 2, reviewCount: 0, correctCount: 2, totalCount: 2, durationSeconds: 50, completed: true },
    ]
    expect(calculateStreak(sessions, new Date(2026, 8, 25))).toBe(2)
  })

  it('groups progress into the five memory stages', () => {
    const records = [0, 0, 2, 4].map((stage, index) => ({
      wordId: `word-${index}`,
      language: 'es',
      stage,
      status: stage === 4 ? 'mastered' : 'learning',
      nextReviewAt: '2026-09-25T00:00:00.000Z',
      reviewCount: 1,
      correctCount: 1,
      lastReviewedAt: '2026-09-24T00:00:00.000Z',
    })) as WordProgress[]
    expect(summarizeStages(records)).toEqual([2, 0, 1, 0, 1])
  })
})
