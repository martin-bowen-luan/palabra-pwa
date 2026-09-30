import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PalabraStorage } from '../data/storage'
import { AiService } from './service'
import { DEFAULT_AI_SETTINGS } from './types'
import type { VocabularyEntry } from '../types'
const cryptoModule = 'node:crypto'
const { webcrypto } = await import(/* @vite-ignore */ cryptoModule) as { webcrypto: Crypto }

const word: VocabularyEntry = { id:'en:happy', language:'en',term:'happy',partOfSpeech:'adj.',meaningZh:'快乐的',category:'测试',examples:[{text:'I am happy.',translationZh:'我很快乐。'}] }
const result = { derived: [], roots: [], synonyms: [], conflicts: [] }
const stores: PalabraStorage[] = []; const services: AiService[] = []
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => { services.splice(0).forEach(service => service.dispose()); stores.splice(0).forEach(db => db.close()); vi.unstubAllGlobals(); vi.restoreAllMocks() })
async function setup(fetcher: typeof fetch) {
  const db = new PalabraStorage(`ai-service-${crypto.randomUUID()}`); stores.push(db)
  const service = new AiService(db, fetcher); services.push(service); await service.load()
  await service.configure({ ...DEFAULT_AI_SETTINGS, enabled:true,consentVersion:1,baseUrl:'https://example.test/v1',model:'test-model' }, 'fake-test-key', 'password123')
  return { service, db }
}
const response = () => new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(result)}}]}),{status:200})
describe('AI analysis lifecycle', () => {
  it('shares cached analysis across book labels but separates changed sense input',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockImplementation(async()=>response())
    const {service}=await setup(fetcher)
    const first=await service.analyze({...word,category:'高考 3500'})
    expect(await service.analyze({...word,category:'小学必背单词（牛津版）'})).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const changed=await service.analyze({...word,meaningZh:'幸福的'})
    expect(changed.key).not.toBe(first.key)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(await service.analyze(word)).toEqual(first)
  })
  it.each(['clear', 'navigate'] as const)('cancels analysis still reading the cache on %s', async action => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())
    const {service, db} = await setup(fetcher)
    let resume!: (value: undefined) => void
    vi.spyOn(db, 'getAiAnalysis').mockImplementationOnce(() => new Promise(resolve => { resume = resolve }))
    const pending = service.analyze(word)
    const rejected = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.waitFor(() => expect(resume).toBeDefined())
    if (action === 'clear') await service.clearAnalyses(word.id)
    else service.cancelRequests()
    resume(undefined)
    await rejected
    expect(fetcher).not.toHaveBeenCalled()
    expect(service.getSnapshot().unlocked).toBe(true)
  })
  it('normalizes pasted key whitespace consistently before and after unlocking', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())
    const {service} = await setup(fetcher)
    await service.configure(service.getSnapshot().settings, '  fake-test-key  ', 'password123')
    service.lock(); await service.unlock('password123')
    await service.analyze(word)
    expect(new Headers(fetcher.mock.calls[0][1]?.headers).get('Authorization')).toBe('Bearer fake-test-key')
  })
  it('does not cancel a pending cache read when another tab deletes a different word', async () => {
    const {service,db}=await setup(vi.fn<typeof fetch>().mockResolvedValue(response()))
    const cached=await service.analyze(word)
    const peer=new AiService(db); services.push(peer); await peer.load()
    let resume!: (value:typeof cached)=>void
    vi.spyOn(db,'getAiAnalysis').mockImplementationOnce(()=>new Promise(resolve=>{resume=resolve}))
    const pending=service.analyze(word)
    const outcome=pending.then(value=>({value}),error=>({error}))
    await vi.waitFor(()=>expect(resume).toBeDefined())
    await peer.clearAnalyses('en:other')
    await vi.waitFor(()=>expect(service.getSnapshot().wordCacheEpochs['en:other']).toBe(1))
    resume(cached)
    expect(await outcome).toEqual({value:cached})
  })
  it('deduplicates concurrent requests, caches empty results, and reuses them offline while locked', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response())
    const { service } = await setup(fetcher)
    const [first, second] = await Promise.all([service.analyze(word),service.analyze(word)])
    expect(first).toEqual(second); expect(first.result).toEqual(result); expect(fetcher).toHaveBeenCalledTimes(1)
    service.lock(); vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    expect(await service.analyze(word)).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('keeps a shared request alive when only one of its viewers leaves', async () => {
    let finish!: (value:Response)=>void
    const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const {service,db}=await setup(fetcher)
    const read=vi.spyOn(db,'getAiAnalysis')
    const controller=new AbortController()
    const first=service.analyze(word,{signal:controller.signal})
    const rejected=expect(first).rejects.toMatchObject({name:'AbortError'})
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    const second=service.analyze(word)
    const outcome=second.then(value=>({value}),error=>({error}))
    await vi.waitFor(()=>expect(read).toHaveBeenCalledTimes(3))
    controller.abort();await rejected;finish(response())
    expect(await outcome).toMatchObject({value:{result}})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('rejects malformed regeneration without overwriting the old success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(response()).mockResolvedValueOnce(new Response(JSON.stringify({choices:[{finish_reason:'length',message:{content:'{broken'}}]})))
    const {service} = await setup(fetcher); const first = await service.analyze(word)
    await expect(service.analyze(word,{force:true})).rejects.toThrow()
    expect(await service.analyze(word)).toEqual(first)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })
  it('cancels requests on disable and never persists a late response', async () => {
    let finish!: (value:Response)=>void
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise(resolve => { finish=resolve }))
    const {service,db} = await setup(fetcher)
    const pending = service.analyze(word); const rejected = expect(pending).rejects.toThrow()
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1))
    await service.setEnabled(false);finish(response());await rejected
    expect(service.getSnapshot().unlocked).toBe(false)
    const config = await db.getAiConfiguration();expect(config.settings.enabled).toBe(false)
    await service.setEnabled(true);await expect(service.analyze(word)).rejects.toThrow(/解锁/)
  })
  it('starts locked after reload and does not persist the plaintext key or password', async () => {
    const {service,db}=await setup(vi.fn<typeof fetch>().mockResolvedValue(response()))
    service.dispose();const reloaded=new AiService(db);services.push(reloaded);await reloaded.load()
    expect(reloaded.getSnapshot().unlocked).toBe(false)
    const serialized=JSON.stringify(await db.getAiConfiguration())
    expect(serialized).not.toContain('fake-test-key');expect(serialized).not.toContain('password123')
    await expect(reloaded.unlock('wrong-password')).rejects.toThrow()
    await reloaded.unlock('password123');expect(reloaded.getSnapshot().unlocked).toBe(true)
  })
  it('requires consent before enabling and refuses non-English analysis', async () => {
    const db=new PalabraStorage(`ai-consent-${crypto.randomUUID()}`);stores.push(db);const service=new AiService(db);services.push(service);await service.load()
    await expect(service.setEnabled(true)).rejects.toThrow(/同意/)
    await expect(service.analyze({...word,language:'es'})).rejects.toThrow()
  })
  it('times out once, aborts the request and does not automatically retry', async () => {
    const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(()=>{}))
    const {service}=await setup(fetcher)
    let timeout!: () => void
    const originalTimeout=globalThis.setTimeout
    vi.spyOn(globalThis,'setTimeout').mockImplementation(((callback: () => void, delay?: number, ...args: unknown[]) => {
      if(delay===60000) { timeout=callback; return originalTimeout(()=>{}, 60000) }
      return originalTimeout(callback,delay,...args)
    }) as typeof setTimeout)
    const pending=service.analyze(word);const rejected=expect(pending).rejects.toThrow(/60 秒/)
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    timeout();await rejected
    expect(fetcher.mock.calls[0][1]?.signal?.aborted).toBe(true)
    expect(service.getSnapshot().busy).toBe(false)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('serializes different words and cancels a queued view before any paid call', async () => {
    let finish!: (value:Response)=>void
    const fetcher=vi.fn<typeof fetch>().mockImplementation(()=>new Promise(resolve=>{finish=resolve}))
    const {service}=await setup(fetcher)
    const first=service.analyze(word)
    await vi.waitFor(()=>expect(fetcher).toHaveBeenCalledTimes(1))
    const controller=new AbortController()
    const second=service.analyze({...word,id:'en:other',term:'other'},{signal:controller.signal})
    const rejected=expect(second).rejects.toMatchObject({name:'AbortError'})
    controller.abort();await rejected
    finish(response());await first
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})
