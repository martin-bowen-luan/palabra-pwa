import { describe, expect, it, vi } from 'vitest'
import { AudioPackManager,englishAudioFiles } from './audioPack'
import { englishWordbookBundle } from '../data/englishVocabulary'

class MemoryCache {
  entries = new Map<string, Response>()
  async keys() { return [...this.entries.keys()].map((url) => new Request(url)) }
  async put(request: RequestInfo | URL, response: Response) { this.entries.set(String(request), response) }
}

class MemoryCacheStorage {
  stores = new Map<string, MemoryCache>()
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new MemoryCache())
    return this.stores.get(name)!
  }
  async delete(name: string) { return this.stores.delete(name) }
  async keys() { return [...this.stores.keys()] }
}

describe('English offline audio pack', () => {
  it('keeps the existing highschool package without primary-only recordings',()=>{
    const ids=new Set(englishWordbookBundle.books.find(b=>b.id==='en-highschool')!.members.map(m=>m.wordId))
    expect(englishAudioFiles).toHaveLength(3458)
    expect(englishAudioFiles.every(f=>ids.has(f.id))).toBe(true)
    expect(new Set(englishAudioFiles.map(f=>f.id)).size).toBe(3458)
  })
  it('resumes missing files, reports progress, and can remove the pack', async () => {
    const cacheStorage = new MemoryCacheStorage()
    const cache = await cacheStorage.open('palabra-audio-en-v1')
    await cache.put('https://audio.test/one.mp3', new Response('one'))
    const fetcher = vi.fn(async (request: RequestInfo | URL) => new Response(String(request)))
    const manager = new AudioPackManager({
      cacheStorage,
      fetcher,
      files: [
        { id: 'en:one', url: 'https://audio.test/one.mp3' },
        { id: 'en:two', url: 'https://audio.test/two.mp3' },
        { id: 'en:three', url: 'https://audio.test/three.mp3' },
      ],
      version: 1,
    })
    const progress = vi.fn()

    await expect(manager.getStatus()).resolves.toMatchObject({ downloaded: 1, total: 3, complete: false })
    await manager.download(undefined, progress)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(progress).toHaveBeenLastCalledWith(expect.objectContaining({ downloaded: 3, total: 3, complete: true }))
    await expect(manager.remove()).resolves.toMatchObject({ downloaded: 0, total: 3, complete: false })
  })

  it('deletes stale version caches before downloading', async () => {
    const cacheStorage = new MemoryCacheStorage()
    await cacheStorage.open('palabra-audio-en-v0')
    const manager = new AudioPackManager({ cacheStorage, fetcher: vi.fn(), files: [], version: 1 })
    await manager.getStatus()
    expect(await cacheStorage.keys()).not.toContain('palabra-audio-en-v0')
  })
})
