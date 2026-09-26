import type { ActiveSession, StudySession, UserSettings, VocabularyEntry, WordProgress } from '../types'
import { vocabulary } from './vocabulary'

const DB_VERSION = 2
const VOCABULARY_REVISION = 1
const STORE_PROGRESS = 'wordProgress'
const STORE_SESSIONS = 'sessions'
const STORE_SETTINGS = 'settings'
const STORE_ACTIVE = 'activeSession'
const STORE_VOCABULARY = 'vocabulary'
const STORE_METADATA = 'metadata'
const VOCABULARY_METADATA_ID = 'vocabulary'

interface VocabularyMetadata {
  id: typeof VOCABULARY_METADATA_ID
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
}

export const DEFAULT_SETTINGS: UserSettings = {
  id: 'settings',
  dailyNewWords: 10,
  enableChoice: true,
  enableSpelling: true,
  theme: 'system',
  dataVersion: 1,
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

export class PalabraStorage {
  private databasePromise?: Promise<IDBDatabase>
  private vocabularyInitialization?: Promise<void>
  private readonly vocabularySeed: readonly VocabularyEntry[]
  private readonly vocabularyRevision: number

  constructor(
    private readonly databaseName = 'palabra-db',
    options: PalabraStorageOptions = {},
  ) {
    this.vocabularySeed = options.vocabularySeed ?? vocabulary
    this.vocabularyRevision = options.vocabularyRevision ?? VOCABULARY_REVISION
  }

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      const openPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, DB_VERSION)
        let blocked = false
        request.onupgradeneeded = () => {
          const database = request.result
          if (!database.objectStoreNames.contains(STORE_PROGRESS)) {
            database.createObjectStore(STORE_PROGRESS, { keyPath: 'wordId' })
          }
          if (!database.objectStoreNames.contains(STORE_SESSIONS)) {
            database.createObjectStore(STORE_SESSIONS, { keyPath: 'id' })
          }
          if (!database.objectStoreNames.contains(STORE_SETTINGS)) {
            database.createObjectStore(STORE_SETTINGS, { keyPath: 'id' })
          }
          if (!database.objectStoreNames.contains(STORE_ACTIVE)) {
            database.createObjectStore(STORE_ACTIVE, { keyPath: 'id' })
          }
          if (!database.objectStoreNames.contains(STORE_VOCABULARY)) {
            database.createObjectStore(STORE_VOCABULARY, { keyPath: 'id' })
          }
          if (!database.objectStoreNames.contains(STORE_METADATA)) {
            database.createObjectStore(STORE_METADATA, { keyPath: 'id' })
          }
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
    if (!this.vocabularySeed.length) throw new Error('Vocabulary seed is empty')
    if (new Set(this.vocabularySeed.map((word) => word.id)).size !== this.vocabularySeed.length) {
      throw new Error('Vocabulary seed contains duplicate ids')
    }

    const database = await this.open()
    const transaction = database.transaction([STORE_VOCABULARY, STORE_METADATA], 'readwrite')
    const vocabularyStore = transaction.objectStore(STORE_VOCABULARY)
    const metadataStore = transaction.objectStore(STORE_METADATA)
    const metadataRequest = metadataStore.get(VOCABULARY_METADATA_ID) as IDBRequest<VocabularyMetadata | undefined>

    metadataRequest.onsuccess = () => {
      const metadata = metadataRequest.result
      if (metadata?.revision === this.vocabularyRevision && metadata.count === this.vocabularySeed.length) return

      vocabularyStore.clear()
      this.vocabularySeed.forEach((word, order) => {
        vocabularyStore.put({ ...word, order } satisfies StoredVocabularyEntry)
      })
      metadataStore.put({
        id: VOCABULARY_METADATA_ID,
        revision: this.vocabularyRevision,
        count: this.vocabularySeed.length,
        updatedAt: new Date().toISOString(),
      } satisfies VocabularyMetadata)
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

  async getAllProgress(): Promise<WordProgress[]> {
    return this.getAll<WordProgress>(STORE_PROGRESS)
  }

  async putProgress(progress: WordProgress): Promise<void> {
    await this.put(STORE_PROGRESS, progress)
  }

  async getVocabulary(): Promise<VocabularyEntry[]> {
    await this.initializeVocabulary()
    const stored = await this.getAll<StoredVocabularyEntry>(STORE_VOCABULARY)
    if (!stored.length) throw new Error('Vocabulary database is empty')
    return stored
      .sort((left, right) => left.order - right.order)
      .map(({ order: _order, ...word }) => word)
  }

  async getSessions(): Promise<StudySession[]> {
    return this.getAll<StudySession>(STORE_SESSIONS)
  }

  async putSession(session: StudySession): Promise<void> {
    await this.put(STORE_SESSIONS, session)
  }

  async getSettings(): Promise<UserSettings> {
    const database = await this.open()
    const transaction = database.transaction(STORE_SETTINGS, 'readonly')
    const saved = await requestResult<UserSettings | undefined>(
      transaction.objectStore(STORE_SETTINGS).get('settings'),
    )
    if (saved) return saved
    await this.saveSettings(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }

  async saveSettings(settings: UserSettings): Promise<void> {
    await this.put(STORE_SETTINGS, settings)
  }

  async getActiveSession(): Promise<ActiveSession | undefined> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readonly')
    return requestResult(transaction.objectStore(STORE_ACTIVE).get('active-session'))
  }

  async saveActiveSession(session: ActiveSession): Promise<void> {
    await this.put(STORE_ACTIVE, session)
  }

  async clearActiveSession(): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction(STORE_ACTIVE, 'readwrite')
    transaction.objectStore(STORE_ACTIVE).delete('active-session')
    await transactionDone(transaction)
  }

  async clearLearningData(): Promise<void> {
    const database = await this.open()
    const transaction = database.transaction([STORE_PROGRESS, STORE_SESSIONS, STORE_ACTIVE], 'readwrite')
    transaction.objectStore(STORE_PROGRESS).clear()
    transaction.objectStore(STORE_SESSIONS).clear()
    transaction.objectStore(STORE_ACTIVE).clear()
    await transactionDone(transaction)
  }

  close(): void {
    void this.databasePromise?.then((database) => database.close()).catch(() => undefined)
    this.databasePromise = undefined
    this.vocabularyInitialization = undefined
  }
}

export const storage = new PalabraStorage()
