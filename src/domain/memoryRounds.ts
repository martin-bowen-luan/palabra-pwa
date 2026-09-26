import type { ActiveSession, MemoryRound, StudyMode, StudySession, VocabularyEntry, WordProgress } from '../types'
import { createPracticeQueue } from './practiceQueue'
import { buildDailyPlan, type DailyPlan } from './dailyPlan'
import { toLocalDate } from './stats'

export const MEMORY_ROUNDS: MemoryRound[] = ['choice', 'context', 'recall', 'spelling']
export const ROUND_LABELS: Record<MemoryRound, string> = { choice: '选择释义', context: '例句回忆', recall: '无提示回忆', spelling: '集中拼写' }

export function advanceMemoryRound(session: ActiveSession): { session: ActiveSession; finished: boolean } {
  if (session.practice?.pendingIds.length || session.practice?.delayed.length) return { session, finished: false }
  if (!session.wordIds.length || session.memoryRound === 'spelling') return { session, finished: true }
  const next = MEMORY_ROUNDS[MEMORY_ROUNDS.indexOf(session.memoryRound ?? 'choice') + 1]
  const answers = Object.values(session.practice?.firstAnswers ?? {})
  return { finished: false, session: { ...session, memoryRound: next,
    correctCount: session.correctCount + answers.filter(Boolean).length,
    answeredCount: session.answeredCount + answers.length,
    practice: createPracticeQueue(session.wordIds), quizFeedback: undefined } }
}

export function buildEnglishGroup(vocabulary: VocabularyEntry[], progress: Record<string, WordProgress>, sessions: StudySession[], goal: number, mode: StudyMode, now = new Date(), extra = 0): DailyPlan {
  const completed = sessions.filter(s => s.completed && s.date === toLocalDate(now)).reduce((sum, s) => sum + s.newCount, 0)
  const plan = buildDailyPlan(vocabulary, progress, extra > 0 ? Math.min(5, extra) : Math.max(0, goal - completed), now)
  const words = (mode === 'review' ? plan.review : plan.newWords).slice(0, 10)
  return { all: words, newWords: mode === 'learn' ? words : [], review: mode === 'review' ? words : [] }
}
