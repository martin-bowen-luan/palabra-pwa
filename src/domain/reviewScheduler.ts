import type { LearningLanguage, ReviewRating, WordProgress } from '../types'

export const REVIEW_INTERVALS = [1, 3, 7, 14, 30] as const

function addDays(date: Date, days: number): string {
  const result = new Date(date)
  result.setUTCDate(result.getUTCDate() + days)
  return result.toISOString()
}

export function applyReview(
  current: WordProgress,
  rating: ReviewRating,
  now = new Date(),
): WordProgress {
  const nextStage = rating === 'forgotten'
    ? 0
    : rating === 'fuzzy'
      ? Math.max(0, current.stage - 1)
      : Math.min(REVIEW_INTERVALS.length - 1, current.stage + 1)

  return {
    ...current,
    stage: nextStage,
    status: nextStage === REVIEW_INTERVALS.length - 1 ? 'mastered' : 'learning',
    nextReviewAt: addDays(now, REVIEW_INTERVALS[nextStage]),
    reviewCount: current.reviewCount + 1,
    correctCount: current.correctCount + (rating === 'known' ? 1 : 0),
    lastReviewedAt: now.toISOString(),
  }
}

export function createProgress(
  wordId: string,
  rating: ReviewRating,
  now = new Date(),
  language: LearningLanguage = wordId.startsWith('en:') ? 'en' : 'es',
): WordProgress {
  const seed: WordProgress = {
    wordId,
    language,
    stage: 0,
    status: 'learning',
    nextReviewAt: now.toISOString(),
    reviewCount: 0,
    correctCount: 0,
    lastReviewedAt: now.toISOString(),
  }
  return applyReview(seed, rating, now)
}

export function isDue(progress: WordProgress, now = new Date()): boolean {
  return !progress.skipReview && new Date(progress.nextReviewAt).getTime() <= now.getTime()
}

export function markFluent(
  current: WordProgress | undefined,
  wordId: string,
  language: LearningLanguage,
  now = new Date(),
): WordProgress {
  return {
    wordId,
    language,
    stage: REVIEW_INTERVALS.length - 1,
    status: 'mastered',
    nextReviewAt: current?.nextReviewAt ?? now.toISOString(),
    reviewCount: current?.reviewCount ?? 0,
    correctCount: current?.correctCount ?? 0,
    lastReviewedAt: now.toISOString(),
    skipReview: true,
  }
}

export function normalizeSpelling(value: string): string {
  return value.trim().toLocaleLowerCase('es')
}

export function isCorrectSpelling(input: string, expected: string, variants: readonly string[] = []): boolean {
  const normalized = normalizeSpelling(input)
  return [expected, ...variants].some((candidate) => normalizeSpelling(candidate) === normalized)
}
