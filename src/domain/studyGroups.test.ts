import { describe, expect, it } from 'vitest'
import type { StudySession, VocabularyEntry, WordProgress } from '../types'
import { buildNextStudyGroup, hasMoreStudyGroups } from './studyGroups'

const today = new Date('2026-09-26T08:00:00.000Z')
const words: VocabularyEntry[] = Array.from({ length: 25 }, (_, index) => ({
  id: `en:word-${index}`, language: 'en', term: `word-${index}`,
  partOfSpeech: 'n.', meaningZh: `词义${index}`, category: '测试', examples: [],
}))

function progressFor(entries: VocabularyEntry[], due = false): Record<string, WordProgress> {
  return Object.fromEntries(entries.map((word) => [word.id, {
    wordId: word.id, language: 'en', stage: 0, status: 'learning',
    nextReviewAt: due ? '2026-09-25T00:00:00.000Z' : '2026-09-27T00:00:00.000Z',
    reviewCount: 1, correctCount: 1, lastReviewedAt: today.toISOString(),
  }])) as Record<string, WordProgress>
}

function completed(id: string, newCount: number, reviewCount = 0): StudySession {
  return {
    id, language: 'en', date: '2026-09-26', newCount, reviewCount,
    correctCount: newCount + reviewCount, totalCount: newCount + reviewCount,
    durationSeconds: 60, completed: true,
  }
}

describe('study groups', () => {
  it('splits a 20-word target into two distinct groups of ten', () => {
    const first = buildNextStudyGroup(words, {}, [], 20, today)
    expect(first.all.map((word) => word.id)).toEqual(words.slice(0, 10).map((word) => word.id))
    const second = buildNextStudyGroup(words, progressFor(words.slice(0, 10)), [completed('one', 10)], 20, today)
    expect(second.all.map((word) => word.id)).toEqual(words.slice(10, 20).map((word) => word.id))
    expect(hasMoreStudyGroups(words, progressFor(words.slice(0, 20)), [completed('one', 10), completed('two', 10)], 20, today)).toBe(false)
  })

  it('splits a 15-word target into a ten-word and five-word group', () => {
    const next = buildNextStudyGroup(words, progressFor(words.slice(0, 10)), [completed('one', 10)], 15, today)
    expect(next.newWords.map((word) => word.id)).toEqual(words.slice(10, 15).map((word) => word.id))
  })

  it('counts due reviews inside the ten-word cap and carries remaining new words forward', () => {
    const due = words.slice(20, 24)
    const first = buildNextStudyGroup(words, progressFor(due, true), [], 20, today)
    expect(first.review).toHaveLength(4)
    expect(first.newWords).toHaveLength(6)
    expect(first.all).toHaveLength(10)
    const afterFirst = { ...progressFor(due), ...progressFor(words.slice(0, 6)) }
    const second = buildNextStudyGroup(words, afterFirst, [completed('one', 6, 4)], 20, today)
    expect(second.review).toHaveLength(0)
    expect(second.newWords.map((word) => word.id)).toEqual(words.slice(6, 16).map((word) => word.id))
  })

  it('keeps an extra five-word request to a separate new-word group', () => {
    const extra = buildNextStudyGroup(words, {}, [], 20, today, 5)
    expect(extra.newWords).toHaveLength(5)
    expect(extra.review).toHaveLength(0)
  })

  it('carries due-review overflow into the next group', () => {
    const due = words.slice(0, 12)
    const first = buildNextStudyGroup(words, progressFor(due, true), [], 5, today)
    expect(first.review).toHaveLength(10)
    expect(first.newWords).toHaveLength(0)
    const afterFirst = { ...progressFor(due, true), ...progressFor(due.slice(0, 10)) }
    const second = buildNextStudyGroup(words, afterFirst, [completed('review-1', 0, 10)], 5, today)
    expect(second.review.map((word) => word.id)).toEqual(due.slice(10).map((word) => word.id))
    expect(second.all).toHaveLength(7)
  })
})
