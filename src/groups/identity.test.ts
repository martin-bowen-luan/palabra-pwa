import { afterEach,describe,it,expect,vi } from 'vitest'
import { PalabraStorage } from '../data/storage'
import { IdentityService } from './identity'
import type { GroupService } from './client'
import type { RpcResult } from './types'
const cryptoModule='node:crypto'
const {webcrypto}=await import(/* @vite-ignore */ cryptoModule) as {webcrypto:Crypto}
const dbs:PalabraStorage[]=[]
afterEach(()=>{dbs.splice(0).forEach(db=>db.close());vi.unstubAllGlobals()})
function setup(){
  vi.stubGlobal('crypto',webcrypto)
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db)
  const receipts=new Map<string,RpcResult<unknown>>(),submitted:Record<string,unknown>[]=[]
  let loseResponse=true,uid='device',registered=false
  const service:GroupService={uid:async()=>uid,authenticate:async()=>uid,stop:()=>{},summary:async()=>({ok:true,data:{acceptedVersion:1}}),note:async()=>({ok:true,data:{acceptedVersion:1}}),
    rpc:async<T>(name:string,args:Record<string,unknown>={})=>{
      if(name==='self')return(registered?{ok:true,data:{profileId:'p',nickname:'朋友',deviceGeneration:1,binding:null}}:{ok:false,code:'NOT_REGISTERED'}) as RpcResult<T>
      if(name==='operation')return (receipts.get(args.p_operation_id as string)??{ok:false,code:'NOT_FOUND'}) as RpcResult<T>
      submitted.push(args);registered=true
      const response={ok:true,data:{profileId:'p',nickname:'朋友',deviceGeneration:1,binding:null,receiveNudges:true}} as const
      receipts.set(args.p_operation_id as string,response)
      if(loseResponse){loseResponse=false;throw new Error('response lost')}
      return response as RpcResult<T>
    },
  }
  return {db,service,submitted,changeUid:()=>uid='other'}
}
describe('durable identity operations',()=>{
  it('does not resurrect pending credentials if logout occurs while identity setup is waiting',async()=>{
    const {db,service}=setup();let release!:()=>void,entered!:()=>void
    const started=new Promise<void>(resolve=>entered=resolve)
    const waiting=new Promise<void>(resolve=>release=resolve)
    service.uid=async()=>{entered();await waiting;return 'device'}
    const identity=new IdentityService(db,service),run=identity.start('register',{nickname:'朋友'})
    const rejected=expect(run).rejects.toThrow('IDENTITY_CHANGED')
    await started;await db.groups.logout();release()
    await rejected;expect(await identity.pending()).toBeUndefined()
  })
  it('recovers a lost response by operation ID without consuming the recovery code again',async()=>{
    const {db,service,submitted}=setup(),identity=new IdentityService(db,service)
    const oldCode='a'.repeat(64)
    await expect(identity.start('recover',{code:oldCode})).rejects.toThrow('response lost')
    const pending=await identity.pending();expect(pending?.nextSecret).toHaveLength(64)
    expect(JSON.stringify(pending)).not.toContain(oldCode)
    db.close();const resumed=new IdentityService(db,service)
    const success=await resumed.resume()
    expect(success?.result).toMatchObject({profileId:'p'})
    expect(submitted).toHaveLength(1)
    expect((await resumed.pending())?.nextSecret).toBe(pending?.nextSecret)
    await resumed.confirmSaved();expect(await resumed.pending()).toBeUndefined()
  })
  it('does not replace an unfinished code or transfer it to a different UID',async()=>{
    const {db,service,changeUid}=setup(),identity=new IdentityService(db,service)
    await expect(identity.start('register',{nickname:'朋友'})).rejects.toThrow()
    await expect(identity.start('register',{nickname:'新名字'})).rejects.toThrow('PENDING_IDENTITY')
    changeUid();await expect(identity.resume()).rejects.toThrow('IDENTITY_CHANGED')
  })
  it('cannot confirm an operation whose success is not established',async()=>{
    const {db,service}=setup(),identity=new IdentityService(db,service)
    await expect(identity.start('register',{nickname:'朋友'})).rejects.toThrow()
    await expect(identity.confirmSaved()).rejects.toThrow('PENDING_IDENTITY')
    expect(await identity.pending()).toBeDefined()
  })
})
