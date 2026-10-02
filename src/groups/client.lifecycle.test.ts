import {afterEach,it,expect,vi} from 'vitest'
import {PalabraStorage} from '../data/storage'
import {getGroupClient,groupConfig,releaseGroupClient} from './client'
type Adapter={getItem:(key:string)=>Promise<string|null>;setItem:(key:string,value:string)=>Promise<void>;removeItem:(key:string)=>Promise<void>}
const mock=vi.hoisted(()=>({getSession:vi.fn(),signup:vi.fn(),adapter:undefined as Adapter|undefined,fetcher:undefined as typeof fetch|undefined}))
vi.mock('@supabase/supabase-js',()=>({createClient:(_url:string,_key:string,options:{auth:{storage:Adapter};global?:{fetch:typeof fetch}})=>{mock.adapter=options.auth.storage;mock.fetcher=options.global?.fetch;return{auth:{getSession:mock.getSession,signInAnonymously:mock.signup,stopAutoRefresh:async()=>{}}}}}))
let db:PalabraStorage|undefined
const previous={...groupConfig}
afterEach(()=>{if(db){releaseGroupClient(db);db.close()}Object.assign(groupConfig,previous);vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals()})
async function setup(){db=new PalabraStorage(crypto.randomUUID());Object.assign(groupConfig,{enabled:true,url:'https://test.supabase.co',key:'public'});return(await getGroupClient(db))!}
it('rejects late auth writes/removes from an adapter created before logout',async()=>{
  await setup();const old=mock.adapter!
  await old.setItem('session','old');await db!.groups.logout();await old.setItem('session','late')
  expect(await db!.readAuthItem('session')).toBeNull()
  await db!.writeAuthItem('session','new');await old.removeItem('session')
  expect(await db!.readAuthItem('session')).toBe('new')
  expect(await old.getItem('session')).toBeNull()
})
it('classifies expired-session refresh transport failures as retryable, not revocation',async()=>{
  const client=await setup();mock.getSession.mockResolvedValue({data:{session:null},error:{name:'AuthRetryableFetchError',status:503}})
  await expect(client.uid()).rejects.toMatchObject({code:'SERVER_UNAVAILABLE',retryable:true})
  await expect(client.rpc('self')).rejects.toMatchObject({code:'SERVER_UNAVAILABLE',retryable:true})
})
it('bounds stalled signup and standalone session reads',async()=>{
  const client=await setup();vi.useFakeTimers()
  mock.getSession.mockResolvedValue({data:{session:null},error:null});mock.signup.mockReturnValue(new Promise(()=>{}))
  const signup=expect(client.authenticate()).rejects.toMatchObject({code:'TIMEOUT'})
  await vi.advanceTimersByTimeAsync(15001);await signup
  mock.getSession.mockReturnValue(new Promise(()=>{}))
  const uid=expect(client.uid()).rejects.toMatchObject({code:'TIMEOUT'})
  await vi.advanceTimersByTimeAsync(15001);await uid
})
it('aborts the actual Auth transport on deadline rather than only releasing the UI',async()=>{
  await setup();expect(mock.fetcher).toBeTypeOf('function');vi.useFakeTimers()
  let signal:AbortSignal|undefined
  vi.stubGlobal('fetch',vi.fn((_input:RequestInfo|URL,init?:RequestInit)=>{signal=init?.signal??undefined;return new Promise(()=>{})}))
  const result=expect(mock.fetcher!('https://test.supabase.co/auth/v1/signup')).rejects.toMatchObject({code:'TIMEOUT'})
  await vi.advanceTimersByTimeAsync(15001);await result;expect(signal?.aborted).toBe(true)
})
