import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { DEFAULT_SETTINGS, StaleStudySessionError, storage as defaultStorage, type PalabraStorage } from '../data/storage'
import { buildDailyPlan, type DailyPlan } from '../domain/dailyPlan'
import { buildNextStudyGroup, hasMoreStudyGroups } from '../domain/studyGroups'
import { advancePractice, createPracticeQueue, currentPracticeWord, removePracticeWord } from '../domain/practiceQueue'
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
  moreGroupsToday: boolean
  startSession: (extraWords?: number) => Promise<ActiveSession | undefined>
  startNextGroup: () => Promise<ActiveSession | undefined>
  rateCurrentWord: (rating: ReviewRating) => Promise<void>
  markCurrentWordFluent: () => Promise<boolean>
  submitQuizAnswer: (correct: boolean, selected: string) => Promise<void>
  completeQuizItem: () => Promise<boolean>
  exitSession: () => Promise<void>
  updateSettings: (patch: Partial<UserSettings>) => Promise<void>
  setLearningLanguage: (language: LearningLanguage) => Promise<void>
  clearLearningData: () => Promise<void>
}

const AppStateContext = createContext<AppStateValue | null>(null)

function sessionQueue(session: ActiveSession) {
  if (session.practice) return session.practice
  const ids = session.phase === 'learn' ? session.newWordIds : session.wordIds
  return createPracticeQueue(ids.slice(session.currentIndex))
}

