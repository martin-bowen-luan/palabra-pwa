import { describe, expect, it } from 'vitest'
import { scheduleEnglishReview, reviewUrgency } from './englishReview'
import { buildDailyPlan } from './dailyPlan'
import type { VocabularyEntry } from '../types'

const now = new Date('2026-09-26T10:00:00Z')
describe('English expanding review', () => {
  it('starts with a short review then expands only after subsequent recall', () => {
    const first = scheduleEnglishReview(undefined, 'en:word', 'remembered', now)
    expect(first.nextReviewAt).toBe('2026-09-26T10:10:00.000Z')
    const second = scheduleEnglishReview(first, first.wordId, 'remembered', new Date(first.nextReviewAt))
    expect(second.nextReviewAt).toBe('2026-09-27T10:10:00.000Z')
    expect(second.stage).toBe(1)
  })
  it('resets a skipped word and gives it a modest boost without starving overdue words', () => {
    const base = scheduleEnglishReview(undefined, 'en:base', 'remembered', now)
    const skipped = scheduleEnglishReview({ ...base, stage: 5 }, 'en:skip', 'skipped', now)
    expect(skipped.stage).toBe(0)
    expect(skipped.reviewPriority).toBe('skipped')
    const due = new Date('2026-09-26T10:10:00Z')
    expect(reviewUrgency(skipped, due)).toBeGreaterThan(reviewUrgency(base, due))
    expect(reviewUrgency({ ...base, lastReviewedAt: '2026-09-26T09:00:00Z', nextReviewAt: '2026-09-26T09:10:00Z' }, due)).toBeGreaterThan(reviewUrgency(skipped, due))
    expect(scheduleEnglishReview(skipped, skipped.wordId, 'remembered', due).reviewPriority).toBe('normal')
  })
  it('sorts only due words by risk and excludes fluent words', () => {
    const a = scheduleEnglishReview(undefined, 'en:a', 'remembered', now)
    const b = scheduleEnglishReview(undefined, 'en:b', 'skipped', now)
    const c = { ...a, wordId: 'en:c', skipReview: true }
    const words = ['a', 'b', 'c'].map(term => ({ id: `en:${term}`, language: 'en', term } as VocabularyEntry))
    expect(buildDailyPlan(words, { [a.wordId]: a, [b.wordId]: b, [c.wordId]: c }, 0, now).review).toHaveLength(0)
    expect(buildDailyPlan(words, { [a.wordId]: a, [b.wordId]: b, [c.wordId]: c }, 0, new Date(a.nextReviewAt)).review.map(w => w.id)).toEqual(['en:b', 'en:a'])
  })
  it('expands through all seven intervals, caps at thirty days, and resets after forgetting', () => {
    let record = scheduleEnglishReview(undefined, 'en:word', 'remembered', now)
    for (const minutes of [1440, 2880, 5760, 10080, 21600, 43200, 43200]) {
      const reviewedAt = new Date(record.nextReviewAt)
      record = scheduleEnglishReview(record, record.wordId, 'remembered', reviewedAt)
      expect(Date.parse(record.nextReviewAt) - reviewedAt.getTime()).toBe(minutes * 60000)
    }
    expect(record.stage).toBe(6)
    const forgotten = scheduleEnglishReview(record, record.wordId, 'forgotten', now)
    expect(forgotten.stage).toBe(0)
    expect(forgotten.nextReviewAt).toBe('2026-09-26T10:10:00.000Z')
  })
  it('preserves a legacy English interval when moving into the new schedule', () => {
    const legacy = { ...scheduleEnglishReview(undefined, 'en:old', 'remembered', now), scheduleVersion: undefined, stage: 3, nextReviewAt: '2026-10-10T10:00:00.000Z' }
    const migrated = scheduleEnglishReview(legacy, legacy.wordId, 'remembered', new Date(legacy.nextReviewAt))
    expect(migrated.scheduleVersion).toBe(1)
    expect(migrated.stage).toBe(6)
    expect(migrated.nextReviewAt).toBe('2026-11-09T10:00:00.000Z')
  })
})
