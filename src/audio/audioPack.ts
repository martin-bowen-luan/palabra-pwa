import { englishVocabulary,englishWordbookBundle } from '../data/englishVocabulary'

export interface AudioPackFile {
  id: string
  url: string
}

export interface AudioPackStatus {
  downloaded: number
  total: number
  complete: boolean
  estimatedBytes: number
}

interface CacheLike {
  keys(): Promise<readonly Request[]>
  put(request: RequestInfo | URL, response: Response): Promise<void>
}

interface CacheStorageLike {
  open(name: string): Promise<CacheLike>
  delete(name: string): Promise<boolean>
  keys(): Promise<string[]>
}

interface AudioPackOptions {
  cacheStorage?: CacheStorageLike
  fetcher?: typeof fetch
  files?: readonly AudioPackFile[]
  version?: number
}

export const AUDIO_PACK_VERSION = 1
export const AUDIO_PACK_ESTIMATED_BYTES_PER_FILE = 24_000
const highschoolIds=new Set(englishWordbookBundle.books.find(b=>b.id==='en-highschool')!.members.map(m=>m.wordId))
export const englishAudioFiles: AudioPackFile[] = englishVocabulary.filter(w=>highschoolIds.has(w.id)).flatMap((word) => word.pronunciation?.audioPath
  ? [{ id: word.id, url: word.pronunciation.audioPath }]
  : [])

export class AudioPackManager {
  private readonly cacheStorage: CacheStorageLike
  private readonly fetcher: typeof fetch
  private readonly files: readonly AudioPackFile[]
  private readonly version: number

  constructor(options: AudioPackOptions = {}) {
    if (!options.cacheStorage && !('caches' in globalThis)) throw new Error('当前浏览器不支持离线音频缓存')
    this.cacheStorage = options.cacheStorage ?? caches
    this.fetcher = options.fetcher ?? fetch
    this.files = options.files ?? englishAudioFiles
    this.version = options.version ?? AUDIO_PACK_VERSION
  }

  private get cacheName() { return `palabra-audio-en-v${this.version}` }

  private async cleanupStaleCaches() {
    const names = await this.cacheStorage.keys()
    await Promise.all(names
      .filter((name) => name.startsWith('palabra-audio-en-v') && name !== this.cacheName)
      .map((name) => this.cacheStorage.delete(name)))
  }

  private status(downloaded: number): AudioPackStatus {
    return {
      downloaded,
      total: this.files.length,
      complete: downloaded === this.files.length,
      estimatedBytes: this.files.length * AUDIO_PACK_ESTIMATED_BYTES_PER_FILE,
    }
  }

  async getStatus(): Promise<AudioPackStatus> {
    await this.cleanupStaleCaches()
    const cache = await this.cacheStorage.open(this.cacheName)
    const cachedUrls = new Set((await cache.keys()).map((request) => request.url))
    return this.status(this.files.filter((file) => cachedUrls.has(file.url)).length)
  }

  async download(signal?: AbortSignal, onProgress?: (status: AudioPackStatus) => void): Promise<AudioPackStatus> {
    await this.cleanupStaleCaches()
    const cache = await this.cacheStorage.open(this.cacheName)
    const cachedUrls = new Set((await cache.keys()).map((request) => request.url))
    const pending = this.files.filter((file) => !cachedUrls.has(file.url))
    let downloaded = this.files.length - pending.length
    onProgress?.(this.status(downloaded))

    for (let offset = 0; offset < pending.length; offset += 6) {
      if (signal?.aborted) throw new DOMException('Download cancelled', 'AbortError')
      await Promise.all(pending.slice(offset, offset + 6).map(async (file) => {
        const response = await this.fetcher(file.url, { mode: 'no-cors', signal })
        if (!response.ok && response.type !== 'opaque') throw new Error(`无法下载 ${file.id}`)
        await cache.put(file.url, response.clone())
        downloaded += 1
        onProgress?.(this.status(downloaded))
      }))
    }
    return this.status(downloaded)
  }

  async remove(): Promise<AudioPackStatus> {
    await this.cacheStorage.delete(this.cacheName)
    return this.status(0)
  }
}
