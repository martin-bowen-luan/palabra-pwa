import type { VocabularyEntry } from '../types'

export type LetterColor = 'absent' | 'present' | 'correct'
export interface WordleDictionaryEntry {
  term: string
  definitions: Array<{ partOfSpeech: string; text: string }>
  ipa?: string
  source: 'local' | 'wiktionary' | 'ecdict'
  sourceUrl?: string
  revisionId?: number
  fetchedAt?: string
}
export interface WordleGuess {
  term: string
  colors: LetterColor[]
  entry: WordleDictionaryEntry
}
export interface WordleGame {
  id: 'current'
  gameId: string
  answer: VocabularyEntry
  guesses: WordleGuess[]
  draft: string
  status: 'playing' | 'won' | 'lost'
  revision: number
}
