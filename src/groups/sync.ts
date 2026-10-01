import type { PalabraStorage } from '../data/storage'
import type { GroupOutboxItem,RpcResult,SummaryPayload } from './types'
import { isShareableDate } from './projection'
export interface GroupRemote {
  summary(payload:SummaryPayload,signal:AbortSignal):Promise<RpcResult<{acceptedVersion:number}>>
  note(payload:Extract<GroupOutboxItem,{kind:'note'}>['payload'],version:number,signal:AbortSignal):Promise<RpcResult<{acceptedVersion:number}>>
}
export class GroupError extends Error {
  constructor(public code:string,public retryable=false,public retryAfterMs=0){super(code);this.name='GroupError'}
}
export const revokedCodes=new Set(['DEVICE_REPLACED','NOT_REGISTERED','AUTH_REQUIRED','STALE_BINDING','NOT_MEMBER','MEMBERSHIP_REVOKED'])
const abortError=()=>new DOMException('已取消','AbortError')
export function pause(ms:number,signal:AbortSignal):Promise<void>{
  return new Promise((resolve,reject)=>{
    if(signal.aborted){reject(abortError());return}
    const abort=()=>{clearTimeout(timer);reject(abortError())}
    const timer=setTimeout(()=>{signal.removeEventListener('abort',abort);resolve()},ms)
    signal.addEventListener('abort',abort,{once:true})
  })
}
/** Bounds even a transport that never settles after aborting. */
export async function timed<T>(work:(signal:AbortSignal)=>Promise<T>,parent:AbortSignal,ms=15000):Promise<T>{
  const controller=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined,abort:()=>void=()=>{}
  try {
    return await Promise.race([new Promise<T>((_,reject)=>{
      abort=()=>{controller.abort();reject(abortError())}
      if(parent.aborted){abort();return}
      parent.addEventListener('abort',abort,{once:true})
      timer=setTimeout(()=>{controller.abort();reject(new GroupError('TIMEOUT',true))},ms)
    }),Promise.resolve().then(()=>{if(controller.signal.aborted)throw abortError();return work(controller.signal)})])
  }finally{clearTimeout(timer);parent.removeEventListener('abort',abort)}
}
export async function syncGroupOutbox(db:PalabraStorage,remote:GroupRemote,signal:AbortSignal):Promise<void>{
  if(signal.aborted||!navigator.onLine)return
  const owner=crypto.randomUUID()
  if(!await db.groups.acquireLease(owner))return
  const lifetime=new AbortController(),abort=()=>lifetime.abort()
  signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  const renewal=setInterval(()=>{void db.groups.renewLease(owner).then(ok=>{if(!ok)abort()}).catch(abort)},10000)
  try {
    // One snapshot per trigger; newer items are kept for the coalesced next trigger.
    for(const item of await db.getGroupOutbox()) {
      if(lifetime.signal.aborted||!navigator.onLine)return
      if(!isShareableDate(item.payload.date)){
        await db.ackGroupItem(item.key,item.version)
        await db.groups.write('groupState','syncNotice','超过 30 天的待传记录不再共享，本地台账仍保留。');continue
      }
      for(let attempt=0;attempt<3;attempt++) {
        const binding=await db.getGroupBinding()
        if(!binding?.enabled)return
        if(binding.membershipId!==item.payload.membershipId||binding.membershipGeneration!==item.payload.membershipGeneration||binding.deviceGeneration!==item.payload.deviceGeneration){await db.ackGroupItem(item.key,item.version);break}
        try {
          if(!await db.groups.renewLease(owner))return
          const response=await timed(s=>item.kind==='summary'?remote.summary(item.payload,s):remote.note(item.payload,item.version,s),lifetime.signal)
          if(!response.ok)throw new GroupError(response.code,false,response.code==='RATE_LIMITED'?60000:0)
          if(!Number.isSafeInteger(response.data.acceptedVersion)||response.data.acceptedVersion<item.version)throw new GroupError('INVALID_RESPONSE')
          await db.ackGroupItem(item.key,item.version);break
        }catch(error){
          if(lifetime.signal.aborted||(error instanceof DOMException&&error.name==='AbortError'))return
          if(error instanceof GroupError&&revokedCodes.has(error.code)){await db.saveGroupBinding(undefined);await db.groups.write('groupState','syncNotice',error.code);throw error}
          if(error instanceof GroupError&&(!error.retryable||error.retryAfterMs>9000)||attempt===2)throw error
          const delay=Math.max([1000,3000][attempt]+Math.floor(Math.random()*501),error instanceof GroupError?error.retryAfterMs:0)
          await pause(delay,lifetime.signal)
        }
      }
    }
  }catch(error){if(!lifetime.signal.aborted)throw error}
  finally{clearInterval(renewal);signal.removeEventListener('abort',abort);await db.groups.releaseLease(owner)}
}
