import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PalabraStorage, StaleStudySessionError } from './storage'
import { vocabulary } from './vocabulary'
import type { ActiveSession, StudySession, VocabularyEntry, WordProgress } from '../types'

const firstWord: VocabularyEntry = {
  id: 'test-01',
  language: 'es',
  term: 'hola',
  meaningZh: '你好',
  examples: [{ text: 'Hola, Ana.', translationZh: '你好，安娜。' }],
  spanish: 'hola',
  partOfSpeech: '感叹词',
  chinese: '你好',
  category: '测试',
  example: 'Hola, Ana.',
  exampleZh: '你好，安娜。',
}

const secondWord: VocabularyEntry = {
  ...firstWord,
  id: 'test-02',
  spanish: 'adiós',
  chinese: '再见',
  example: 'Adiós, Ana.',
  exampleZh: '再见，安娜。',
}

const englishWord = {
  id: 'en:hello',
  language: 'en',
  term: 'hello',
  meaningZh: '你好；喂',
  partOfSpeech: '感叹词',
  category: '高考 3500',
  examples: [{ text: 'Hello, everyone.', translationZh: '大家好。' }],
  pronunciation: { ipa: '/həˈloʊ/', accent: 'us', audioPath: '/audio/en/hello.mp3', audioKind: 'human' },
  spellingVariants: [],
  source: { provider: 'test', url: 'https://example.test/hello', fetchedAt: '2026-09-26T00:00:00.000Z' },
} as VocabularyEntry

function openVersionOneDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('wordProgress', { keyPath: 'wordId' })
      database.createObjectStore('sessions', { keyPath: 'id' })
      database.createObjectStore('settings', { keyPath: 'id' })
      database.createObjectStore('activeSession', { keyPath: 'id' })

      const transaction = request.transaction!
      transaction.objectStore('wordProgress').put({
        wordId: 'hola',
        stage: 1,
        status: 'learning',
        nextReviewAt: '2026-09-28T00:00:00.000Z',
        reviewCount: 2,
        correctCount: 1,
        lastReviewedAt: '2026-09-25T00:00:00.000Z',
      })
      transaction.objectStore('settings').put({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
      transaction.objectStore('sessions').put({
        id: 'session-1',
        date: '2026-09-25',
        newCount: 5,
        reviewCount: 0,
        correctCount: 4,
        totalCount: 5,
        durationSeconds: 60,
        completed: true,
      })
      transaction.objectStore('activeSession').put({
        id: 'active-session',
        wordIds: ['hola'],
        newWordIds: ['hola'],
        reviewWordIds: [],
        currentIndex: 0,
        phase: 'learn',
        correctCount: 0,
        answeredCount: 0,
        startedAt: '2026-09-25T00:00:00.000Z',
      })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function openVersionTwoDatabase(name: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 2)
    request.onupgradeneeded = () => {
      const database = request.result
      database.createObjectStore('wordProgress', { keyPath: 'wordId' })
      database.createObjectStore('sessions', { keyPath: 'id' })
      database.createObjectStore('settings', { keyPath: 'id' })
      database.createObjectStore('activeSession', { keyPath: 'id' })
      database.createObjectStore('vocabulary', { keyPath: 'id' })
      database.createObjectStore('metadata', { keyPath: 'id' })
      const transaction = request.transaction!
      transaction.objectStore('wordProgress').put({
        wordId: 'test-01', stage: 1, status: 'learning',
        nextReviewAt: '2026-09-28T00:00:00.000Z', reviewCount: 2,
        correctCount: 1, lastReviewedAt: '2026-09-25T00:00:00.000Z',
      })
      transaction.objectStore('sessions').put({
        id: 'session-v2', date: '2026-09-25', newCount: 1, reviewCount: 0,
        correctCount: 1, totalCount: 1, durationSeconds: 20, completed: true,
      })
      transaction.objectStore('settings').put({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
      transaction.objectStore('activeSession').put({
        id: 'active-session', wordIds: ['test-01'], newWordIds: ['test-01'],
        reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0,
        answeredCount: 0, startedAt: '2026-09-25T00:00:00.000Z',
      })
      transaction.objectStore('vocabulary').put({
        id: 'test-01', spanish: 'hola', chinese: '你好', partOfSpeech: '感叹词',
        category: '测试', example: 'Hola.', exampleZh: '你好。', order: 0,
      })
      transaction.objectStore('metadata').put({
        id: 'vocabulary', revision: 1, count: 1, updatedAt: '2026-09-25T00:00:00.000Z',
      })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('PalabraStorage', () => {
  it('rejects stale writes from another tab without overwriting or reviving a session', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const first = createStorage(name)
    const second = createStorage(name)
    const initial: ActiveSession = {
      id: 'active-session:es', language: 'es', wordIds: ['test-01'], newWordIds: ['test-01'],
      reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0,
      answeredCount: 0, startedAt: '2026-09-25T00:00:00.000Z', revision: 0,
    }
    await first.saveActiveSession(initial)
    expect(await second.createActiveSession({ ...initial, startedAt: '2026-09-26T00:00:00.000Z' })).toEqual(initial)
    const firstStep = { ...initial, phase: 'quiz' as const, revision: 1 }
    await first.commitStudyStep(undefined, firstStep)
    await expect(second.commitStudyStep(undefined, { ...initial, revision: 1 })).rejects.toThrow(StaleStudySessionError)
    expect(await first.getActiveSession('es')).toEqual(firstStep)
    const completed: StudySession = {
      id: 'completed-concurrent', language: 'es', date: '2026-09-25', newCount: 1,
      reviewCount: 0, correctCount: 1, totalCount: 1, durationSeconds: 10, completed: true,
    }
    await first.completeStudyGroup(completed, 'es', undefined, { ...firstStep, revision: 2 })
    await expect(second.commitStudyStep(undefined, { ...firstStep, revision: 2 })).rejects.toThrow(StaleStudySessionError)
    expect(await first.getActiveSession('es')).toBeUndefined()
    expect(await first.getSessions('es')).toEqual([completed])
  })
  it('commits a study step and group completion with the active state', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name)
    const active: ActiveSession = {
      id: 'active-session:es', language: 'es', wordIds: ['test-01'], newWordIds: ['test-01'],
      reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0,
      answeredCount: 0, startedAt: '2026-09-25T00:00:00.000Z',
    }
    const progress: WordProgress = {
      wordId: 'test-01', language: 'es', stage: 0, status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z', reviewCount: 1,
      correctCount: 0, lastReviewedAt: '2026-09-25T00:00:00.000Z',
    }
    await storage.saveActiveSession(active)
    const stepped = { ...active, revision: 1 }
    await storage.commitStudyStep(progress, stepped)
    expect(await storage.getActiveSession('es')).toEqual(stepped)
    expect(await storage.getAllProgress('es')).toEqual([progress])
    const completed: StudySession = {
      id: 'completed-1', language: 'es', date: '2026-09-25', newCount: 1,
      reviewCount: 0, correctCount: 0, totalCount: 1, durationSeconds: 10, completed: true,
    }
    await storage.completeStudyGroup(completed, 'es', undefined, { ...stepped, revision: 2 })
    expect(await storage.getActiveSession('es')).toBeUndefined()
    expect(await storage.getSessions('es')).toEqual([completed])
    expect(await storage.getAllProgress('es')).toEqual([progress])
  })
  const databaseNames: string[] = []
  const storageClients: PalabraStorage[] = []

  const createStorage = (name: string, options?: ConstructorParameters<typeof PalabraStorage>[1]) => {
    const client = new PalabraStorage(name, options)
    storageClients.push(client)
    return client
  }

  afterEach(async () => {
    storageClients.splice(0).forEach((client) => client.close())
    await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })))
  })

  it('creates default settings for a new learner', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name)
    await expect(storage.getSettings()).resolves.toEqual(DEFAULT_SETTINGS)
    await expect(storage.getSettings()).resolves.toMatchObject({ learningLanguage: 'es', dataVersion: 2 })
    storage.close()
  })

  it('seeds and reads Spanish and English vocabulary independently', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name, {
      vocabularySeeds: { es: [firstWord], en: [englishWord] },
      vocabularyRevisions: { es: 1, en: 1 },
    })

    await expect(storage.getVocabulary('es')).resolves.toEqual([firstWord])
    await expect(storage.getVocabulary('en')).resolves.toEqual([englishWord])
    storage.close()

    const reopened = createStorage(name, {
      vocabularySeeds: { es: [firstWord], en: [englishWord] },
      vocabularyRevisions: { es: 1, en: 1 },
    })
    await expect(reopened.getVocabulary('en')).resolves.toEqual([englishWord])
  })

  it('seeds all built-in vocabulary on first open and reads it after reopening', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name)

    const saved = await storage.getVocabulary()
    expect(saved).toHaveLength(300)
    expect(new Set(saved.map((word) => word.id)).size).toBe(300)
    storage.close()

    const reopened = createStorage(name)
    await expect(reopened.getVocabulary()).resolves.toEqual(vocabulary)
    reopened.close()
  })

  it('refreshes a changed vocabulary revision without losing learner progress', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const initial = createStorage(name, { vocabularySeed: [firstWord], vocabularyRevision: 1 })
    await initial.getVocabulary()
    await initial.putProgress({
      wordId: firstWord.id,
      language: 'es',
      stage: 1,
      status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z',
      reviewCount: 2,
      correctCount: 1,
      lastReviewedAt: '2026-09-25T00:00:00.000Z',
    })
    initial.close()

    const updated = createStorage(name, { vocabularySeed: [secondWord], vocabularyRevision: 2 })
    await expect(updated.getVocabulary()).resolves.toEqual([secondWord])
    await expect(updated.getAllProgress()).resolves.toMatchObject([{ wordId: firstWord.id }])
    updated.close()
  })

  it('refreshes English lexical notes while preserving personal records', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const initial = createStorage(name, {
      vocabularySeeds: { en: [englishWord] },
      vocabularyRevisions: { en: 2 },
    })
    await initial.getVocabulary('en')
    await initial.putProgress({
      wordId: englishWord.id, language: 'en', stage: 1, status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z', reviewCount: 2, correctCount: 1,
      lastReviewedAt: '2026-09-25T00:00:00.000Z',
    })
    await initial.putSession({
      id: 'en-history', language: 'en', date: '2026-09-25', newCount: 1,
      reviewCount: 0, correctCount: 1, totalCount: 1, durationSeconds: 20, completed: true,
    })
    await initial.saveActiveSession({
      id: 'active-session:en', language: 'en', wordIds: [englishWord.id], newWordIds: [englishWord.id],
      reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0, answeredCount: 0,
      startedAt: '2026-09-25T00:00:00.000Z',
    })
    await initial.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
    initial.close()

    const refreshed = createStorage(name, {
      vocabularySeeds: { en: [{ ...englishWord, relatedTerms: ['hi'], specialForms: [{ label: '复数', form: 'helloes' }] }] },
    })
    await expect(refreshed.getVocabulary('en')).resolves.toMatchObject([{ relatedTerms: ['hi'] }])
    await expect(refreshed.getAllProgress('en')).resolves.toMatchObject([{ wordId: englishWord.id, stage: 1 }])
    await expect(refreshed.getSessions('en')).resolves.toMatchObject([{ id: 'en-history' }])
    await expect(refreshed.getActiveSession('en')).resolves.toMatchObject({ wordIds: [englishWord.id] })
    await expect(refreshed.getSettings()).resolves.toMatchObject({ dailyNewWords: 20 })
  })

  it('upgrades a version-one database while preserving every learner store', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const versionOne = await openVersionOneDatabase(name)
    versionOne.close()

    const storage = createStorage(name, { vocabularySeed: [firstWord], vocabularyRevision: 1 })
    await expect(storage.getVocabulary()).resolves.toEqual([firstWord])
    await expect(storage.getAllProgress()).resolves.toMatchObject([{ wordId: 'hola', reviewCount: 2 }])
    await expect(storage.getSettings()).resolves.toMatchObject({ dailyNewWords: 20 })
    await expect(storage.getSessions()).resolves.toMatchObject([{ id: 'session-1', completed: true }])
    await expect(storage.getActiveSession()).resolves.toMatchObject({ id: 'active-session:es', language: 'es', phase: 'learn' })
    storage.close()
  })

  it('upgrades a version-two database and namespaces Spanish learner state', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const versionTwo = await openVersionTwoDatabase(name)
    versionTwo.close()

    const storage = createStorage(name, {
      vocabularySeeds: { es: [firstWord], en: [englishWord] },
      vocabularyRevisions: { es: 1, en: 1 },
    })
    await expect(storage.getVocabulary('es')).resolves.toMatchObject([{
      id: 'test-01', language: 'es', term: 'hola', meaningZh: '你好',
      examples: [{ text: 'Hola.', translationZh: '你好。' }],
    }])
    await expect(storage.getAllProgress('es')).resolves.toMatchObject([{ wordId: 'test-01', language: 'es' }])
    await expect(storage.getSessions('es')).resolves.toMatchObject([{ id: 'session-v2', language: 'es' }])
    await expect(storage.getActiveSession('es')).resolves.toMatchObject({ id: 'active-session:es', language: 'es' })
    await expect(storage.getSettings()).resolves.toMatchObject({ learningLanguage: 'es', dataVersion: 2 })
  })

  it('keeps progress, sessions and active sessions isolated by language', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name, {
      vocabularySeeds: { es: [firstWord], en: [englishWord] },
      vocabularyRevisions: { es: 1, en: 1 },
    })
    await storage.putProgress({
      language: 'es', wordId: firstWord.id, stage: 1, status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z', reviewCount: 1,
      correctCount: 1, lastReviewedAt: '2026-09-25T00:00:00.000Z',
    })
    await storage.putProgress({
      language: 'en', wordId: englishWord.id, stage: 1, status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z', reviewCount: 1,
      correctCount: 0, lastReviewedAt: '2026-09-25T00:00:00.000Z',
    })
    await storage.putSession({
      language: 'es', id: 'es-session', date: '2026-09-25', newCount: 1,
      reviewCount: 0, correctCount: 1, totalCount: 1, durationSeconds: 10, completed: true,
    })
    await storage.putSession({
      language: 'en', id: 'en-session', date: '2026-09-25', newCount: 1,
      reviewCount: 0, correctCount: 0, totalCount: 1, durationSeconds: 10, completed: true,
    })
    await storage.saveActiveSession({
      id: 'active-session:es', language: 'es', wordIds: [firstWord.id], newWordIds: [firstWord.id],
      reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0,
      answeredCount: 0, startedAt: '2026-09-25T00:00:00.000Z',
    })
    await storage.saveActiveSession({
      id: 'active-session:en', language: 'en', wordIds: [englishWord.id], newWordIds: [englishWord.id],
      reviewWordIds: [], currentIndex: 0, phase: 'learn', correctCount: 0,
      answeredCount: 0, startedAt: '2026-09-25T00:00:00.000Z',
    })

    await expect(storage.getAllProgress('en')).resolves.toMatchObject([{ wordId: englishWord.id }])
    await expect(storage.getSessions('es')).resolves.toMatchObject([{ id: 'es-session' }])
    await expect(storage.getActiveSession('en')).resolves.toMatchObject({ id: 'active-session:en' })

    await storage.clearLearningData('en')
    await expect(storage.getAllProgress('en')).resolves.toEqual([])
    await expect(storage.getSessions('en')).resolves.toEqual([])
    await expect(storage.getActiveSession('en')).resolves.toBeUndefined()
    await expect(storage.getAllProgress('es')).resolves.toHaveLength(1)
    await expect(storage.getSessions('es')).resolves.toHaveLength(1)
    await expect(storage.getActiveSession('es')).resolves.toBeDefined()
  })

  it('rejects a blocked database upgrade instead of loading forever', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const versionOne = await openVersionOneDatabase(name)
    const storage = createStorage(name, { vocabularySeed: [firstWord], vocabularyRevision: 1 })
    const vocabularyRequest = storage.getVocabulary()

    const outcome = await Promise.race([
      vocabularyRequest.then(() => 'resolved', () => 'rejected'),
      new Promise<string>((resolve) => setTimeout(() => resolve('pending'), 25)),
    ])
    versionOne.close()
    await vocabularyRequest.catch(() => undefined)

    expect(outcome).toBe('rejected')
  })

  it('persists progress and clears learning data without losing settings', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = createStorage(name)
    const progress: WordProgress = {
      wordId: 'hola',
      language: 'es',
      stage: 1,
      status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z',
      reviewCount: 2,
      correctCount: 1,
      lastReviewedAt: '2026-09-25T00:00:00.000Z',
    }
    await storage.putProgress(progress)
    await storage.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
    expect(await storage.getAllProgress()).toEqual([{ ...progress, language: 'es' }])

    await storage.clearLearningData()
    expect(await storage.getAllProgress()).toEqual([])
    expect((await storage.getSettings()).dailyNewWords).toBe(20)
    expect(await storage.getVocabulary()).toHaveLength(300)
    storage.close()
  })
})
