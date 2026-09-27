import type {
  ActiveSession,
  LearningLanguage,
  StudySession,
  UserSettings,
  VocabularyEntry,
  WordProgress,
} from '../types'
import { spanishVocabulary } from '../spanish/vocabulary'
import { englishVocabulary } from './englishVocabulary'
import { DEFAULT_AI_SETTINGS, type AiSettings, type EncryptedCredential, type WordAiAnalysis } from '../ai/types'

import type { WordleDictionaryEntry, WordleGame } from '../wordle/types'
import type { SpanishDailyRecord, SpanishDailyUpdate } from '../spanish/sessionTypes'

const DB_VERSION = 6
const STORE_SPANISH_DAYS = 'spanishDays'
const STORE_WORDLE = 'wordleGame'
const STORE_WORDLE_DICTIONARY = 'wordleDictionary'
// Revision 2 was used by local previews before the final sentence/cue audit.
const DEFAULT_VOCABULARY_REVISIONS: Record<LearningLanguage, number> = { es: 3, en: 4 }
const STORE_PROGRESS = 'wordProgress'
const STORE_SESSIONS = 'sessions'
const STORE_SETTINGS = 'settings'
const STORE_ACTIVE = 'activeSession'
const STORE_VOCABULARY = 'vocabulary'
const STORE_METADATA = 'metadata'
const STORE_AI_SETTINGS = 'aiSettings'
const STORE_AI_CREDENTIALS = 'aiCredentials'
const STORE_AI_ANALYSES = 'aiAnalyses'
interface AiLease { id: 'lease'; owner: string; revision: number; expiresAt: number; wordId?: string }

interface VocabularyMetadata {
  id: `vocabulary:${LearningLanguage}`
  language: LearningLanguage
  revision: number
  count: number
  updatedAt: string
}

interface StoredVocabularyEntry extends VocabularyEntry {
  order: number
}

interface PalabraStorageOptions {
  vocabularySeed?: readonly VocabularyEntry[]
  vocabularyRevision?: number
  vocabularySeeds?: Partial<Record<LearningLanguage, readonly VocabularyEntry[]>>
  vocabularyRevisions?: Partial<Record<LearningLanguage, number>>
}

export const DEFAULT_SETTINGS: UserSettings = {
  spanishDailyGoal: 50,
  id: 'settings',
  dailyNewWords: 10,
  enableChoice: true,
  enableSpelling: true,
  theme: 'system',
  learningLanguage: 'es',
  dataVersion: 2,
}

export class StaleStudySessionError extends Error {
  constructor() {
    super('Study session changed in another tab')
    this.name = 'StaleStudySessionError'
  }
}

function isCurrentSession(stored: ActiveSession | undefined, next: ActiveSession): boolean {
  return Boolean(stored && stored.startedAt === next.startedAt
    && (stored.revision ?? 0) === (next.revision ?? 0) - 1)
}

function putSpanishDailyUpdate(transaction: IDBTransaction, update: SpanishDailyUpdate): void {
  putSpanishDailyUpdates(transaction, [update])
}

function putSpanishDailyUpdates(transaction: IDBTransaction, updates: readonly SpanishDailyUpdate[]): void {
  const grouped = new Map<string, SpanishDailyUpdate[]>()
  for (const update of updates) grouped.set(update.date, [...(grouped.get(update.date) ?? []), update])
  for (const [date, entries] of grouped) {
    const store = transaction.objectStore(STORE_SPANISH_DAYS)
    const request = store.get(date) as IDBRequest<SpanishDailyRecord | undefined>
    request.onsuccess = () => {
      const record = request.result ?? { id: date, entries: {} }
      for (const update of entries) {
        const prior = record.entries[update.wordId]
        if (prior && update.entry.outcome === 'legacy') continue
        record.entries[update.wordId] = { ...update.entry, kind: prior?.kind ?? update.entry.kind }
      }
      store.put(record)
    }
  }
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve()
    transaction.onerror = () => reject(transaction.error)
    transaction.onabort = () => reject(transaction.error)
  })
}

