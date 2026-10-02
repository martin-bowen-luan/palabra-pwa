import { afterEach,describe,it,expect,vi } from 'vitest'
import { PalabraStorage } from '../data/storage'
import { syncGroupOutbox,timed,GroupError,type GroupRemote } from './sync'
import type { GroupBinding,GroupOutboxItem } from './types'
const binding:GroupBinding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:new Date(Date.now()-1000).toISOString(),enabled:true}
const dbs:PalabraStorage[]=[]
afterEach(()=>{dbs.splice(0).forEach(db=>db.close());vi.restoreAllMocks();vi.useRealTimers()})
function deferred(){let resolve!:()=>void;const promise=new Promise<void>(r=>resolve=r);return{promise,resolve}}
async function setup(){const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);await db.saveGroupBinding(binding);await db.saveGroupDraft(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}),'练习完成');await db.publishGroupDraft(new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'}));return db}
const remote=(note:GroupRemote['note']):GroupRemote=>({note,summary:async()=>({ok:true,data:{acceptedVersion:1}})})
describe('group outbox synchronization',()=>{
  it('times out transports that ignore abort and cancels requests immediately on exit',async()=>{
    vi.useFakeTimers()
    const blocked=()=>new Promise<void>(()=>{})
    const timeout=expect(timed(blocked,new AbortController().signal)).rejects.toThrow('TIMEOUT')
    await vi.advanceTimersByTimeAsync(15000);await timeout
    const controller=new AbortController(),cancelled=expect(timed(blocked,controller.signal)).rejects.toThrow('已取消')
    controller.abort();await cancelled
  })
  it('honors a long Retry-After by retaining the queue for a later trigger',async()=>{
    const db=await setup();let requests=0
    await expect(syncGroupOutbox(db,remote(async()=>{requests++;throw new GroupError('RATE_LIMITED',true,60000)}),new AbortController().signal)).rejects.toThrow('RATE_LIMITED')
    expect(requests).toBe(1);expect(await db.getGroupOutbox()).toHaveLength(1)
  })
  it('acknowledges only the uploaded version when a newer note is published during flight',async()=>{
    const db=await setup(),[item]=await db.getGroupOutbox(),started=deferred(),release=deferred()
    const run=syncGroupOutbox(db,remote(async()=>{started.resolve();await release.promise;return{ok:true,data:{acceptedVersion:1}}}),new AbortController().signal)
    await started.promise;await db.saveGroupDraft(item.payload.date,'新内容');await db.publishGroupDraft(item.payload.date);release.resolve();await run
    expect((await db.getGroupOutbox())[0]).toMatchObject({version:2,payload:{text:'新内容'}})
  })
  it('allows only one tab to upload under a live lease',async()=>{
    const db=await setup(),started=deferred(),release=deferred();let delivered=0
    const server=remote(async()=>{delivered++;started.resolve();await release.promise;return{ok:true,data:{acceptedVersion:1}}})
    const first=syncGroupOutbox(db,server,new AbortController().signal);await started.promise
    await syncGroupOutbox(db,server,new AbortController().signal);expect(delivered).toBe(1)
    release.resolve();await first;expect(await db.getGroupOutbox()).toEqual([])
  })
  it('has expiring owner-checked leases and invalidates them on membership change',async()=>{
    const db=await setup()
    expect(await db.groups.acquireLease('a',0)).toBe(true)
    expect(await db.groups.acquireLease('b',29999)).toBe(false)
    expect(await db.groups.renewLease('b',10000)).toBe(false)
    expect(await db.groups.renewLease('a',10000)).toBe(true)
    expect(await db.groups.acquireLease('b',30000)).toBe(false)
    expect(await db.groups.acquireLease('b',40000)).toBe(true)
    await db.groups.releaseLease('a');expect(await db.groups.acquireLease('c',40001)).toBe(false)
    await db.saveGroupBinding({...binding,deviceGeneration:2});expect(await db.groups.acquireLease('c',40001)).toBe(true)
  })
  it('stops and discards stale-authority queue instead of retrying it',async()=>{
    const db=await setup();let requests=0
    await expect(syncGroupOutbox(db,remote(async()=>{requests++;return{ok:false,code:'DEVICE_REPLACED'}}),new AbortController().signal)).rejects.toThrow('DEVICE_REPLACED')
    expect(requests).toBe(1);expect(await db.getGroupOutbox()).toEqual([]);expect(await db.getGroupBinding()).toBeUndefined()
  })
  it('does not call the server while offline or already aborted',async()=>{
    const db=await setup();let requests=0
    const server=remote(async()=>{requests++;return{ok:true,data:{acceptedVersion:1}}})
    vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
    await syncGroupOutbox(db,server,new AbortController().signal)
    expect(requests).toBe(0);expect(await db.getGroupOutbox()).toHaveLength(1)
    vi.restoreAllMocks();const controller=new AbortController();controller.abort()
    await syncGroupOutbox(db,server,controller.signal);expect(requests).toBe(0)
  })
  it('retries a lost response at most three times using the exact same payload',async()=>{
    const db=await setup(),arrived=[deferred(),deferred(),deferred()],received:unknown[]=[]
    vi.useFakeTimers({toFake:['setTimeout','clearTimeout','setInterval','clearInterval']})
    const run=syncGroupOutbox(db,remote(async(payload,version)=>{received.push({payload,version});arrived[received.length-1].resolve();throw new Error('network')}),new AbortController().signal)
    const rejected=expect(run).rejects.toThrow()
    await arrived[0].promise;await vi.advanceTimersByTimeAsync(2000)
    await arrived[1].promise;await vi.advanceTimersByTimeAsync(4000)
    await arrived[2].promise;await rejected
    expect(received).toHaveLength(3);expect(received[0]).toEqual(received[2]);expect(await db.getGroupOutbox()).toHaveLength(1)
  })
  it('does not upload expired summaries or old generation items',async()=>{
    const db=await setup(),[item]=await db.getGroupOutbox()
    await db.groups.write('groupOutbox',item.key,{...item,payload:{...item.payload,date:'2000-01-01'}} as GroupOutboxItem)
    let requests=0;await syncGroupOutbox(db,remote(async()=>{requests++;return{ok:true,data:{acceptedVersion:1}}}),new AbortController().signal)
    expect(requests).toBe(0);expect(await db.getGroupOutbox()).toEqual([])
  })
})
