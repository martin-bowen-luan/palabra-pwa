import { afterEach,describe,it,expect,vi } from 'vitest'
import { PalabraStorage,StaleStudySessionError,DEFAULT_SETTINGS } from '../data/storage'
import type { ActiveSession,WordProgress } from '../types'
import type { GroupBinding,CheckinEvent } from './types'
const binding:GroupBinding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:'2026-10-01T00:00:00Z',enabled:true}
const event:CheckinEvent={wordId:'en:apple',language:'en',kind:'new',outcome:'passed',at:'2026-10-01T01:00:00Z',goal:10}
const session:ActiveSession={id:'active-session:en',language:'en',phase:'quiz',wordIds:['en:apple','en:pear'],newWordIds:['en:apple','en:pear'],reviewWordIds:[],currentIndex:0,correctCount:0,answeredCount:0,startedAt:'2026-10-01T00:00:00Z',revision:0}
const progress:WordProgress={wordId:'en:apple',language:'en',stage:1,status:'learning',reviewCount:1,correctCount:1,nextReviewAt:'2026-10-02T00:00:00Z',lastReviewedAt:event.at}
const instances:PalabraStorage[]=[]
function storage(name=crypto.randomUUID()){const db=new PalabraStorage(name);instances.push(db);return db}
afterEach(()=>{instances.splice(0).forEach(db=>db.close());vi.restoreAllMocks()})
describe('atomic group ledger',()=>{
  it('persists separate Beijing days through close and reopen',async()=>{
    const db=storage();await db.saveGroupBinding(binding);await db.createActiveSession(session)
    await db.commitStudyStep(progress,{...session,revision:1},undefined,{...event,at:'2026-10-01T15:59:59Z'})
    await db.commitStudyStep(progress,{...session,revision:2},undefined,{...event,at:'2026-10-01T16:00:00Z'})
    db.close();expect((await db.getGroupOutbox()).map(item=>item.payload.date).sort()).toEqual(['2026-10-01','2026-10-02'])
  })
  it('does not track when not joined, but saves learning normally',async()=>{
    const db=storage();await db.createActiveSession(session)
    await db.commitStudyStep(progress,{...session,revision:1},undefined,event)
    expect(await db.getGroupOutbox()).toEqual([])
    expect((await db.getAllProgress('en'))[0].wordId).toBe('en:apple')
  })
  it('commits a half-group immediately and deduplicates across wordbooks',async()=>{
    const db=storage();await db.saveGroupBinding(binding);await db.createActiveSession(session)
    await db.commitStudyStep(progress,{...session,revision:1,sourceWordbook:'en-highschool'},undefined,{...event,outcome:'skipped'})
    expect((await db.getGroupOutbox())[0].payload).toMatchObject({newCount:1,skippedCount:1})
    await db.commitStudyStep(progress,{...session,revision:2,sourceWordbook:'en-oxford-primary'},undefined,{...event,at:'2026-10-01T02:00:00Z',kind:'review',goal:20})
    const [item]=await db.getGroupOutbox();expect(item.payload).toMatchObject({newCount:1,reviewCount:0,skippedCount:0,goal:10})
    expect(JSON.stringify(item)).not.toContain('en:apple')
    await db.ackGroupItem(item.key,1);expect(await db.getGroupOutbox()).toHaveLength(1)
    await db.ackGroupItem(item.key,2);expect(await db.getGroupOutbox()).toHaveLength(0)
  })
  it('stale tabs and quota failures roll back both learning and check-ins',async()=>{
    const db=storage();await db.saveGroupBinding(binding);await db.createActiveSession(session)
    await expect(db.commitStudyStep(progress,{...session,revision:2},undefined,event)).rejects.toBeInstanceOf(StaleStudySessionError)
    expect(await db.getGroupOutbox()).toEqual([])
    const put=IDBObjectStore.prototype.put
    vi.spyOn(IDBObjectStore.prototype,'put').mockImplementation(function(this:IDBObjectStore,...args:Parameters<typeof put>){
      if(this.name==='groupOutbox')throw new DOMException('Quota full','QuotaExceededError')
      return put.apply(this,args)
    })
    await expect(db.commitStudyStep(progress,{...session,revision:1},undefined,event)).rejects.toBeNull()
    expect(await db.getAllProgress('en')).toEqual([])
    expect((await db.getActiveSession('en'))?.revision).toBe(0)
    expect(await db.getGroupOutbox()).toEqual([])
  })
  it('preserves group records when clearing learning; changing identity drops old queue and cache',async()=>{
    const db=storage();await db.saveGroupBinding(binding);await db.createActiveSession(session)
    await db.commitStudyStep(progress,{...session,revision:1},undefined,event)
    await db.clearLearningData('en');expect(await db.getGroupOutbox()).toHaveLength(1)
    expect(await db.getGroupBinding()).toEqual(binding)
    await db.saveGroupBinding({...binding,membershipId:'other',membershipGeneration:2})
    expect(await db.getGroupOutbox()).toEqual([])
  })
  it('keeps drafts private until published and versions empty deletions',async()=>{
    const db=storage();await db.saveGroupBinding(binding)
    await db.saveGroupDraft('2026-10-01','今天坚持了🙂');expect(await db.getGroupOutbox()).toEqual([])
    await db.publishGroupDraft('2026-10-01');expect((await db.getGroupOutbox())[0]).toMatchObject({kind:'note',version:1,payload:{text:'今天坚持了🙂'}})
    await db.saveGroupDraft('2026-10-01','');await db.publishGroupDraft('2026-10-01')
    expect((await db.getGroupOutbox())[0]).toMatchObject({version:2,payload:{text:''}})
    await expect(db.saveGroupDraft('2026-10-01','🙂'.repeat(101))).rejects.toThrow()
  })
  it('uses one persistent auth store and clears it without deleting learning',async()=>{
    const db=storage();await db.writeAuthItem('token','test-session')
    db.close();expect(await db.readAuthItem('token')).toBe('test-session')
    await db.removeAuthItem('token');expect(await db.readAuthItem('token')).toBeNull()
  })
  it('upgrades real v7 stores byte-for-byte without resetting books or learning',async()=>{
    const name=crypto.randomUUID()
    const records:Record<string,{keyPath:string;value:Record<string,unknown>}>= {
      wordbooks:{keyPath:'id',value:{id:'en-oxford-primary',members:[{wordId:'en:apple'}],revision:1}},
      wordProgress:{keyPath:'wordId',value:{...progress}},activeSession:{keyPath:'id',value:{...session}},
      settings:{keyPath:'id',value:{...DEFAULT_SETTINGS,englishWordbook:'en-oxford-primary'}},
      aiSettings:{keyPath:'id',value:{id:'ai',enabled:true,model:'model'}},
      aiCredentials:{keyPath:'id',value:{id:'ai',ciphertext:'preserve-ciphertext'}},
      wordleGame:{keyPath:'id',value:{id:'wordle',guesses:['apple']}},
      spanishDays:{keyPath:'id',value:{id:'2026-10-01',entries:{hola:{outcome:'remembered'}}}},
      sessions:{keyPath:'id',value:{id:'history',language:'es',newCount:5}},
    }
    const old=await new Promise<IDBDatabase>((resolve,reject)=>{const r=indexedDB.open(name,7);r.onupgradeneeded=()=>{for(const [store,{keyPath,value}]of Object.entries(records))r.result.createObjectStore(store,{keyPath}).put(value)};r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})
    old.close();const db=storage(name);expect(await db.getGroupBinding()).toBeUndefined();db.close()
    const upgraded=await new Promise<IDBDatabase>((resolve)=>{const r=indexedDB.open(name);r.onsuccess=()=>resolve(r.result)})
    expect(upgraded.version).toBe(8)
    for(const [store,{keyPath,value}]of Object.entries(records)){
      const actual=await new Promise(resolve=>{const r=upgraded.transaction(store).objectStore(store).get(value[keyPath] as string);r.onsuccess=()=>resolve(r.result)})
      expect(actual).toEqual(value)
    }
    upgraded.close()
  })
})
