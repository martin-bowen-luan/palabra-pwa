import { afterEach,it,expect,vi } from 'vitest'
import { act,cleanup,render,waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { GroupsProvider,useGroups } from './GroupsProvider'
import { PalabraStorage } from '../data/storage'
import type { GroupService } from './client'
import type { RpcResult } from './types'
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
