import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PalabraStorage } from './storage'
import { vocabulary } from './vocabulary'
import type { ActiveSession, StudySession, VocabularyEntry, WordProgress } from '../types'

const firstWord: VocabularyEntry = {
  id: 'test-01',
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
      } satisfies WordProgress)
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
      } satisfies StudySession)
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
      } satisfies ActiveSession)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

describe('PalabraStorage', () => {
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
    storage.close()
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
    await expect(storage.getActiveSession()).resolves.toMatchObject({ id: 'active-session', phase: 'learn' })
    storage.close()
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
      stage: 1,
      status: 'learning',
      nextReviewAt: '2026-09-28T00:00:00.000Z',
      reviewCount: 2,
      correctCount: 1,
      lastReviewedAt: '2026-09-25T00:00:00.000Z',
    }
    await storage.putProgress(progress)
    await storage.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
    expect(await storage.getAllProgress()).toEqual([progress])

    await storage.clearLearningData()
    expect(await storage.getAllProgress()).toEqual([])
    expect((await storage.getSettings()).dailyNewWords).toBe(20)
    expect(await storage.getVocabulary()).toHaveLength(300)
    storage.close()
  })
})
