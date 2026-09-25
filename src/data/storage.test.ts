import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PalabraStorage } from './storage'
import type { WordProgress } from '../types'

describe('PalabraStorage', () => {
  const databaseNames: string[] = []

  afterEach(async () => {
    await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(name)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error)
    })))
  })

  it('creates default settings for a new learner', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = new PalabraStorage(name)
    await expect(storage.getSettings()).resolves.toEqual(DEFAULT_SETTINGS)
    storage.close()
  })

  it('persists progress and clears learning data without losing settings', async () => {
    const name = `palabra-test-${crypto.randomUUID()}`
    databaseNames.push(name)
    const storage = new PalabraStorage(name)
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
    storage.close()
  })
})

