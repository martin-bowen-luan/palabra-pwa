import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_SETTINGS, PalabraStorage } from './storage'
import type { WordAiAnalysis, EncryptedCredential, AiSettings } from '../ai/types'
const DEFAULT_AI_SETTINGS: AiSettings = { id: 'ai', enabled: false, provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: '', consentVersion: 0, revision: 0 }

const clients: PalabraStorage[] = []
function client(name = `ai-test-${crypto.randomUUID()}`) { const db = new PalabraStorage(name); clients.push(db); return db }
afterEach(() => clients.splice(0).forEach(db => db.close()))
const credential: EncryptedCredential = { id: 'ai', version: 1, credentialId: 'c1', baseUrl: 'https://example.test/v1', iterations: 600000, salt: 'salt', iv: 'iv', ciphertext: 'encrypted' }
const analysis: WordAiAnalysis = { key: 'cache-key', wordId: 'en:happy', language: 'en', baseUrl: credential.baseUrl, model: 'test', inputHash: 'hash', promptVersion: 1, generatedAt: '2026-09-27T00:00:00Z', result: { derived: [], roots: [], synonyms: [], conflicts: [] } }
describe('AI local storage', () => {
  it('adds v4 stores without changing any v3 vocabulary, settings, history or active sessions', async () => {
    const name = `ai-upgrade-${crypto.randomUUID()}`
    const records = {
      wordProgress: { wordId:'en:happy', language:'en', stage:3, status:'learning', reviewPriority:'skipped', nextReviewAt:'2026-09-27T00:00:00Z' },
      sessions: { id:'history', language:'en', newCount:10, completed:true },
      settings: { ...DEFAULT_SETTINGS, learningLanguage:'en', dailyNewWords:20 },
      activeSession: { id:'active-session:en', language:'en', memoryRound:'spelling', revision:7, wordIds:['en:happy'], skippedWordIds:['en:happy'] },
      vocabulary: { id:'en:happy', language:'en', term:'happy', meaningZh:'快乐的', order:0 },
      metadata: { id:'vocabulary:en', revision:4, count:1 },
    }
    const old = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(name, 3)
      request.onupgradeneeded = () => {
        for (const [store, record] of Object.entries(records)) {
          request.result.createObjectStore(store, { keyPath: store === 'wordProgress' ? 'wordId' : 'id' }).put(record)
        }
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    old.close()
    const db = client(name)
    expect((await db.getAiConfiguration()).settings.enabled).toBe(false)
    db.close()
    const upgraded = await new Promise<IDBDatabase>(resolve => { const request=indexedDB.open(name); request.onsuccess=()=>resolve(request.result) })
    expect(upgraded.version).toBe(6)
    for (const [store, record] of Object.entries(records)) {
      const actual = await new Promise(resolve => { const request=upgraded.transaction(store).objectStore(store).getAll(); request.onsuccess=()=>resolve(request.result) })
      expect(actual).toEqual([record])
    }
    expect([...upgraded.objectStoreNames]).toEqual(expect.arrayContaining(['aiSettings','aiCredentials','aiAnalyses']))
    upgraded.close()
  })
  it('rejects a stale settings write instead of replacing another tab’s destination and key', async () => {
    const db=client(); const stale=(await db.getAiConfiguration()).settings
    const saved=await db.saveAiConfiguration({...stale, enabled:true}, credential)
    await expect(db.saveAiConfiguration({...stale, baseUrl:'https://other.test'})).rejects.toThrow()
    expect(await db.getAiConfiguration()).toEqual(saved)
  })
  it('starts disabled and atomically persists configuration with encrypted credentials', async () => {
    const db = client()
    expect((await db.getAiConfiguration()).settings.enabled).toBe(false)
    const saved = await db.saveAiConfiguration({ ...DEFAULT_AI_SETTINGS, enabled: true, baseUrl: credential.baseUrl, model: 'test', consentVersion: 1 }, credential)
    expect(saved.settings.revision).toBe(1)
    db.close()
    expect(await db.getAiConfiguration()).toEqual(saved)
  })
  it('keeps analysis and settings when learning records are cleared', async () => {
    const db = client()
    const saved = await db.saveAiConfiguration({ ...DEFAULT_AI_SETTINGS, enabled: true, baseUrl: credential.baseUrl }, credential)
    const owner = 'request1'
    expect(await db.acquireAiLease(owner, saved.settings.revision, 1000)).toBe(true)
    expect(await db.saveAiAnalysis(analysis, owner, saved.settings.revision, 1001)).toBe(true)
    await db.clearLearningData('en')
    expect(await db.getAiAnalysis(analysis.key)).toEqual(analysis)
    expect((await db.getAiConfiguration()).credential).toEqual(credential)
  })
  it('serializes leases across connections and fences stale requests after configuration changes', async () => {
    const name = `ai-shared-${crypto.randomUUID()}`; const db = client(name); const second = client(name)
    const config = await db.saveAiConfiguration({ ...DEFAULT_AI_SETTINGS, enabled: true }, credential)
    expect(await db.acquireAiLease('one', config.settings.revision, 1000)).toBe(true)
    expect(await second.acquireAiLease('two', config.settings.revision, 1001)).toBe(false)
    expect(await second.acquireAiLease('two', config.settings.revision, 92000)).toBe(true)
    expect(await db.saveAiAnalysis(analysis, 'one', config.settings.revision, 92001)).toBe(false)
    await db.saveAiConfiguration({ ...config.settings, enabled: false }, credential)
    expect(await second.saveAiAnalysis(analysis, 'two', config.settings.revision, 92002)).toBe(false)
    expect(await db.getAiAnalysis(analysis.key)).toBeUndefined()
  })
  it('deleting caches fences in-flight responses without deleting encrypted credentials', async () => {
    const db = client(); const config = await db.saveAiConfiguration({ ...DEFAULT_AI_SETTINGS, enabled: true }, credential)
    await db.acquireAiLease('one', config.settings.revision, 1000)
    await db.clearAiAnalyses()
    expect(await db.saveAiAnalysis(analysis, 'one', config.settings.revision, 1001)).toBe(false)
    expect((await db.getAiConfiguration()).credential).toEqual(credential)
  })
  it('deleting one word leaves the lease and cache write for a different word intact', async () => {
    const db=client();const config=await db.saveAiConfiguration({...DEFAULT_AI_SETTINGS,enabled:true},credential)
    await db.acquireAiLease('one',config.settings.revision,1000,analysis.wordId)
    await db.clearAiAnalyses('en:other')
    expect(await db.saveAiAnalysis(analysis,'one',config.settings.revision,1001)).toBe(true)
  })
})
