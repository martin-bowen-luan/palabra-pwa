import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, storage as defaultStorage, type PalabraStorage } from '../data/storage'
import { buildDailyPlan, type DailyPlan } from '../domain/dailyPlan'
import { applyReview, createProgress, markFluent } from '../domain/reviewScheduler'
import { calculateStreak, toLocalDate } from '../domain/stats'
import type { ActiveSession, LearningLanguage, ReviewRating, StudySession, UserSettings, VocabularyEntry, WordProgress } from '../types'

interface AppStateValue {
  ready: boolean
  loadError?: string
  vocabulary: VocabularyEntry[]
  categories: string[]
  progress: Record<string, WordProgress>
  sessions: StudySession[]
  settings: UserSettings
  activeSession?: ActiveSession
  dailyPlan: DailyPlan
  streak: number
  startSession: (extraWords?: number) => Promise<ActiveSession | undefined>
  rateCurrentWord: (rating: ReviewRating) => Promise<void>
  markCurrentWordFluent: () => Promise<boolean>
  completeQuizItem: (correct: boolean) => Promise<boolean>
  exitSession: () => Promise<void>
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  setLearningLanguage: (language: LearningLanguage) => Promise<void>
  clearLearningData: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children, storageClient = defaultStorage }: { children: ReactNode; storageClient?: PalabraStorage }) {
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const [vocabulary, setVocabulary] = useState<VocabularyEntry[]>([])
  const [progress, setProgress] = useState<Record<string, WordProgress>>({})
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [activeSession, setActiveSession] = useState<ActiveSession>()

  useEffect(() => {
    let mounted = true
    storageClient.getSettings().then(async (savedSettings) => {
      const language = savedSettings.learningLanguage
      const [savedVocabulary, savedProgress, savedSessions, savedActive] = await Promise.all([
        storageClient.getVocabulary(language),
        storageClient.getAllProgress(language),
        storageClient.getSessions(language),
        storageClient.getActiveSession(language),
      ])
      return { savedVocabulary, savedProgress, savedSessions, savedSettings, savedActive }
    })
      .then(({ savedVocabulary, savedProgress, savedSessions, savedSettings, savedActive }) => {
        if (!mounted) return
        setVocabulary(savedVocabulary)
        setProgress(Object.fromEntries(savedProgress.map((item) => [item.wordId, item])))
        setSessions(savedSessions)
        setSettings(savedSettings)
        setActiveSession(savedActive)
        setReady(true)
      })
      .catch(() => {
        if (mounted) setLoadError('无法读取学习数据')
      })
    return () => { mounted = false }
  }, [storageClient])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const dailyPlan = useMemo(
    () => buildDailyPlan(vocabulary, progress, settings.dailyNewWords),
    [progress, settings.dailyNewWords, vocabulary],
  )

  const categories = useMemo(
    () => ['全部', ...new Set(vocabulary.map((word) => word.category))],
    [vocabulary],
  )

  const startSession = async (extraWords = 0) => {
    if (activeSession) return activeSession
    const plan = buildDailyPlan(vocabulary, progress, extraWords || settings.dailyNewWords)
    if (!plan.all.length) return undefined
    const session: ActiveSession = {
      id: `active-session:${settings.learningLanguage}`,
      language: settings.learningLanguage,
      wordIds: plan.all.map((word) => word.id),
      newWordIds: plan.newWords.map((word) => word.id),
      reviewWordIds: plan.review.map((word) => word.id),
      currentIndex: 0,
      phase: plan.newWords.length ? 'learn' : 'quiz',
      correctCount: 0,
      answeredCount: 0,
      startedAt: new Date().toISOString(),
    }
    await storageClient.saveActiveSession(session)
    setActiveSession(session)
    return session
  }

  const rateCurrentWord = async (rating: ReviewRating) => {
    if (!activeSession) return
    const wordId = activeSession.newWordIds[activeSession.currentIndex]
    const now = new Date()
    const nextProgress = progress[wordId]
      ? applyReview(progress[wordId], rating, now)
      : createProgress(wordId, rating, now, activeSession.language)
    await storageClient.putProgress(nextProgress)
    setProgress((current) => ({ ...current, [wordId]: nextProgress }))

    const isLast = activeSession.currentIndex >= activeSession.newWordIds.length - 1
    const nextSession: ActiveSession = isLast
      ? { ...activeSession, phase: 'quiz', currentIndex: 0 }
      : { ...activeSession, currentIndex: activeSession.currentIndex + 1 }
    await storageClient.saveActiveSession(nextSession)
    setActiveSession(nextSession)
  }

  const finishSession = async (session: ActiveSession, correctCount: number, answeredCount: number) => {
    const now = new Date()
    const completed: StudySession = {
      id: `${toLocalDate(now)}-${now.getTime()}`,
      language: session.language,
      date: toLocalDate(now),
      newCount: session.newWordIds.length,
      reviewCount: session.reviewWordIds.length,
      correctCount,
      totalCount: answeredCount,
      durationSeconds: Math.max(1, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000)),
      completed: true,
    }
    await storageClient.putSession(completed)
    await storageClient.clearActiveSession(session.language)
    setSessions((current) => [...current, completed])
    setActiveSession(undefined)
  }

  const markCurrentWordFluent = async () => {
    if (!activeSession) return false
    const phaseIds = activeSession.phase === 'learn' ? activeSession.newWordIds : activeSession.wordIds
    const wordId = phaseIds[activeSession.currentIndex]
    if (!wordId) return false
    const nextProgress = markFluent(progress[wordId], wordId, activeSession.language)
    await storageClient.putProgress(nextProgress)
    setProgress((current) => ({ ...current, [wordId]: nextProgress }))

    const nextSession: ActiveSession = {
      ...activeSession,
      wordIds: activeSession.wordIds.filter((id) => id !== wordId),
      newWordIds: activeSession.newWordIds.filter((id) => id !== wordId),
      reviewWordIds: activeSession.reviewWordIds.filter((id) => id !== wordId),
    }
    if (!nextSession.wordIds.length || (nextSession.phase === 'quiz' && activeSession.currentIndex >= nextSession.wordIds.length)) {
      await finishSession(nextSession, nextSession.correctCount, nextSession.answeredCount)
      return true
    }
    if (nextSession.phase === 'learn' && activeSession.currentIndex >= nextSession.newWordIds.length) {
      nextSession.phase = 'quiz'
      nextSession.currentIndex = 0
    }
    await storageClient.saveActiveSession(nextSession)
    setActiveSession(nextSession)
    return false
  }

  const completeQuizItem = async (correct: boolean) => {
    if (!activeSession) return false
    const wordId = activeSession.wordIds[activeSession.currentIndex]
    if (activeSession.reviewWordIds.includes(wordId) || !correct) {
      const now = new Date()
      const nextProgress = progress[wordId]
        ? applyReview(progress[wordId], correct ? 'known' : 'forgotten', now)
        : createProgress(wordId, correct ? 'known' : 'forgotten', now, activeSession.language)
      await storageClient.putProgress(nextProgress)
      setProgress((current) => ({ ...current, [wordId]: nextProgress }))
    }
    const correctCount = activeSession.correctCount + (correct ? 1 : 0)
    const answeredCount = activeSession.answeredCount + 1
    const isLast = activeSession.currentIndex >= activeSession.wordIds.length - 1
    if (!isLast) {
      const next = { ...activeSession, currentIndex: activeSession.currentIndex + 1, correctCount, answeredCount }
      await storageClient.saveActiveSession(next)
      setActiveSession(next)
      return false
    }

    await finishSession(activeSession, correctCount, answeredCount)
    return true
  }

  const exitSession = async () => {
    if (activeSession) await storageClient.saveActiveSession(activeSession)
  }

  const updateSettings = async (patch: Partial<UserSettings>) => {
    const next = { ...settings, ...patch }
    await storageClient.saveSettings(next)
    setSettings(next)
  }

  const setLearningLanguage = async (language: LearningLanguage) => {
    if (language === settings.learningLanguage) return
    const [savedVocabulary, savedProgress, savedSessions, savedActive] = await Promise.all([
      storageClient.getVocabulary(language),
      storageClient.getAllProgress(language),
      storageClient.getSessions(language),
      storageClient.getActiveSession(language),
    ])
    const nextSettings = { ...settings, learningLanguage: language }
    await storageClient.saveSettings(nextSettings)
    setVocabulary(savedVocabulary)
    setProgress(Object.fromEntries(savedProgress.map((item) => [item.wordId, item])))
    setSessions(savedSessions)
    setActiveSession(savedActive)
    setSettings(nextSettings)
  }

  const clearLearningData = async () => {
    await storageClient.clearLearningData(settings.learningLanguage)
    setProgress({})
    setSessions([])
    setActiveSession(undefined)
  }

  const value: AppStateValue = {
    ready,
    loadError,
    vocabulary,
    categories,
    progress,
    sessions,
    settings,
    activeSession,
    dailyPlan,
    streak: calculateStreak(sessions),
    startSession,
    rateCurrentWord,
    markCurrentWordFluent,
    completeQuizItem,
    exitSession,
    updateSettings,
    setLearningLanguage,
    clearLearningData,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used inside AppStateProvider')
  return context
}
