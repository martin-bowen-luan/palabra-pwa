export type ReviewRating = 'forgotten' | 'fuzzy' | 'known'
export type LearningStatus = 'learning' | 'mastered'
export type ThemeMode = 'system' | 'light' | 'dark'

export interface VocabularyEntry {
  id: string
  spanish: string
  partOfSpeech: string
  chinese: string
  category: string
  example: string
  exampleZh: string
  regionalNote?: string
}

export interface WordProgress {
  wordId: string
  stage: number
  status: LearningStatus
  nextReviewAt: string
  reviewCount: number
  correctCount: number
  lastReviewedAt: string
}

export interface StudySession {
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
  id: 'settings'
  dailyNewWords: 5 | 10 | 15 | 20
  enableChoice: boolean
  enableSpelling: boolean
  theme: ThemeMode
  dataVersion: number
}

export interface ActiveSession {
  id: 'active-session'
  wordIds: string[]
  newWordIds: string[]
  reviewWordIds: string[]
  currentIndex: number
  phase: 'learn' | 'quiz'
  correctCount: number
  answeredCount: number
  startedAt: string
}

