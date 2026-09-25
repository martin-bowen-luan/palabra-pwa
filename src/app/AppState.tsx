import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { vocabulary } from '../data/vocabulary'
import { DEFAULT_SETTINGS, storage as defaultStorage, type PalabraStorage } from '../data/storage'
import { buildDailyPlan, type DailyPlan } from '../domain/dailyPlan'
import { applyReview, createProgress } from '../domain/reviewScheduler'
import { calculateStreak, toLocalDate } from '../domain/stats'
import type { ActiveSession, ReviewRating, StudySession, UserSettings, WordProgress } from '../types'

interface AppStateValue {
  ready: boolean
  progress: Record<string, WordProgress>
  sessions: StudySession[]
  settings: UserSettings
  activeSession?: ActiveSession
  dailyPlan: DailyPlan
  streak: number
  startSession: (extraWords?: number) => Promise<ActiveSession | undefined>
  rateCurrentWord: (rating: ReviewRating) => Promise<void>
  completeQuizItem: (correct: boolean) => Promise<boolean>
  exitSession: () => Promise<void>
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  clearLearningData: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

export function AppStateProvider({ children, storageClient = defaultStorage }: { children: ReactNode; storageClient?: PalabraStorage }) {
  const [ready, setReady] = useState(false)
  const [progress, setProgress] = useState<Record<string, WordProgress>>({})
  const [sessions, setSessions] = useState<StudySession[]>([])
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS)
  const [activeSession, setActiveSession] = useState<ActiveSession>()

  useEffect(() => {
    let mounted = true
    Promise.all([
      storageClient.getAllProgress(),
      storageClient.getSessions(),
      storageClient.getSettings(),
      storageClient.getActiveSession(),
    ]).then(([savedProgress, savedSessions, savedSettings, savedActive]) => {
      if (!mounted) return
      setProgress(Object.fromEntries(savedProgress.map((item) => [item.wordId, item])))
      setSessions(savedSessions)
      setSettings(savedSettings)
      setActiveSession(savedActive)
      setReady(true)
    })
    return () => { mounted = false }
  }, [storageClient])

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme
  }, [settings.theme])

  const dailyPlan = useMemo(
    () => buildDailyPlan(vocabulary, progress, settings.dailyNewWords),
    [progress, settings.dailyNewWords],
  )

  const startSession = async (extraWords = 0) => {
    if (activeSession) return activeSession
    const plan = buildDailyPlan(vocabulary, progress, extraWords || settings.dailyNewWords)
    if (!plan.all.length) return undefined
    const session: ActiveSession = {
      id: 'active-session',
      wordIds: plan.all.map((word) => word.id),
      newWordIds: plan.newWords.map((word) => word.id),
      reviewWordIds: plan.review.map((word) => word.id),
      currentIndex: 0,
      phase: 'learn',
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
    const wordId = activeSession.wordIds[activeSession.currentIndex]
    const now = new Date()
    const nextProgress = progress[wordId]
      ? applyReview(progress[wordId], rating, now)
      : createProgress(wordId, rating, now)
    await storageClient.putProgress(nextProgress)
    setProgress((current) => ({ ...current, [wordId]: nextProgress }))

    const isLast = activeSession.currentIndex >= activeSession.wordIds.length - 1
    const nextSession: ActiveSession = isLast
      ? { ...activeSession, phase: 'quiz', currentIndex: 0 }
      : { ...activeSession, currentIndex: activeSession.currentIndex + 1 }
    await storageClient.saveActiveSession(nextSession)
    setActiveSession(nextSession)
  }

  const completeQuizItem = async (correct: boolean) => {
    if (!activeSession) return false
    const correctCount = activeSession.correctCount + (correct ? 1 : 0)
    const answeredCount = activeSession.answeredCount + 1
    const isLast = activeSession.currentIndex >= activeSession.wordIds.length - 1
    if (!isLast) {
      const next = { ...activeSession, currentIndex: activeSession.currentIndex + 1, correctCount, answeredCount }
      await storageClient.saveActiveSession(next)
      setActiveSession(next)
      return false
    }

    const now = new Date()
    const completed: StudySession = {
      id: `${toLocalDate(now)}-${now.getTime()}`,
      date: toLocalDate(now),
      newCount: activeSession.newWordIds.length,
      reviewCount: activeSession.reviewWordIds.length,
      correctCount,
      totalCount: answeredCount,
      durationSeconds: Math.max(1, Math.round((now.getTime() - new Date(activeSession.startedAt).getTime()) / 1000)),
      completed: true,
    }
    await storageClient.putSession(completed)
    await storageClient.clearActiveSession()
    setSessions((current) => [...current, completed])
    setActiveSession(undefined)
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

  const clearLearningData = async () => {
    await storageClient.clearLearningData()
    setProgress({})
    setSessions([])
    setActiveSession(undefined)
  }

  const value: AppStateValue = {
    ready,
    progress,
    sessions,
    settings,
    activeSession,
    dailyPlan,
    streak: calculateStreak(sessions),
    startSession,
    rateCurrentWord,
    completeQuizItem,
    exitSession,
    updateSettings,
    clearLearningData,
  }

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>
}

export function useAppState(): AppStateValue {
  const context = useContext(AppStateContext)
  if (!context) throw new Error('useAppState must be used inside AppStateProvider')
  return context
}
