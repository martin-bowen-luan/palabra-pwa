import { describe, expect, it } from 'vitest'
import { createPracticeQueue, advancePractice } from './practiceQueue'
import { advanceMemoryRound, buildEnglishGroup } from './memoryRounds'
import type { ActiveSession, VocabularyEntry } from '../types'

const session = (): ActiveSession => ({ id: 'active-session:en', language: 'en', mode: 'learn', memoryRound: 'choice', wordIds: ['en:a', 'en:b'], newWordIds: ['en:a', 'en:b'], reviewWordIds: [], phase: 'quiz', currentIndex: 0, correctCount: 0, answeredCount: 0, startedAt: '2026-09-26T10:00:00Z', practice: createPracticeQueue(['en:a', 'en:b']) })
describe('four group rounds', () => {
  it('moves the whole group through four rounds and finishes after spelling', () => {
    let current = session()
    for (const next of ['context', 'recall', 'spelling', undefined]) {
      const queue = advancePractice(advancePractice(current.practice!, true), true)
      const result = advanceMemoryRound({ ...current, practice: queue })
      expect(result.finished).toBe(next === undefined)
      if (next) { expect(result.session.memoryRound).toBe(next); expect(result.session.practice?.pendingIds).toEqual(['en:a', 'en:b']) }
      current = result.session
    }
  })
  it('does not advance while an incorrect item still needs retry', () => {
    const current = session()
    expect(advanceMemoryRound({ ...current, practice: advancePractice(current.practice!, false) }).session.memoryRound).toBe('choice')
  })
  it('keeps learn and review separate and caps a twenty-word goal at ten', () => {
    const words = Array.from({ length: 21 }, (_, i) => ({ id: `en:${i}`, language: 'en' } as VocabularyEntry))
    const progress = { 'en:0': { wordId: 'en:0', language: 'en' as const, stage: 0, status: 'learning' as const, nextReviewAt: '2000-01-01', lastReviewedAt: '1999-01-01', reviewCount: 1, correctCount: 0 } }
    const learn = buildEnglishGroup(words, progress, [], 20, 'learn')
    expect(learn.newWords).toHaveLength(10)
    expect(learn.review).toHaveLength(0)
    expect(buildEnglishGroup(words, progress, [], 20, 'review').all.map(w => w.id)).toEqual(['en:0'])
  })
})