function inferredLanguage(value: { language?: LearningLanguage; wordId?: string }): LearningLanguage {
  if (value.language) return value.language
  return value.wordId?.startsWith('en:') ? 'en' : 'es'
}

function activeSessionId(language: LearningLanguage): ActiveSession['id'] {
  return `active-session:${language}`
}

function normalizeVocabularyEntry(entry: Partial<VocabularyEntry> & Pick<VocabularyEntry, 'id'>): VocabularyEntry {
  const language = entry.language ?? (entry.id.startsWith('en:') ? 'en' : 'es')
  const term = entry.term ?? entry.spanish ?? ''
  const meaningZh = entry.meaningZh ?? entry.chinese ?? ''
  const examples = entry.examples ?? (entry.example
    ? [{ text: entry.example, translationZh: entry.exampleZh ?? '' }]
    : [])
  return {
    ...entry,
    id: entry.id,
    language,
    term,
    meaningZh,
    partOfSpeech: entry.partOfSpeech ?? '',
    category: entry.category ?? '',
    examples,
  }
}

function migrateToVersionThree(transaction: IDBTransaction): void {
  const progressStore = transaction.objectStore(STORE_PROGRESS)
  progressStore.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    cursor.update({ ...cursor.value, language: inferredLanguage(cursor.value) })
    cursor.continue()
  }

  const sessionsStore = transaction.objectStore(STORE_SESSIONS)
  sessionsStore.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    cursor.update({ ...cursor.value, language: cursor.value.language ?? 'es' })
    cursor.continue()
  }

  const settingsStore = transaction.objectStore(STORE_SETTINGS)
  settingsStore.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    cursor.update({ ...DEFAULT_SETTINGS, ...cursor.value, learningLanguage: cursor.value.learningLanguage ?? 'es', dataVersion: 2 })
    cursor.continue()
  }

  const activeStore = transaction.objectStore(STORE_ACTIVE)
  activeStore.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    const language = cursor.value.language ?? 'es'
    const next = { ...cursor.value, id: activeSessionId(language), language }
    if (cursor.primaryKey !== next.id) {
      cursor.delete()
      activeStore.put(next)
    } else {
      cursor.update(next)
    }
    cursor.continue()
  }

  const vocabularyStore = transaction.objectStore(STORE_VOCABULARY)
  vocabularyStore.openCursor().onsuccess = (event) => {
    const cursor = (event.target as IDBRequest<IDBCursorWithValue | null>).result
    if (!cursor) return
    cursor.update({ ...normalizeVocabularyEntry(cursor.value), order: cursor.value.order ?? 0 })
    cursor.continue()
  }

  const metadataStore = transaction.objectStore(STORE_METADATA)
  const oldMetadata = metadataStore.get('vocabulary')
  oldMetadata.onsuccess = () => {
    if (!oldMetadata.result) return
    metadataStore.delete('vocabulary')
    metadataStore.put({
      ...oldMetadata.result,
      id: 'vocabulary:es',
      language: 'es',
    } satisfies VocabularyMetadata)
  }
}

export class PalabraStorage {
  private databasePromise?: Promise<IDBDatabase>
  private vocabularyInitialization?: Promise<void>
  private readonly vocabularySeeds: Record<LearningLanguage, readonly VocabularyEntry[]>
  private readonly vocabularyRevisions: Record<LearningLanguage, number>

