import { afterEach,it,expect,vi } from 'vitest'
import { PalabraStorage,DEFAULT_SETTINGS } from './storage'
import type { EnglishWordbookBundle } from '../wordbooks/types'
import type { VocabularyEntry } from '../types'
export const apple:VocabularyEntry={id:'en:apple',language:'en',term:'apple',partOfSpeech:'n.',meaningZh:'苹果',category:'测试',examples:[{text:'I ate an apple.',translationZh:'我吃了一个苹果。'}]}
export const bundle:EnglishWordbookBundle={revision:11,words:[apple,{...apple,id:'en:pear',term:'pear',meaningZh:'梨'}],books:[{id:'en-highschool',language:'en',title:'高考 3500',revision:1,members:[{wordId:apple.id,order:0,memberships:[]}]},{id:'en-oxford-primary',language:'en',title:'小学必背单词（牛津版）',revision:1,members:[{wordId:apple.id,order:0,memberships:[{sourceBookId:'g1s1',grade:1,semester:1}]},{wordId:'en:pear',order:1,memberships:[{sourceBookId:'g2s2',grade:2,semester:2}]}]}]}
const clients:PalabraStorage[]=[]
const make=(name=crypto.randomUUID(),seed=bundle)=>{const db=new PalabraStorage(name,{wordbookBundle:seed});clients.push(db);return db}
afterEach(()=>{clients.splice(0).forEach(c=>c.close());vi.restoreAllMocks()})
it('migrates v6 records without changing learning, AI, Wordle or Spanish data',async()=>{
  const name=crypto.randomUUID()
  const records:Record<string,object>={
    wordProgress:{wordId:apple.id,language:'en',stage:6,skipReview:true},
    sessions:{id:'history',language:'en',newCount:5},
    activeSession:{id:'active-session:en',language:'en',wordIds:[apple.id],revision:7,quizFeedback:{wordId:apple.id,correct:false,selected:'pear'}},
    settings:{...DEFAULT_SETTINGS,learningLanguage:'en'},spanishDays:{id:'2026-09-30',entries:{}},
    aiAnalyses:{key:'cached',wordId:apple.id},wordleGame:{id:'current',answer:'apple',revision:2},
  }
  const old=await new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open(name,6)
    request.onupgradeneeded=()=>{for(const [store,value] of Object.entries(records)){const keyPath=store==='wordProgress'?'wordId':store==='aiAnalyses'?'key':'id';request.result.createObjectStore(store,{keyPath}).put(value)}}
    request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
  })
  old.close();const db=make(name);await db.getWordbooks()
  const raw=await new Promise<IDBDatabase>(resolve=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result)})
  for(const [store,value] of Object.entries(records)) {
    const values=await new Promise<unknown[]>(resolve=>{const r=raw.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result)})
    expect(values[0]).toEqual(['sessions','activeSession'].includes(store)?{...value,sourceWordbook:'en-highschool',reviewScope:'book'}:value)
  }
  raw.close()
})
it('shares IDs and progress, initializes idempotently and reopens',async()=>{
  const db=make()
  await db.putProgress({wordId:apple.id,language:'en',stage:6,status:'mastered',nextReviewAt:'2099-01-01',lastReviewedAt:'2026-01-01',reviewCount:1,correctCount:1,skipReview:true})
  const [high,primary]=await Promise.all([db.getWordbookVocabulary('en-highschool'),db.getWordbookVocabulary('en-oxford-primary')])
  expect(high[0].id).toBe(primary[0].id)
  const put=vi.spyOn(IDBObjectStore.prototype,'put')
  await db.getVocabulary('en');await db.getWordbooks();expect(put).not.toHaveBeenCalled()
  db.close();await db.getWordbooks();expect(put).not.toHaveBeenCalled()
  expect(await db.getAllProgress('en')).toHaveLength(1)
})
it('rejects invalid references and atomically rolls back a failed revision',async()=>{
  const name=crypto.randomUUID(),db=make(name);await db.getWordbooks();db.close()
  const bad=structuredClone(bundle);bad.revision++;bad.books[1].members[0].wordId='missing'
  await expect(make(name,bad).getWordbooks()).rejects.toThrow()
  const next=structuredClone(bundle);next.revision++;next.words[0].meaningZh='新资料'
  const original=IDBObjectStore.prototype.put
  vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<IDBObjectStore['put']>){
    if(this.name==='wordbooks'){this.transaction.abort();return original.apply(this,args)}
    return original.apply(this,args)
  })
  await expect(make(name,next).getWordbooks()).rejects.toBeDefined()
  vi.restoreAllMocks()
  expect((await make(name).getVocabulary('en'))[0].meaningZh).toBe('苹果')
})
it('clears shared English memory but keeps settings, dictionary and books',async()=>{
  const db=make();await db.getWordbooks();await db.saveSettings({...DEFAULT_SETTINGS,englishWordbook:'en-oxford-primary'})
  await db.putProgress({wordId:apple.id,language:'en',stage:1,status:'learning',nextReviewAt:'2026-01-01',lastReviewedAt:'2026-01-01',reviewCount:1,correctCount:1})
  await db.clearLearningData('en')
  expect(await db.getAllProgress('en')).toEqual([])
  expect(await db.getWordbooks()).toHaveLength(2)
  expect(await db.getVocabulary('en')).toHaveLength(2)
  expect((await db.getSettings()).englishWordbook).toBe('en-oxford-primary')
})
