import type { ActiveSession, StudySession, UserSettings, WordProgress } from '../types'

const DB_VERSION = 1
const STORE_PROGRESS = 'wordProgress'
const STORE_SESSIONS = 'sessions'
const STORE_SETTINGS = 'settings'
const STORE_ACTIVE = 'activeSession'

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

  constructor(private readonly databaseName = 'palabra-db') {}

  private open(): Promise<IDBDatabase> {
    if (!this.databasePromise) {
      this.databasePromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(this.databaseName, DB_VERSION)
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
        }
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
      })
    }
    return this.databasePromise
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
    void this.databasePromise?.then((database) => database.close())
    this.databasePromise = undefined
  }
}

export const storage = new PalabraStorage()