  constructor(
    private readonly databaseName = 'palabra-db',
    options: PalabraStorageOptions = {},
  ) {
    const legacySpanishSeed = options.vocabularySeed ?? spanishVocabulary
    this.vocabularySeeds = {
      es: options.vocabularySeeds?.es ?? legacySpanishSeed,
      en: options.vocabularySeeds?.en ?? englishVocabulary,
    }
    this.vocabularyRevisions = {
      es: options.vocabularyRevisions?.es ?? options.vocabularyRevision ?? DEFAULT_VOCABULARY_REVISIONS.es,
      en: options.vocabularyRevisions?.en ?? DEFAULT_VOCABULARY_REVISIONS.en,
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, DB_VERSION)
        let blocked = false
        request.onupgradeneeded = (event) => {
          const database = request.result
          if (!database.objectStoreNames.contains(STORE_SPANISH_DAYS)) database.createObjectStore(STORE_SPANISH_DAYS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_WORDLE)) database.createObjectStore(STORE_WORDLE, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_WORDLE_DICTIONARY)) database.createObjectStore(STORE_WORDLE_DICTIONARY, { keyPath: 'term' })
          if (!database.objectStoreNames.contains(STORE_PROGRESS)) database.createObjectStore(STORE_PROGRESS, { keyPath: 'wordId' })
          if (!database.objectStoreNames.contains(STORE_SESSIONS)) database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_SETTINGS)) database.createObjectStore(STORE_SETTINGS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_ACTIVE)) database.createObjectStore(STORE_ACTIVE, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_VOCABULARY)) database.createObjectStore(STORE_VOCABULARY, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_METADATA)) database.createObjectStore(STORE_METADATA, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_AI_SETTINGS)) database.createObjectStore(STORE_AI_SETTINGS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_AI_CREDENTIALS)) database.createObjectStore(STORE_AI_CREDENTIALS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_AI_ANALYSES)) database.createObjectStore(STORE_AI_ANALYSES, { keyPath: 'key' })
          if (event.oldVersion < 3) migrateToVersionThree(request.transaction!)
        }
        request.onsuccess = () => {
          if (blocked) {
            request.result.close()
            return
          }
        request.result.onversionchange = () => { request.result.close(); this.databasePromise = undefined; this.vocabularyInitialization = undefined }
          resolve(request.result)
        }
        request.onerror = () => reject(request.error)
        request.onblocked = () => {
          blocked = true
          reject(new Error('Database upgrade is blocked by another tab'))
        }
      })
      this.databasePromise = openPromise
      void openPromise.catch(() => {
        if (this.databasePromise === openPromise) this.databasePromise = undefined
      })
    }
    return this.databasePromise
  }

  private initializeVocabulary(): Promise<void> {
    if (!this.vocabularyInitialization) {
      this.vocabularyInitialization = this.seedVocabulary().catch((error) => {
        this.vocabularyInitialization = undefined
        throw error
      })
    }
    return this.vocabularyInitialization
  }

  private async seedVocabulary(): Promise<void> {
    const entries = Object.values(this.vocabularySeeds).flat()
    if (!this.vocabularySeeds.es.length) throw new Error('Spanish vocabulary seed is empty')
    if (new Set(entries.map((word) => word.id)).size !== entries.length) throw new Error('Vocabulary seed contains duplicate ids')
    for (const language of ['es', 'en'] satisfies LearningLanguage[]) {
      if (this.vocabularySeeds[language].length) await this.seedLanguage(language)
    }
  }

  private async seedLanguage(language: LearningLanguage): Promise<void> {
    const seed = this.vocabularySeeds[language].map(normalizeVocabularyEntry)
    if (seed.some((entry) => entry.language !== language)) throw new Error(`Vocabulary seed contains wrong language for ${language}`)
    const database = await this.open()
    const transaction = database.transaction([STORE_VOCABULARY, STORE_METADATA], 'readwrite')
    const vocabularyStore = transaction.objectStore(STORE_VOCABULARY)
    const metadataStore = transaction.objectStore(STORE_METADATA)
    const metadataRequest = metadataStore.get(`vocabulary:${language}`) as IDBRequest<VocabularyMetadata | undefined>

    metadataRequest.onsuccess = () => {
      const metadata = metadataRequest.result
      if (metadata?.revision === this.vocabularyRevisions[language] && metadata.count === seed.length) return
      const allRequest = vocabularyStore.getAll() as IDBRequest<StoredVocabularyEntry[]>
      allRequest.onsuccess = () => {
        allRequest.result.filter((word) => inferredLanguage(word) === language).forEach((word) => vocabularyStore.delete(word.id))
        seed.forEach((word, order) => vocabularyStore.put({ ...word, order } satisfies StoredVocabularyEntry))
        metadataStore.put({
          id: `vocabulary:${language}`,
          language,
          revision: this.vocabularyRevisions[language],
          count: seed.length,
          updatedAt: new Date().toISOString(),
        } satisfies VocabularyMetadata)
      }
    }
    await transactionDone(transaction)
  }

  private async getAll<T>(storeName: string): Promise<T[]> {
    const database = await this.open()
    const transaction = database.transaction(storeName, 'readonly')
    return requestResult(transaction.objectStore(storeName).getAll()) as Promise<T[]>
  }

  private async put<T>(storeName: string, value: T): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(storeName, 'readwrite')
    transaction.objectStore(storeName).put(value)
    await transactionDone(transaction)
  }

  async getAllProgress(language: LearningLanguage = 'es'): Promise<WordProgress[]> {
    const progress = await this.getAll<WordProgress>(STORE_PROGRESS)
    return progress.filter((item) => inferredLanguage(item) === language)
  }

  async putProgress(progress: WordProgress): Promise<void> {
    await this.put(STORE_PROGRESS, { ...progress, language: inferredLanguage(progress) })
  }

  async getVocabulary(language: LearningLanguage = 'es'): Promise<VocabularyEntry[]> {
    await this.initializeVocabulary()
    const stored = await this.getAll<StoredVocabularyEntry>(STORE_VOCABULARY)
    const selected = stored.filter((word) => inferredLanguage(word) === language)
    if (!selected.length) throw new Error(`${language} vocabulary database is empty`)
    return selected.sort((left, right) => left.order - right.order).map(({ order: _order, ...word }) => normalizeVocabularyEntry(word))
  }

  async getSessions(language: LearningLanguage = 'es'): Promise<StudySession[]> {
    const sessions = await this.getAll<StudySession>(STORE_SESSIONS)
    return sessions.filter((session) => (session.language ?? 'es') === language)
  }

  async putSession(session: StudySession): Promise<void> {
    await this.put(STORE_SESSIONS, { ...session, language: session.language ?? 'es' })
  }

  async getSettings(): Promise<UserSettings> {
    const database = await this.open()
    const transaction = database.transaction(STORE_SETTINGS, 'readonly')
    const saved = await requestResult<Partial<UserSettings> | undefined>(transaction.objectStore(STORE_SETTINGS).get('settings'))
    if (saved) {
      const normalized = { ...DEFAULT_SETTINGS, ...saved, dataVersion: 2 } as UserSettings
      if (saved.learningLanguage && saved.dataVersion === 2) return normalized
      await this.saveSettings(normalized)
      return normalized
    }
    await this.saveSettings(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await this.put(STORE_SETTINGS, { ...settings, dataVersion: 2 })
  }

  async getActiveSession(language: LearningLanguage = 'es'): Promise<ActiveSession | undefined> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readonly')
    return requestResult(transaction.objectStore(STORE_ACTIVE).get(activeSessionId(language)))
  }

  async saveActiveSession(session: ActiveSession): Promise<void> {
    const language = session.language ?? 'es'
    await this.put(STORE_ACTIVE, { ...session, id: activeSessionId(language), language })
  }

  async createActiveSession(session: ActiveSession): Promise<ActiveSession> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readwrite')
    const store = transaction.objectStore(STORE_ACTIVE)
    const request = store.get(activeSessionId(session.language)) as IDBRequest<ActiveSession | undefined>
    let result = session
    request.onsuccess = () => {
      if (request.result) result = request.result
      else store.put({ ...session, id: activeSessionId(session.language), revision: session.revision ?? 0 })
    }
    await transactionDone(transaction)
    return result
  }

  async commitStudyStep(progress: WordProgress | undefined, active: ActiveSession, daily?: SpanishDailyUpdate): Promise<void> {
    if (daily && active.language !== 'es') throw new Error('Spanish daily entry requires Spanish session')
    const database = await this.open()
    const transaction = database.transaction([STORE_PROGRESS, STORE_ACTIVE, ...(daily ? [STORE_SPANISH_DAYS] : [])], 'readwrite')
    const activeStore = transaction.objectStore(STORE_ACTIVE)
    const request = activeStore.get(activeSessionId(active.language)) as IDBRequest<ActiveSession | undefined>
    let stale = false
    request.onsuccess = () => {
      if (!isCurrentSession(request.result, active)) {
        stale = true
        transaction.abort()
        return
      }
      if (progress) transaction.objectStore(STORE_PROGRESS).put({ ...progress, language: inferredLanguage(progress) })
      activeStore.put({ ...active, id: activeSessionId(active.language) })
      if (daily) putSpanishDailyUpdate(transaction, daily)
    }
    try {
      await transactionDone(transaction)
    } catch (error) {
      if (stale) throw new StaleStudySessionError()
      throw error
    }
  }

  async completeStudyGroup(completed: StudySession, language: LearningLanguage, progress?: WordProgress, finalSession?: ActiveSession, daily?: SpanishDailyUpdate | readonly SpanishDailyUpdate[]): Promise<void> {
    if (daily && language !== 'es') throw new Error('Spanish daily entry requires Spanish session')
    const database = await this.open()
    const stores = progress ? [STORE_SESSIONS, STORE_ACTIVE, STORE_PROGRESS] : [STORE_SESSIONS, STORE_ACTIVE]
    if (daily) stores.push(STORE_SPANISH_DAYS)
    const transaction = database.transaction(stores, 'readwrite')
    const activeStore = transaction.objectStore(STORE_ACTIVE)
    const commit = () => {
      if (progress) transaction.objectStore(STORE_PROGRESS).put({ ...progress, language: inferredLanguage(progress) })
      transaction.objectStore(STORE_SESSIONS).put({ ...completed, language })
      activeStore.delete(activeSessionId(language))
      if (daily) putSpanishDailyUpdates(transaction, Array.isArray(daily) ? daily : [daily as SpanishDailyUpdate])
    }
    let stale = false
    if (finalSession) {
      const request = activeStore.get(activeSessionId(language)) as IDBRequest<ActiveSession | undefined>
      request.onsuccess = () => {
        if (!isCurrentSession(request.result, finalSession)) {
          stale = true
          transaction.abort()
        } else commit()
      }
    } else commit()
    try {
      await transactionDone(transaction)
    } catch (error) {
      if (stale) throw new StaleStudySessionError()
      throw error
    }
  }

  async clearActiveSession(language: LearningLanguage = 'es'): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readwrite')
    transaction.objectStore(STORE_ACTIVE).delete(activeSessionId(language))
    await transactionDone(transaction)
  }

  async clearLearningData(language: LearningLanguage = 'es'): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([STORE_PROGRESS, STORE_SESSIONS, STORE_ACTIVE, STORE_SPANISH_DAYS], 'readwrite')
    if (language === 'es') transaction.objectStore(STORE_SPANISH_DAYS).clear()
    const progressStore = transaction.objectStore(STORE_PROGRESS)
    const sessionsStore = transaction.objectStore(STORE_SESSIONS)
    const progressRequest = progressStore.getAll() as IDBRequest<WordProgress[]>
    progressRequest.onsuccess = () => progressRequest.result
      .filter((item) => inferredLanguage(item) === language)
      .forEach((item) => progressStore.delete(item.wordId))
    const sessionsRequest = sessionsStore.getAll() as IDBRequest<StudySession[]>
    sessionsRequest.onsuccess = () => sessionsRequest.result
      .filter((session) => (session.language ?? 'es') === language)
      .forEach((session) => sessionsStore.delete(session.id))
    transaction.objectStore(STORE_ACTIVE).delete(activeSessionId(language))
    await transactionDone(transaction)
  }

  get aiChannelName(): string { return `${this.databaseName}:ai-events` }

  async getSpanishDay(date: string): Promise<SpanishDailyRecord> {
    const db = await this.open()
    return await requestResult<SpanishDailyRecord | undefined>(db.transaction(STORE_SPANISH_DAYS).objectStore(STORE_SPANISH_DAYS).get(date)) ?? { id: date, entries: {} }
  }

  async getSpanishDays(): Promise<SpanishDailyRecord[]> {
    return this.getAll<SpanishDailyRecord>(STORE_SPANISH_DAYS)
  }

  /** One CAS transaction owns every effect of a cloze step, including the final step. */
  async commitSpanishStep(active: ActiveSession, progress?: WordProgress, update?: SpanishDailyUpdate, completed?: StudySession): Promise<void> {
    if (active.language !== 'es' || !active.spanish) throw new Error('Invalid Spanish session')
    const db = await this.open()
    const tx = db.transaction([STORE_ACTIVE, STORE_PROGRESS, STORE_SPANISH_DAYS, STORE_SESSIONS], 'readwrite')
    const activeStore = tx.objectStore(STORE_ACTIVE)
    const request = activeStore.get('active-session:es') as IDBRequest<ActiveSession | undefined>
    let stale = false
    request.onsuccess = () => {
      if (!isCurrentSession(request.result, active)) { stale = true; tx.abort(); return }
      if (progress) tx.objectStore(STORE_PROGRESS).put(progress)
      if (completed) {
        tx.objectStore(STORE_SESSIONS).put(completed)
        activeStore.delete('active-session:es')
      } else activeStore.put(active)
      if (update) putSpanishDailyUpdate(tx, update)
    }
    try { await transactionDone(tx) } catch (error) {
      if (stale) throw new StaleStudySessionError()
      throw error
    }
  }

  async getAiConfiguration(): Promise<{ settings: AiSettings; credential?: EncryptedCredential }> {
    const database = await this.open()
    const tx = database.transaction([STORE_AI_SETTINGS, STORE_AI_CREDENTIALS])
    const [settings, credential] = await Promise.all([
      requestResult<AiSettings | undefined>(tx.objectStore(STORE_AI_SETTINGS).get('ai')),
      requestResult<EncryptedCredential | undefined>(tx.objectStore(STORE_AI_CREDENTIALS).get('ai')),
    ])
    return { settings: settings ?? { ...DEFAULT_AI_SETTINGS }, credential }
  }

  async saveAiConfiguration(settings: AiSettings, credential?: EncryptedCredential): Promise<{ settings: AiSettings; credential?: EncryptedCredential }> {
    const database = await this.open()
    const tx = database.transaction([STORE_AI_SETTINGS, STORE_AI_CREDENTIALS], 'readwrite')
    const store = tx.objectStore(STORE_AI_SETTINGS)
    const request = store.get('ai') as IDBRequest<AiSettings | undefined>
    let saved = settings
    let stale = false
    request.onsuccess = () => {
      const revision = request.result?.revision ?? 0
      if (settings.revision !== revision) { stale = true; tx.abort(); return }
      saved = { ...settings, id: 'ai', revision: revision + 1 }
      store.put(saved)
      store.delete('lease')
      if (credential) tx.objectStore(STORE_AI_CREDENTIALS).put(credential)
      else tx.objectStore(STORE_AI_CREDENTIALS).delete('ai')
    }
    try { await transactionDone(tx) } catch (error) {
      if (stale) throw new Error('AI 配置已在其他页面修改，请刷新设置后重试。')
      throw error
    }
    return { settings: saved, credential }
  }

  async getAiAnalysis(key: string): Promise<WordAiAnalysis | undefined> {
    const database = await this.open()
    return requestResult(database.transaction(STORE_AI_ANALYSES).objectStore(STORE_AI_ANALYSES).get(key))
  }

  async acquireAiLease(owner: string, revision: number, now = Date.now(), wordId?: string): Promise<boolean> {
    const database = await this.open()
    const tx = database.transaction(STORE_AI_SETTINGS, 'readwrite')
    const store = tx.objectStore(STORE_AI_SETTINGS)
    const settingsRequest = store.get('ai') as IDBRequest<AiSettings | undefined>
    let acquired = false
    settingsRequest.onsuccess = () => {
      if (!settingsRequest.result?.enabled || settingsRequest.result.revision !== revision) return
      const request = store.get('lease') as IDBRequest<AiLease | undefined>
      request.onsuccess = () => {
        if (request.result && request.result.expiresAt > now) return
        store.put({ id: 'lease', owner, revision, expiresAt: now + 90000, wordId } satisfies AiLease)
        acquired = true
      }
    }
    await transactionDone(tx)
    return acquired
  }

  async releaseAiLease(owner: string): Promise<void> {
    const database = await this.open()
    const tx = database.transaction(STORE_AI_SETTINGS, 'readwrite')
    const store = tx.objectStore(STORE_AI_SETTINGS)
    const request = store.get('lease') as IDBRequest<AiLease | undefined>
    request.onsuccess = () => { if (request.result?.owner === owner) store.delete('lease') }
    await transactionDone(tx)
  }

  async saveAiAnalysis(analysis: WordAiAnalysis, owner: string, revision: number, now = Date.now()): Promise<boolean> {
    const database = await this.open()
    const tx = database.transaction([STORE_AI_SETTINGS, STORE_AI_ANALYSES], 'readwrite')
    const store = tx.objectStore(STORE_AI_SETTINGS)
    const request = store.get('ai') as IDBRequest<AiSettings | undefined>
    let saved = false
    request.onsuccess = () => {
      if (!request.result?.enabled || request.result.revision !== revision) return
      const lease = store.get('lease') as IDBRequest<AiLease | undefined>
      lease.onsuccess = () => {
        if (lease.result?.owner !== owner || lease.result.revision !== revision || lease.result.expiresAt <= now) return
        tx.objectStore(STORE_AI_ANALYSES).put(analysis)
        saved = true
      }
    }
    await transactionDone(tx)
    return saved
  }

  async clearAiAnalyses(wordId?: string): Promise<void> {
    const database = await this.open()
    const tx = database.transaction([STORE_AI_SETTINGS, STORE_AI_ANALYSES], 'readwrite')
    const settingsStore = tx.objectStore(STORE_AI_SETTINGS)
    const lease = settingsStore.get('lease') as IDBRequest<AiLease | undefined>
    lease.onsuccess = () => {
      if (!wordId || !lease.result?.wordId || lease.result.wordId === wordId) settingsStore.delete('lease')
    }
    const store = tx.objectStore(STORE_AI_ANALYSES)
    if (!wordId) store.clear()
    else {
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if ((cursor.value as WordAiAnalysis).wordId === wordId) cursor.delete()
        cursor.continue()
      }
    }
    await transactionDone(tx)
  }

  async getWordleGame(): Promise<WordleGame | undefined> {
    const db = await this.open()
    return requestResult(db.transaction(STORE_WORDLE).objectStore(STORE_WORDLE).get('current'))
  }

  async saveWordleGame(game: WordleGame, expectedRevision: number | undefined): Promise<boolean> {
    const db = await this.open()
    const tx = db.transaction(STORE_WORDLE, 'readwrite')
    const store = tx.objectStore(STORE_WORDLE)
    const request = store.get('current') as IDBRequest<WordleGame | undefined>
    let saved = false
    request.onsuccess = () => {
      if (request.result?.revision !== expectedRevision) return
      if (game.revision !== (expectedRevision === undefined ? 0 : expectedRevision + 1)) return
      store.put(game); saved = true
    }
    await transactionDone(tx)
    return saved
  }

  async getWordleDictionaryEntry(term: string): Promise<WordleDictionaryEntry | undefined> {
    const db = await this.open()
    return requestResult(db.transaction(STORE_WORDLE_DICTIONARY).objectStore(STORE_WORDLE_DICTIONARY).get(term))
  }

  async saveWordleDictionaryEntry(entry: WordleDictionaryEntry): Promise<void> {
    const db = await this.open()
    const tx = db.transaction(STORE_WORDLE_DICTIONARY, 'readwrite')
    tx.objectStore(STORE_WORDLE_DICTIONARY).put(entry)
    await transactionDone(tx)
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined)
    this.databasePromise = undefined
    this.vocabularyInitialization = undefined
  }
}

export const storage = new PalabraStorage()
