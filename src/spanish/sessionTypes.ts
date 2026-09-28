import type { PracticeQueue, VocabularyEntry } from '../types'

export type SpanishOutcome = 'remembered' | 'forgotten' | 'skipped' | 'fluent'
export interface SpanishDailyEntry {
  kind: 'new' | 'review'
  lemmaId: string
  outcome: SpanishOutcome | 'legacy'
  at: string
}
export interface SpanishDailyRecord {
  /** Browser-local calendar date. Each practiced unit counts once on this date. */
  id: string
  entries: Record<string, SpanishDailyEntry>
}
export interface SpanishDailyUpdate {
  date: string
  wordId: string
  entry: SpanishDailyEntry
}
export interface SpanishSessionState {
  version: 1
  words: VocabularyEntry[]
  draft: string
  hintCount: number
  failedIds: string[]
  resolvedIds: string[]
  skippedIds: string[]
  fluentIds: string[]
  feedback?: { correct: boolean; assisted: boolean; input: string; nextPractice: PracticeQueue; answerRevealed?: boolean }
}
