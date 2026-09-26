import type {
  ActiveSession,
  LearningLanguage,
  StudySession,
  UserSettings,
  VocabularyEntry,
  WordProgress,
} from '../types'
import { vocabulary } from './vocabulary'
import { englishVocabulary } from './englishVocabulary'

const DB_VERSION = 3
const DEFAULT_VOCABULARY_REVISIONS: Record<LearningLanguage, number> = { es: 1, en: 3 }
const STORE_PROGRESS = 'wordProgress'
const STORE_SESSIONS = 'sessions'
const STORE_SETTINGS = 'settings'
const STORE_ACTIVE = 'activeSession'
const STORE_VOCABULARY = 'vocabulary'
const STORE_METADATA = 'metadata'

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
  id: 'settings',
  dailyNewWords: 10,
  enableChoice: true,
  enableSpelling: true,
  theme: 'system',
  learningLanguage: 'es',
  dataVersion: 2,
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
    const legacySpanishSeed = options.vocabularySeed ?? vocabulary
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
          if (!database.objectStoreNames.contains(STORE_PROGRESS)) database.createObjectStore(STORE_PROGRESS, { keyPath: 'wordId' })
          if (!database.objectStoreNames.contains(STORE_SESSIONS)) database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_SETTINGS)) database.createObjectStore(STORE_SETTINGS, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_ACTIVE)) database.createObjectStore(STORE_ACTIVE, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_VOCABULARY)) database.createObjectStore(STORE_VOCABULARY, { keyPath: 'id' })
          if (!database.objectStoreNames.contains(STORE_METADATA)) database.createObjectStore(STORE_METADATA, { keyPath: 'id' })
          if (event.oldVersion < 3) migrateToVersionThree(request.transaction!)
        }
        request.onsuccess = () => {
          if (blocked) {
            request.result.close()
            return
          }
          request.result.onversionchange = () => request.result.close()
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

  async clearActiveSession(language: LearningLanguage = 'es'): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readwrite')
    transaction.objectStore(STORE_ACTIVE).delete(activeSessionId(language))
    await transactionDone(transaction)
  }

  async clearLearningData(language: LearningLanguage = 'es'): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([STORE_PROGRESS, STORE_SESSIONS, STORE_ACTIVE], 'readwrite')
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

  close(): void {
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined)
    this.databasePromise = undefined
    this.vocabularyInitialization = undefined
  }
}

export const storage = new PalabraStorage()
