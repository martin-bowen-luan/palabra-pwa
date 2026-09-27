export type ReviewRating = 'forgotten' | 'fuzzy' | 'known'
export type LearningStatus = 'learning' | 'mastered'
export type ThemeMode = 'system' | 'light' | 'dark'
import type { SpanishLearningData } from './spanish/types'
import type { SpanishSessionState } from './spanish/sessionTypes'

export type LearningLanguage = 'es' | 'en'
export type StudyMode = 'learn' | 'review'
export type MemoryRound = 'choice' | 'context' | 'recall' | 'spelling'

export interface VocabularyExample {
  text: string
  translationZh: string
  sourceId?: string
  sourceUrl?: string
  author?: string
  license?: string
}

export interface VocabularyPronunciation {
  ipa: string
  accent: 'us' | 'uk'
  audioPath?: string
  audioKind?: 'human' | 'tts'
  sourceUrl?: string
  license?: string
}

export interface VocabularySource {
  provider: string
  url: string
  fetchedAt?: string
  license?: string
}

export interface VocabularyEntry {
  spanishData?: SpanishLearningData
  id: string
  language: LearningLanguage
  term: string
  partOfSpeech: string
  meaningZh: string
  category: string
  examples: VocabularyExample[]
  pronunciation?: VocabularyPronunciation
  spellingVariants?: string[]
  relatedTerms?: string[]
  derivedTerms?: string[]
  roots?: Array<{ part: string; meaningZh: string; sourceUrl: string }>
  relationSourceUrls?: string[]
  specialForms?: Array<{ label: string; form: string }>
  source?: VocabularySource
  /** Legacy aliases retained while existing UI migrates to the generic fields. */
  spanish?: string
  chinese?: string
  example?: string
  exampleZh?: string
  regionalNote?: string
}

export interface WordProgress {
  language: LearningLanguage
  wordId: string
  stage: number
  status: LearningStatus
  nextReviewAt: string
  reviewCount: number
  correctCount: number
  lastReviewedAt: string
  skipReview?: boolean
  scheduleVersion?: 1
  reviewPriority?: 'normal' | 'skipped'
}

export interface StudySession {
  spanishDailyTracked?: boolean
  spanishUntrackedCount?: number
  mode?: StudyMode
  skippedCount?: number
  language: LearningLanguage
  id: string
  date: string
  newCount: number
  reviewCount: number
  correctCount: number
  totalCount: number
  durationSeconds: number
  completed: boolean
}

export interface UserSettings {
  spanishDailyGoal?: 10 | 20 | 30 | 50
  id: 'settings'
  dailyNewWords: 5 | 10 | 15 | 20
  enableChoice: boolean
  enableSpelling: boolean
  theme: ThemeMode
  learningLanguage: LearningLanguage
  dataVersion: number
}

export interface ActiveSession {
  spanishDailyIds?: string[]
  spanish?: SpanishSessionState
  mode?: StudyMode
  memoryRound?: MemoryRound
  skippedWordIds?: string[]
  id: `active-session:${LearningLanguage}`
  language: LearningLanguage
  wordIds: string[]
  newWordIds: string[]
  reviewWordIds: string[]
  currentIndex: number
  phase: 'learn' | 'quiz'
  correctCount: number
  answeredCount: number
  startedAt: string
  practice?: PracticeQueue
  assignedNewCount?: number
  assignedReviewCount?: number
  failedWordIds?: string[]
  spellingHint?: { wordId: string; promptNumber: number; revealedCount: number }
  quizFeedback?: { wordId: string; correct: boolean; selected: string; selectedWordId?: string; nextPractice: PracticeQueue; assisted?: boolean }
  revision?: number
}

export interface PracticeQueue {
  pendingIds: string[]
  delayed: Array<{ wordId: string; remaining: number }>
  stateById: Record<string, 'fresh' | 'retry' | 'revisit'>
  firstAnswers: Record<string, boolean>
  promptNumber: number
}
