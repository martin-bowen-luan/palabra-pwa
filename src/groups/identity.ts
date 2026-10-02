import type { PalabraStorage } from '../data/storage'
import type { GroupService } from './client'
import type { GroupProfile,RpcResult } from './types'
import { hashSecret,makeSecret } from './secrets'
import { GroupError } from './sync'
export interface PendingIdentity {
  action:'register'|'recover'|'rotate';uid:string;operationId:string;nextSecret:string;nextHash:string;
  nickname?:string;previousHash?:string;paramsDigest:string;result?:GroupProfile|{deviceGeneration:number}
}
const normalized=(code:string)=>code.replace(/\s/g,'').toLowerCase()
export class IdentityService {
  constructor(private db:PalabraStorage,private remote:GroupService){}
  pending(){return this.db.groups.read<PendingIdentity>('groupState','pendingIdentity')}
  async start(action:PendingIdentity['action'],input:{nickname?:string;code?:string}={}):Promise<PendingIdentity>{
    if(await this.pending())throw new GroupError('PENDING_IDENTITY')
    const epoch=await this.db.groups.read<string>('groupState','identityEpoch')
    const uid=await this.remote.uid();if(!uid)throw new GroupError('AUTH_REQUIRED')
    if(action==='register'&&(!input.nickname||Array.from(input.nickname.trim()).length>20))throw new GroupError('INVALID_INPUT')
    if(action==='recover'){
      const own=await this.remote.rpc<GroupProfile>('self')
      if(own.ok)throw new GroupError('ALREADY_REGISTERED')
      if(own.code!=='NOT_REGISTERED')throw new GroupError(own.code)
    }
    const nextSecret=makeSecret(32),nextHash=await hashSecret(nextSecret)
    const previousHash=action==='recover'?await hashSecret(input.code??''):undefined
    const nickname=input.nickname?.trim()
    const params=JSON.stringify([action,nickname??null,previousHash??null,nextHash])
    const paramsDigest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(params))),b=>b.toString(16).padStart(2,'0')).join('')
    const pending:PendingIdentity={action,uid,operationId:crypto.randomUUID(),nextSecret,nextHash,nickname,previousHash,paramsDigest}
    if(!await this.db.groups.reserveIdentity(pending,epoch))throw new GroupError(await this.db.groups.read('groupState','identityEpoch')!==epoch?'IDENTITY_CHANGED':'PENDING_IDENTITY')
    return this.send(pending,input.code)
  }
  async resume(code?:string):Promise<PendingIdentity>{
    const pending=await this.pending();if(!pending)throw new GroupError('PENDING_IDENTITY')
    await this.checkUid(pending)
    if(pending.result)return pending
    const response=await this.remote.rpc<NonNullable<PendingIdentity['result']>>('operation',{p_operation_id:pending.operationId})
    if(response.ok)return this.saveResult(pending,response)
    if(response.code!=='NOT_FOUND')throw new GroupError(response.code)
    return this.send(pending,code)
  }
  private async checkUid(pending:PendingIdentity){if(await this.remote.uid()!==pending.uid)throw new GroupError('IDENTITY_CHANGED')}
  private async send(pending:PendingIdentity,code?:string){
    await this.checkUid(pending)
    if(pending.action==='recover'&&(!code||await hashSecret(code)!==pending.previousHash))throw new GroupError('RECOVERY_CODE_REQUIRED')
    const response=await this.remote.rpc<NonNullable<PendingIdentity['result']>>(pending.action==='rotate'?'rotate_recovery':pending.action,{
      p_operation_id:pending.operationId,
      ...(pending.action==='register'?{p_nickname:pending.nickname,p_recovery_hash:pending.nextHash}:{p_next_hash:pending.nextHash}),
      ...(pending.action==='recover'?{p_code:normalized(code!)}:{}),
    })
    return this.saveResult(pending,response)
  }
  private async saveResult(pending:PendingIdentity,response:RpcResult<NonNullable<PendingIdentity['result']>>){
    await this.checkUid(pending)
    if(!response.ok){
      // A confirmed business rejection made no identity change. Ambiguous transport
      // failures never arrive here and keep the recovery secret + operation receipt key.
      await this.db.groups.updateIdentity(pending.operationId)
      throw new GroupError(response.code)
    }
    const completed={...pending,result:response.data}
    if(!await this.db.groups.updateIdentity(pending.operationId,completed))throw new GroupError('IDENTITY_CHANGED')
    return completed
  }
  async confirmSaved(){
    const pending=await this.pending()
    if(!pending?.result)throw new GroupError('PENDING_IDENTITY')
    await this.checkUid(pending)
    if(!await this.db.groups.updateIdentity(pending.operationId))throw new GroupError('IDENTITY_CHANGED')
  }
}
