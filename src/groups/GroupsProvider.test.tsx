import { afterEach,it,expect,vi } from 'vitest'
import { act,cleanup,render,waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupsProvider,useGroups } from './GroupsProvider'
import { PalabraStorage } from '../data/storage'
import type { GroupService,RpcName } from './client'
import type { RpcResult } from './types'
import { GroupError } from './sync'
let groups:ReturnType<typeof useGroups>
function Probe(){groups=useGroups();return <span>学习照常</span>}
const dbs:PalabraStorage[]=[]
afterEach(()=>{cleanup();dbs.splice(0).forEach(db=>db.close());vi.restoreAllMocks()})
const service=(rpc:GroupService['rpc']):GroupService=>({uid:async()=>'uid',authenticate:async()=>'uid',rpc,summary:async()=>({ok:true,data:{acceptedVersion:1}}),note:async()=>({ok:true,data:{acceptedVersion:1}}),stop:()=>{}})
it('does not contact authentication or remote data before sharing consent',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);let requests=0
  const remote=service(async<T,>()=>{requests++;return{ok:false,code:'NOT_REGISTERED'} as RpcResult<T>})
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.ready).toBe(true));expect(requests).toBe(0);expect(groups.profile).toBeUndefined()
})
it('keeps cloud errors out of the study loading state and hides revoked cached membership',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db)
  await db.groups.write('groupState','consent',true)
  await db.saveGroupBinding({profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:new Date().toISOString(),enabled:true})
  await db.groups.write('groupCache','snapshot',{profile:{profileId:'p',nickname:'旧名字',binding:null},cachedAt:new Date().toISOString()})
  const remote=service(async<T,>()=>({ok:false,code:'DEVICE_REPLACED'} as RpcResult<T>))
  const view=render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.error).toContain('另一台设备'))
  expect(view.getByText('学习照常')).toBeInTheDocument();expect(groups.profile).toBeUndefined();expect(await db.getGroupBinding()).toBeUndefined()
})
it('disabled sharing persists and does not make remote calls',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);let requests=0
  await db.groups.write('groupState','consent',true);await db.groups.write('groupState','enabled',false)
  const remote=service(async<T,>()=>{requests++;return{ok:false,code:'NOT_REGISTERED'} as RpcResult<T>})
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.ready).toBe(true));await act(()=>groups.refresh());expect(requests).toBe(0)
})
it('does not restore old cached identity after another tab logs out during a request',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);await db.groups.write('groupState','consent',true)
  let release!:()=>void,started!:()=>void
  const waiting=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve)
  const remote=service(async<T,>()=>{started();await waiting;return{ok:true,data:{profileId:'old',nickname:'旧身份',deviceGeneration:1,receiveNudges:true,binding:null}} as RpcResult<T>})
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await entered;await act(()=>db.groups.logout());release()
  await act(()=>groups.refresh())
  expect(groups.profile).toBeUndefined();expect(await db.groups.read('groupCache','snapshot')).toBeUndefined()
})
it('discards a rejected invite operation so a corrected group name can be submitted',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db)
  const remote=service(async<T,>(name:RpcName)=>({ok:false,code:name==='operation'?'NOT_FOUND':name==='create_group'?'INVALID_INPUT':'NOT_REGISTERED'} as RpcResult<T>))
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.ready).toBe(true))
  await act(()=>groups.inviteGroup('create','坏'))
  expect(await db.groups.read('groupState','inviteOperation')).toBeUndefined()
})
it('does not recreate an invite secret after cross-tab logout while its request is in flight',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db)
  let release!:()=>void,started!:()=>void
  const waiting=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve)
  const remote=service(async<T,>(name:RpcName)=>{
    if(name==='operation')return{ok:false,code:'NOT_FOUND'} as RpcResult<T>
    if(name==='create_group'){started();await waiting;return{ok:true,data:{}} as RpcResult<T>}
    return{ok:false,code:'NOT_REGISTERED'} as RpcResult<T>
  })
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.ready).toBe(true))
  let action!:Promise<boolean>;act(()=>{action=groups.inviteGroup('create','测试组')})
  await entered;await db.groups.logout();release();await act(()=>action)
  expect(await db.groups.read('groupState','inviteOperation')).toBeUndefined()
})
it('does not re-enable a binding or upload after sharing is disabled in another tab',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);await db.groups.write('groupState','consent',true)
  const binding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:'2026-10-01T00:00:00Z',enabled:true}
  await db.saveGroupBinding(binding);await db.saveGroupDraft('2026-10-01','待传');await db.publishGroupDraft('2026-10-01')
  let release!:()=>void,started!:()=>void,uploads=0
  const waiting=new Promise<void>(resolve=>release=resolve),entered=new Promise<void>(resolve=>started=resolve)
  const remote=service(async<T,>()=>{started();await waiting;return{ok:true,data:{profileId:'p',nickname:'我',binding}} as RpcResult<T>})
  remote.note=async()=>{uploads++;return{ok:true,data:{acceptedVersion:1}}}
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await entered
  await db.groups.write('groupState','enabled',false);await db.saveGroupBinding({...binding,enabled:false})
  release();await act(()=>groups.refresh())
  expect((await db.getGroupBinding())?.enabled).toBe(false);expect(uploads).toBe(0);expect(await db.getGroupOutbox()).toHaveLength(1)
})
it('preserves queued work on temporary authentication failures',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);await db.groups.write('groupState','consent',true)
  await db.saveGroupBinding({profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:'2026-10-01T00:00:00Z',enabled:true})
  await db.saveGroupDraft('2026-10-01','待传');await db.publishGroupDraft('2026-10-01')
  const remote=service(async()=>{throw new GroupError('AUTH_REQUIRED')})
  render(<MemoryRouter><GroupsProvider storageClient={db} remote={remote}><Probe/></GroupsProvider></MemoryRouter>)
  await waitFor(()=>expect(groups.error).not.toBe(''))
  expect(await db.getGroupOutbox()).toHaveLength(1);expect(await db.groups.read('groupDrafts','2026-10-01')).toBe('待传')
})