function sessionWordId(session: ActiveSession): string | undefined {
  return currentPracticeWord(sessionQueue(session))
}

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

  const moreGroupsToday = useMemo(
    () => ready && hasMoreStudyGroups(vocabulary, progress, sessions, settings.dailyNewWords),
    [ready, vocabulary, progress, sessions, settings.dailyNewWords],
  )

  const refreshLearningState = async (language: LearningLanguage) => {
    const [savedProgress, savedSessions, savedActive] = await Promise.all([
      storageClient.getAllProgress(language),
      storageClient.getSessions(language),
      storageClient.getActiveSession(language),
    ])
    setProgress(Object.fromEntries(savedProgress.map((item) => [item.wordId, item])))
    setSessions(savedSessions)
    setActiveSession(savedActive)
  }

  const recoverStaleSession = async (error: unknown, language: LearningLanguage): Promise<boolean> => {
    if (!(error instanceof StaleStudySessionError)) return false
    await refreshLearningState(language)
    return true
  }

  const startSession = async (extraWords = 0) => {
    if (activeSession) return activeSession
    const plan = buildNextStudyGroup(vocabulary, progress, sessions, settings.dailyNewWords, new Date(), extraWords)
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
      practice: createPracticeQueue(plan.newWords.length ? plan.newWords.map((word) => word.id) : plan.all.map((word) => word.id)),
      assignedNewCount: plan.newWords.length,
      assignedReviewCount: plan.review.length,
      failedWordIds: [],
      revision: 0,
    }
    const saved = await storageClient.createActiveSession(session)
    if (saved.startedAt !== session.startedAt) await refreshLearningState(saved.language)
    else setActiveSession(saved)
    return saved
  }

  const startNextGroup = () => startSession()

  const rateCurrentWord = async (rating: ReviewRating) => {
    if (!activeSession) return
    const queue = sessionQueue(activeSession)
    const wordId = sessionWordId(activeSession)
    if (!wordId || activeSession.phase !== 'learn') return
    const now = new Date()
    const failedBefore = activeSession.failedWordIds?.includes(wordId) ?? false
    const nextProgress = failedBefore && rating === 'known' ? undefined : progress[wordId]
      ? applyReview(progress[wordId], rating, now)
      : createProgress(wordId, rating, now, activeSession.language)
    const advanced = advancePractice(queue, rating === 'known')
    const failedWordIds = rating !== 'known' && !failedBefore
      ? [...(activeSession.failedWordIds ?? []), wordId]
      : activeSession.failedWordIds ?? []
    const learnComplete = advanced.pendingIds.length === 0 && advanced.delayed.length === 0
    const nextSession: ActiveSession = {
      ...activeSession,
      phase: learnComplete ? 'quiz' : 'learn',
      practice: learnComplete ? createPracticeQueue(activeSession.wordIds) : advanced,
      currentIndex: 0,
      failedWordIds,
      assignedNewCount: activeSession.assignedNewCount ?? activeSession.newWordIds.length,
      assignedReviewCount: activeSession.assignedReviewCount ?? activeSession.reviewWordIds.length,
      revision: (activeSession.revision ?? 0) + 1,
    }
    try {
      await storageClient.commitStudyStep(nextProgress, nextSession)
    } catch (error) {
      if (await recoverStaleSession(error, activeSession.language)) return
      throw error
    }
    if (nextProgress) setProgress((current) => ({ ...current, [wordId]: nextProgress }))
    setActiveSession(nextSession)
  }

  const finishSession = async (session: ActiveSession, progressUpdate?: WordProgress) => {
    const now = new Date()
    const answers = session.phase === 'quiz' ? Object.values(session.practice?.firstAnswers ?? {}) : []
    const completed: StudySession = {
      id: `${toLocalDate(now)}-${now.getTime()}`,
      language: session.language,
      date: toLocalDate(now),
      newCount: session.assignedNewCount ?? session.newWordIds.length,
      reviewCount: session.assignedReviewCount ?? session.reviewWordIds.length,
      correctCount: session.correctCount + answers.filter(Boolean).length,
      totalCount: session.answeredCount + answers.length,
      durationSeconds: Math.max(1, Math.round((now.getTime() - new Date(session.startedAt).getTime()) / 1000)),
      completed: true,
    }
    try {
      await storageClient.completeStudyGroup(completed, session.language, progressUpdate, session)
    } catch (error) {
      if (await recoverStaleSession(error, session.language)) return false
      throw error
    }
    if (progressUpdate) setProgress((current) => ({ ...current, [progressUpdate.wordId]: progressUpdate }))
    setSessions((current) => [...current, completed])
    setActiveSession(undefined)
    return true
  }

  const markCurrentWordFluent = async () => {
    if (!activeSession) return false
    const wordId = sessionWordId(activeSession)
    if (!wordId) return false
    const nextProgress = markFluent(progress[wordId], wordId, activeSession.language)
    const advanced = removePracticeWord(sessionQueue(activeSession), wordId)
    const learnComplete = activeSession.phase === 'learn' && advanced.pendingIds.length === 0 && advanced.delayed.length === 0
    const nextSession: ActiveSession = {
      ...activeSession,
      wordIds: activeSession.wordIds.filter((id) => id !== wordId),
      newWordIds: activeSession.newWordIds.filter((id) => id !== wordId),
      reviewWordIds: activeSession.reviewWordIds.filter((id) => id !== wordId),
      phase: learnComplete ? 'quiz' : activeSession.phase,
      practice: learnComplete
        ? createPracticeQueue(activeSession.wordIds.filter((id) => id !== wordId))
        : advanced,
      currentIndex: 0,
      assignedNewCount: activeSession.assignedNewCount ?? activeSession.newWordIds.length,
      assignedReviewCount: activeSession.assignedReviewCount ?? activeSession.reviewWordIds.length,
      revision: (activeSession.revision ?? 0) + 1,
    }
    if (!nextSession.wordIds.length || (nextSession.phase === 'quiz' && !nextSession.practice?.pendingIds.length && !nextSession.practice?.delayed.length)) {
      return finishSession(nextSession, nextProgress)
    }
    try {
      await storageClient.commitStudyStep(nextProgress, nextSession)
    } catch (error) {
      if (await recoverStaleSession(error, activeSession.language)) return false
      throw error
    }
    setProgress((current) => ({ ...current, [wordId]: nextProgress }))
    setActiveSession(nextSession)
    return false
  }

  const submitQuizAnswer = async (correct: boolean, selected: string) => {
    if (!activeSession) return
    const queue = sessionQueue(activeSession)
    const wordId = sessionWordId(activeSession)
    if (!wordId || activeSession.phase !== 'quiz' || activeSession.quizFeedback) return
    const failedBefore = activeSession.failedWordIds?.includes(wordId) ?? false
    let nextProgress: WordProgress | undefined
    if (!correct && !failedBefore || correct && activeSession.reviewWordIds.includes(wordId) && !failedBefore && !(wordId in queue.firstAnswers)) {
      const now = new Date()
      nextProgress = progress[wordId]
        ? applyReview(progress[wordId], correct ? 'known' : 'forgotten', now)
        : createProgress(wordId, correct ? 'known' : 'forgotten', now, activeSession.language)
    }
    const advanced = advancePractice(queue, correct)
    const nextSession: ActiveSession = {
      ...activeSession,
      quizFeedback: { wordId, correct, selected, nextPractice: advanced },
      failedWordIds: !correct && !failedBefore ? [...(activeSession.failedWordIds ?? []), wordId] : activeSession.failedWordIds,
      assignedNewCount: activeSession.assignedNewCount ?? activeSession.newWordIds.length,
      assignedReviewCount: activeSession.assignedReviewCount ?? activeSession.reviewWordIds.length,
      revision: (activeSession.revision ?? 0) + 1,
    }
    try {
      await storageClient.commitStudyStep(nextProgress, nextSession)
    } catch (error) {
      if (await recoverStaleSession(error, activeSession.language)) return
      throw error
    }
    if (nextProgress) setProgress((current) => ({ ...current, [wordId]: nextProgress }))
    setActiveSession(nextSession)
  }

  const completeQuizItem = async () => {
    if (!activeSession?.quizFeedback) return false
    const advanced = activeSession.quizFeedback.nextPractice
    const nextSession: ActiveSession = {
      ...activeSession,
      practice: advanced,
      quizFeedback: undefined,
      currentIndex: 0,
      revision: (activeSession.revision ?? 0) + 1,
    }
    if (!advanced.pendingIds.length && !advanced.delayed.length) {
      await finishSession(nextSession)
      return true
    }
    try {
      await storageClient.commitStudyStep(undefined, nextSession)
    } catch (error) {
      if (await recoverStaleSession(error, activeSession.language)) return false
      throw error
    }
    setActiveSession(nextSession)
    return false
  }

  const exitSession = async () => {
    // Each answered step is already durable; leaving must not overwrite another tab's newer state.
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
    moreGroupsToday,
    startSession,
    startNextGroup,
    rateCurrentWord,
    markCurrentWordFluent,
    submitQuizAnswer,
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
