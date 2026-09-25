import type { VocabularyEntry, WordProgress } from '../types'
import { isDue } from './reviewScheduler'

export interface DailyPlan {
  review: VocabularyEntry[]
  newWords: VocabularyEntry[]
  all: VocabularyEntry[]
}

export function buildDailyPlan(
  vocabulary: VocabularyEntry[],
  progress: Record<string, WordProgress>,
  newWordLimit: number,
  now = new Date(),
): DailyPlan {
  const review = vocabulary.filter((word) => {
    const record = progress[word.id]
    return record ? isDue(record, now) : false
  })
  const newWords = vocabulary
    .filter((word) => !progress[word.id])
    .slice(0, newWordLimit)

  return { review, newWords, all: [...review, ...newWords] }
}

