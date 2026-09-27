import { afterEach, describe, expect, it, vi } from 'vitest'
import { PalabraStorage } from '../data/storage'
import type { VocabularyEntry } from '../types'
import { WordleController } from './controller'
import { WiktionaryClient } from './dictionary'
import { localEntry } from './rules'
import { loadEcdict } from './ecdict'
const word = (term: string): VocabularyEntry => ({id:`en:${term}`,language:'en',term,partOfSpeech:'n.',meaningZh:term,category:'测试',examples:[]})
const stores:PalabraStorage[]=[]
const controllers:WordleController[]=[]
afterEach(()=>{controllers.splice(0).forEach(c=>c.dispose());stores.splice(0).forEach(s=>s.close());vi.restoreAllMocks()})
async function setup(client=new WiktionaryClient(), online=()=>true, store?:PalabraStorage, supplement:typeof loadEcdict=async()=>new Map()) {
  const db=store??new PalabraStorage(`game-${crypto.randomUUID()}`,{vocabularySeeds:{en:[word('apple'),word('grape')]}})
  stores.push(db)
  const controller=new WordleController(db,client,()=>0,online,supplement);controllers.push(controller)
  await controller.initialize();return {db,controller}
}
describe('Wordle controller',()=>{
  it('preserves a saved game and local/cache play when the optional dictionary cannot load',async()=>{
    const {db,controller}=await setup(undefined,()=>false)
    await controller.edit('gra');controller.dispose()
    await db.saveWordleDictionaryEntry({term:'xyzzz',source:'wiktionary',definitions:[{partOfSpeech:'Noun',text:'Cached definition.'}]})
    const {controller:restored}=await setup(undefined,()=>false,db,async()=>{throw new Error('chunk unavailable')})
    expect(restored.getSnapshot().draft).toBe('gra')
    expect(restored.getSnapshot().dictionaryWarning).toContain('扩展词典')
    await restored.edit('grape');await restored.submit()
    await restored.edit('xyzzz');await restored.submit()
    expect(restored.getSnapshot().game?.guesses.map(g=>g.term)).toEqual(['grape','xyzzz'])
  })
  it('accepts ECDICT words offline without network or expanding the answer pool',async()=>{
    const client=new WiktionaryClient()
    const lookup=vi.spyOn(client,'lookup').mockRejectedValue(new Error('network must not be used'))
    const {db,controller}=await setup(client,()=>false,undefined,loadEcdict)
    await controller.edit('wreck');await controller.submit()
    expect(controller.getSnapshot().game?.guesses[0].entry).toMatchObject({source:'ecdict'})
    expect(controller.getSnapshot().game?.guesses[0].entry.definitions[0].text).toContain('残骸')
    expect(controller.getSnapshot().candidateCount).toBe(2)
    expect(lookup).not.toHaveBeenCalled()
    expect((await db.getVocabulary('en')).map(w=>w.term)).toEqual(['apple','grape'])
    await controller.edit('apple');await controller.submit()
    expect(controller.getSnapshot().game?.guesses[1].entry.source).toBe('local')
  })
  it('does not start a lookup after leaving during a cache read',async()=>{
    const client=new WiktionaryClient()
    const lookup=vi.spyOn(client,'lookup').mockRejectedValue(new Error('unexpected lookup'))
    const {db,controller}=await setup(client)
    let release!:()=>void
    const cache=vi.spyOn(db,'getWordleDictionaryEntry').mockImplementation(()=>new Promise(resolve=>{release=()=>resolve(undefined)}))
    await controller.edit('wreck')
    const pending=controller.submit()
    await vi.waitFor(()=>expect(cache).toHaveBeenCalled())
    controller.dispose();release();await pending
    expect(lookup).not.toHaveBeenCalled()
  })
  it('saves input, restores unfinished game and accepts local words offline without touching learning data',async()=>{
    const {db,controller}=await setup(undefined,()=>false)
    await controller.edit('gra')
    expect((await db.getWordleGame())?.draft).toBe('gra')
    controller.dispose()
    const {controller:restored}=await setup(undefined,()=>false,db)
    expect(restored.getSnapshot().draft).toBe('gra')
    await restored.edit('grape');await restored.submit()
    expect(restored.getSnapshot().game?.guesses[0].term).toBe('grape')
    await restored.edit('apple');await restored.submit()
    expect(restored.getSnapshot().game?.status).toBe('won')
    expect(await db.getAllProgress('en')).toEqual([])
    expect(await db.getActiveSession('en')).toBeUndefined()
    await restored.newGame();expect(restored.getSnapshot().game?.answer.term).toBe('grape')
  })
  it('does not spend attempts for invalid, duplicate or offline uncached guesses',async()=>{
    const {controller}=await setup(undefined,()=>false)
    await controller.edit('abcd');await controller.submit()
    expect(controller.getSnapshot().error).toContain('五个')
    await controller.edit('zzzzz');await controller.submit()
    expect(controller.getSnapshot().error).toContain('联网')
    await controller.edit('grape');await controller.submit()
    await controller.edit('grape');await controller.submit()
    expect(controller.getSnapshot().error).toContain('已经猜过')
    expect(controller.getSnapshot().game?.guesses).toHaveLength(1)
  })
  it('caches valid external words for offline use without adding vocabulary entries',async()=>{
    const client=new WiktionaryClient()
    const entry={...localEntry('wreck',[word('wreck')])!,source:'wiktionary' as const}
    const lookup=vi.spyOn(client,'lookup').mockResolvedValue(entry)
    const {db,controller}=await setup(client)
    await controller.edit('wreck');await controller.submit()
    expect(controller.getSnapshot().game?.guesses[0].entry.source).toBe('wiktionary')
    expect(await db.getWordleDictionaryEntry('wreck')).toEqual(entry)
    expect((await db.getVocabulary('en')).map(w=>w.term)).toEqual(['apple','grape'])
    controller.dispose()
    const {controller:restored}=await setup(client,()=>false,db)
    await restored.edit('apple');await restored.submit();await restored.newGame()
    await restored.edit('wreck');await restored.submit()
    expect(restored.getSnapshot().game?.guesses[0].term).toBe('wreck');expect(lookup).toHaveBeenCalledTimes(1)
  })
  it('keeps draft and attempt count when persisting an accepted guess fails',async()=>{
    const {db,controller}=await setup()
    await controller.edit('grape')
    vi.spyOn(db,'saveWordleGame').mockRejectedValueOnce(new Error('QuotaExceeded'))
    await controller.submit()
    expect(controller.getSnapshot()).toMatchObject({draft:'grape',game:{guesses:[]}})
    expect(controller.getSnapshot().error).toContain('保存')
    await controller.submit();expect(controller.getSnapshot().game?.guesses).toHaveLength(1)
  })
  it('reloads a newer game on CAS conflict without applying a stale submission',async()=>{
    const {db,controller}=await setup()
    const {controller:other}=await setup(undefined,()=>true,db)
    await other.edit('grape');await other.submit()
    await controller.edit('apple');await controller.submit()
    expect(controller.getSnapshot().game?.guesses.map(g=>g.term)).toEqual(['grape'])
    expect((await db.getWordleGame())?.guesses).toHaveLength(1)
  })
  it('allows only one submission and ignores late dictionary responses after leaving',async()=>{
    const client=new WiktionaryClient()
    let resolve!: (entry: ReturnType<typeof localEntry>)=>void
    const lookup=vi.spyOn(client,'lookup').mockImplementation(()=>new Promise(r=>{resolve=r as typeof resolve}))
    const {db,controller}=await setup(client)
    await controller.edit('wreck')
    const first=controller.submit();void controller.submit()
    await vi.waitFor(()=>expect(lookup).toHaveBeenCalledTimes(1))
    controller.dispose();resolve(localEntry('wreck',[word('wreck')]))
    await first;expect((await db.getWordleGame())?.guesses).toEqual([])
  })
})
