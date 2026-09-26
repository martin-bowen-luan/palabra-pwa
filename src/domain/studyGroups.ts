import type { StudySession, VocabularyEntry, WordProgress } from '../types'
import type { DailyPlan } from './dailyPlan'
import { buildDailyPlan } from './dailyPlan'
import { toLocalDate } from './stats'

export function buildNextStudyGroup(
  vocabulary: VocabularyEntry[],
  progress: Record<string, WordProgress>,
  sessions: StudySession[],
  dailyNewWords: number,
  now = new Date(),
  extraNewWords = 0,
): DailyPlan {
  if (extraNewWords > 0) {
    const newWords = buildDailyPlan(vocabulary, progress, Math.min(5, extraNewWords), now).newWords.slice(0, 5)
    return { all: newWords, review: [], newWords }
  }
  const completedNewToday = sessions
    .filter((session) => session.completed && session.date === toLocalDate(now))
    .reduce((sum, session) => sum + session.newCount, 0)
  const remainingNew = Math.max(0, dailyNewWords - completedNewToday)
  const plan = buildDailyPlan(vocabulary, progress, remainingNew, now)
  const all = plan.all.slice(0, 10)
  const ids = new Set(all.map((word) => word.id))
  return {
    all,
    review: plan.review.filter((word) => ids.has(word.id)),
    newWords: plan.newWords.filter((word) => ids.has(word.id)),
  }
}

export function hasMoreStudyGroups(
  vocabulary: VocabularyEntry[],
  progress: Record<string, WordProgress>,
  sessions: StudySession[],
  dailyNewWords: number,
  now = new Date(),
): boolean {
  return buildNextStudyGroup(vocabulary, progress, sessions, dailyNewWords, now).all.length > 0
}
