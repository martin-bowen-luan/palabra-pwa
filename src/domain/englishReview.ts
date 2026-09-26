import type { WordProgress } from '../types'

// Expanding-spacing product defaults, not a universal Ebbinghaus timetable.
export const ENGLISH_INTERVAL_MINUTES = [10, 1440, 2880, 5760, 10080, 21600, 43200] as const
export type EnglishReviewOutcome = 'remembered' | 'forgotten' | 'skipped'

export function scheduleEnglishReview(current: WordProgress | undefined, wordId: string, outcome: EnglishReviewOutcome, now = new Date()): WordProgress {
  const legacyMinutes = current ? Math.max(10, (Date.parse(current.nextReviewAt) - Date.parse(current.lastReviewedAt)) / 60000) : 10
  const previousStage = current?.scheduleVersion === 1 ? current.stage
    : Math.max(0, ENGLISH_INTERVAL_MINUTES.findIndex(minutes => minutes >= legacyMinutes))
  const stage = outcome !== 'remembered' || !current ? 0 : Math.min(6, previousStage + 1)
  return {
    ...current, wordId, language: 'en', stage, scheduleVersion: 1,
    status: stage === 6 ? 'mastered' : 'learning', skipReview: false,
    reviewPriority: outcome === 'skipped' ? 'skipped' : 'normal',
    nextReviewAt: new Date(now.getTime() + ENGLISH_INTERVAL_MINUTES[stage] * 60000).toISOString(),
    lastReviewedAt: now.toISOString(), reviewCount: (current?.reviewCount ?? 0) + 1,
    correctCount: (current?.correctCount ?? 0) + Number(outcome === 'remembered'),
  }
}

export function reviewUrgency(progress: WordProgress, now = new Date()): number {
  const last = Date.parse(progress.lastReviewedAt)
  const interval = Math.max(60000, Date.parse(progress.nextReviewAt) - last)
  const elapsedRatio = Math.max(0, (now.getTime() - last) / interval)
  return elapsedRatio + (progress.reviewPriority === 'skipped' ? 0.25 : 0)
}
