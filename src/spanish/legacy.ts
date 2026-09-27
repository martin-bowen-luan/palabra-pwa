import type { ActiveSession, VocabularyEntry, WordProgress } from '../types'
import { toLocalDate } from '../domain/stats'
import type { SpanishDailyUpdate } from './sessionTypes'

/** Recover only IDs and dates supported by the active session and saved progress.
 * Old fluent IDs may no longer be recoverable; retain their aggregate history
 * rather than inventing individual daily entries. */
export function reconcileLegacySpanish(session: ActiveSession, vocabulary: VocabularyEntry[], progress: Record<string, WordProgress>, daily?: SpanishDailyUpdate) {
  if (session.language !== 'es' || session.spanish || !vocabulary.some(word => word.spanishData)) return undefined
  const updates: SpanishDailyUpdate[] = []
  const covered = new Set(session.spanishDailyIds ?? [])
  for (const id of new Set([...session.wordIds, ...covered])) {
    const saved = progress[id], data = vocabulary.find(word => word.id === id)?.spanishData
    const at = saved && Date.parse(saved.lastReviewedAt)
    if (!data || at === undefined || !Number.isFinite(at) || at < Date.parse(session.startedAt)) continue
    covered.add(id)
    updates.push({ date: toLocalDate(new Date(at)), wordId: id, entry: {
      kind: session.newWordIds.includes(id) ? 'new' : 'review',
      lemmaId: data.lemmaId, outcome: saved.skipReview ? 'fluent' : 'legacy', at: saved.lastReviewedAt,
    } })
  }
  if (daily) { updates.push(daily); covered.add(daily.wordId) }
  const assigned = (session.assignedNewCount ?? session.newWordIds.length) + (session.assignedReviewCount ?? session.reviewWordIds.length)
  return { updates, untracked: Math.max(0, assigned - covered.size) }
}
