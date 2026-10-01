import { afterEach, describe, expect, it, vi } from 'vitest'
import { PalabraStorage, StaleStudySessionError } from '../data/storage'
import { vocabulary } from '../data/vocabulary'
import { createSpanishSession, scheduleSpanishReview } from './course'
import type { SpanishDailyUpdate } from './sessionTypes'

const clients: PalabraStorage[]=[]
function client(name=`spanish-test-${crypto.randomUUID()}`) { const db=new PalabraStorage(name,{vocabularySeeds:{es:vocabulary,en:[]}});clients.push(db);return db }
afterEach(()=>{vi.restoreAllMocks();clients.forEach(db=>db.close())})
const update:SpanishDailyUpdate={date:'2026-09-27',wordId:'a',entry:{kind:'new',lemmaId:'a',outcome:'forgotten',at:'2026-09-27T10:00:00Z'}}
function session() { return createSpanishSession({all:[vocabulary[0]],newWords:[vocabulary[0]],review:[]},new Date('2026-09-27T10:00:00Z')) }

describe('Spanish atomic persistence',()=>{
  it('rolls back progress, session and completion when the daily write aborts mid-transaction',async()=>{
    const db=client(),active=await db.createActiveSession(session())
    const put=IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){
      if(this.name==='spanishDays') {this.transaction.abort();return {} as IDBRequest}
      return put.apply(this,args)
    })
    const completed={id:'aborted',language:'es' as const,date:update.date,newCount:1,reviewCount:0,correctCount:1,totalCount:1,durationSeconds:1,completed:true}
    await expect(db.commitSpanishStep({...active,revision:1},scheduleSpanishReview(undefined,'a','remembered'),update,completed)).rejects.toBeNull()
    expect((await db.getActiveSession('es'))?.revision).toBe(0)
    expect(await db.getAllProgress('es')).toEqual([])
    expect(await db.getSessions('es')).toEqual([])
    expect((await db.getSpanishDay(update.date)).entries).toEqual({})
  })
  it('counts legacy attempts uniquely in the same CAS transaction and rejects stale repeats',async()=>{
    const db=client()
    const active={...session(),spanish:undefined}
    await db.createActiveSession(active)
    await db.commitStudyStep(undefined,{...active,revision:1},update)
    await db.commitStudyStep(undefined,{...active,revision:2},{...update,entry:{...update.entry,kind:'review',outcome:'remembered'}})
    const day=await db.getSpanishDay(update.date)
    expect(Object.keys(day.entries)).toEqual(['a'])
    expect(day.entries.a.kind).toBe('new')
    await expect(db.commitStudyStep(undefined,{...active,revision:1},{...update,wordId:'other'})).rejects.toBeInstanceOf(StaleStudySessionError)
    expect(Object.keys((await db.getSpanishDay(update.date)).entries)).toEqual(['a'])
    await expect(db.commitStudyStep(undefined,{...active,language:'en',revision:3},update)).rejects.toThrow('Spanish daily entry')
    const completed={id:'legacy-finished',language:'es' as const,date:update.date,newCount:2,reviewCount:0,correctCount:2,totalCount:2,durationSeconds:1,completed:true}
    await db.completeStudyGroup(completed,'es',undefined,{...active,revision:3},[{...update,entry:{...update.entry,outcome:'legacy'}},{...update,wordId:'b'}])
    const reconciled=await db.getSpanishDay(update.date)
    expect(Object.keys(reconciled.entries).sort()).toEqual(['a','b'])
    expect(reconciled.entries.a.outcome).toBe('remembered')
  })
  it('refreshes the legacy seed to the cloze corpus without inheriting fluent status or changing old due dates',async()=>{
    const name=`es-corpus-upgrade-${crypto.randomUUID()}`
    const prior=new PalabraStorage(name,{vocabularySeeds:{es:vocabulary,en:[]},vocabularyRevisions:{es:1}})
    clients.push(prior)
    await prior.getVocabulary('es')
    const hablar=vocabulary.find(word=>word.term==='hablar')!
    const progress=scheduleSpanishReview(undefined,hablar.id,'fluent',new Date('2026-09-26T12:00:00Z'))
    await prior.putProgress(progress);prior.close()
    const upgraded=new PalabraStorage(name);clients.push(upgraded)
    const words=await upgraded.getVocabulary('es')
    expect(words.length).toBeGreaterThan(1000)
    expect(words.find(word=>word.id===hablar.id)?.spanishData?.cloze.reviewed).toBe(true)
    const lemmaId=words.find(word=>word.id===hablar.id)!.spanishData!.lemmaId
    expect(words.filter(word=>word.spanishData?.lemmaId===lemmaId).length).toBeGreaterThanOrEqual(25)
    expect(await upgraded.getAllProgress('es')).toEqual([progress])
  })
  it('upgrades v5 without rewriting any legacy record, including AI and Wordle',async()=>{
    const name=`v5-${crypto.randomUUID()}`
    const stores=['wordProgress','sessions','settings','activeSession','vocabulary','metadata','aiSettings','aiCredentials','aiAnalyses','wordleGame','wordleDictionary']
    const prior=await new Promise<IDBDatabase>((resolve,reject)=>{
      const request=indexedDB.open(name,5)
      request.onupgradeneeded=()=>{for(const store of stores)request.result.createObjectStore(store,{keyPath:store==='wordProgress'?'wordId':store==='aiAnalyses'?'key':store==='wordleDictionary'?'term':'id'}).put({id:'sentinel',wordId:'sentinel',key:'sentinel',term:'sentinel',value:store})}
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)
    });prior.close()
    const db=client(name)
    expect(await db.getSpanishDay('2026-09-27')).toEqual({id:'2026-09-27',entries:{}})
    const upgraded=await new Promise<IDBDatabase>(resolve=>{const request=indexedDB.open(name);request.onsuccess=()=>resolve(request.result)})
    expect(upgraded.version).toBe(8)
    for(const store of stores){const saved=await new Promise(resolve=>{const r=upgraded.transaction(store).objectStore(store).get('sentinel');r.onsuccess=()=>resolve(r.result)})
      expect(saved).toEqual({id:'sentinel',wordId:'sentinel',key:'sentinel',term:'sentinel',value:store})}
    upgraded.close()
  })
  it('persists draft, hint, progress and daily count together, deduplicating repeats',async()=>{
    const db=client();let active=await db.createActiveSession(session())
    active={...active,revision:1,spanish:{...active.spanish!,draft:'ho',hintCount:1}}
    const progress=scheduleSpanishReview(undefined,'a','forgotten',new Date(update.entry.at))
    await db.commitSpanishStep(active,progress,update)
    expect((await db.getSpanishDay(update.date)).entries.a.outcome).toBe('forgotten')
    expect((await db.getActiveSession('es'))?.spanish?.draft).toBe('ho')
    await db.commitSpanishStep({...active,revision:2},undefined,{...update,entry:{...update.entry,kind:'review',outcome:'remembered'}})
    expect(Object.keys((await db.getSpanishDay(update.date)).entries)).toEqual(['a'])
    expect((await db.getSpanishDay(update.date)).entries.a.kind).toBe('new')
    expect((await db.getAllProgress())[0].wordId).toBe('a')
  })
  it('rejects stale tab writes without changing daily counts or progress',async()=>{
    const name=`race-${crypto.randomUUID()}`, a=client(name),b=client(name)
    const active=await a.createActiveSession(session())
    await a.commitSpanishStep({...active,revision:1},undefined,update)
    await expect(b.commitSpanishStep({...active,revision:1},scheduleSpanishReview(undefined,'b','skipped'),{...update,wordId:'b'})).rejects.toBeInstanceOf(StaleStudySessionError)
    expect(Object.keys((await b.getSpanishDay(update.date)).entries)).toEqual(['a'])
    expect(await b.getAllProgress()).toHaveLength(0)
  })
  it('commits the last item, completed session and daily record then removes active atomically',async()=>{
    const db=client(), active=await db.createActiveSession(session())
    const completed={id:'finished',language:'es' as const,date:update.date,newCount:1,reviewCount:0,correctCount:1,totalCount:1,durationSeconds:1,completed:true}
    await db.commitSpanishStep({...active,revision:1},scheduleSpanishReview(undefined,'a','remembered'),update,completed)
    expect(await db.getActiveSession()).toBeUndefined()
    expect((await db.getSessions())[0].id).toBe('finished')
    expect((await db.getSpanishDay(update.date)).entries.a).toEqual(update.entry)
    await expect(db.commitSpanishStep({...active,revision:1},undefined,update)).rejects.toBeInstanceOf(StaleStudySessionError)
  })
  it('isolates calendar dates and clears only Spanish learning records',async()=>{
    const db=client(),active=await db.createActiveSession(session())
    await db.commitSpanishStep({...active,revision:1},undefined,update)
    await db.commitSpanishStep({...active,revision:2},undefined,{...update,date:'2026-09-28'})
    expect(Object.keys((await db.getSpanishDay('2026-09-28')).entries)).toEqual(['a'])
    await db.saveSettings({...await db.getSettings(),spanishDailyGoal:30})
    await db.putProgress({...scheduleSpanishReview(undefined,'en:test','remembered'),language:'en'})
    await db.clearLearningData('es')
    expect((await db.getSpanishDay(update.date)).entries).toEqual({})
    expect((await db.getSettings()).spanishDailyGoal).toBe(30)
    expect(await db.getAllProgress('en')).toHaveLength(1)
    expect(await db.getVocabulary('es')).toHaveLength(300)
  })
})
