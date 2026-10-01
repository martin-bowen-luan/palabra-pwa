import type { SupabaseClient } from '@supabase/supabase-js'
import type { PalabraStorage } from '../data/storage'
import type { RpcResult } from './types'
import { GroupError,timed,type GroupRemote } from './sync'
export interface GroupConfig {enabled:boolean;url:string;key:string}
export function validateGroupConfig(config:GroupConfig,dev=false):{url:string;key:string}|undefined{
  if(!config.enabled)return undefined
  const url=new URL(config.url)
  if(!config.key||url.username||url.password||url.search||url.hash||url.pathname!=='/'||
    (url.protocol!=='https:'&&!(dev&&url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname))))throw new GroupError('INVALID_CONFIG')
  return{url:url.origin,key:config.key}
}
export function decodeRpc<T>(value:unknown):RpcResult<T>{
  if(!value||typeof value!=='object')throw new GroupError('INVALID_RESPONSE')
  const record=value as Record<string,unknown>
  if(record.ok===true&&'data'in record)return{ok:true,data:record.data as T}
  if(record.ok===false&&typeof record.code==='string'&&/^[A-Z_]{1,60}$/.test(record.code))return{ok:false,code:record.code}
  throw new GroupError('INVALID_RESPONSE')
}
export type RpcName='register'|'recover'|'rotate_recovery'|'operation'|'self'|'update_profile'|'create_group'|'preview_invite'|'join_group'|'group'|'manage_group'|'sync_summary'|'publish_note'|'activity'|'send_nudge'|'read_nudge'|'delete_profile'
export interface GroupService extends GroupRemote {
  uid():Promise<string|undefined>
  authenticate(captchaToken?:string):Promise<string>
  rpc<T>(name:RpcName,params?:Record<string,unknown>,signal?:AbortSignal):Promise<RpcResult<T>>
  stop():void
}
class SupabaseGroups implements GroupService {
  constructor(private sdk:SupabaseClient,private config:{url:string;key:string}){}
  async uid(){const {data,error}=await this.sdk.auth.getSession();if(error)throw new GroupError('AUTH_REQUIRED');return data.session?.user.id}
  async authenticate(captchaToken?:string){
    const uid=await this.uid();if(uid)return uid
    const {data,error}=await this.sdk.auth.signInAnonymously({options:{captchaToken}})
    if(error||!data.user)throw new GroupError(error?.code==='captcha_failed'?'CAPTCHA_FAILED':'AUTH_FAILED')
    return data.user.id
  }
  async rpc<T>(name:RpcName,params:Record<string,unknown>={},signal=new AbortController().signal):Promise<RpcResult<T>>{
    return timed(async requestSignal=>{
      const {data,error}=await this.sdk.auth.getSession()
      if(error||!data.session)throw new GroupError('AUTH_REQUIRED')
      const response=await fetch(`${this.config.url}/rest/v1/palabra_${name}`,{
        method:'POST',headers:{apikey:this.config.key,Authorization:`Bearer ${data.session.access_token}`,'Content-Type':'application/json'},
        body:JSON.stringify(params),signal:requestSignal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',
      })
      if(response.status===401||response.status===403)throw new GroupError('AUTH_REQUIRED')
      if(response.status===429||response.status>=500){
        const retry=response.headers.get('Retry-After'),seconds=retry?Number(retry):NaN
        const delay=retry?(Number.isFinite(seconds)?seconds*1000:Date.parse(retry)-Date.now()):0
        throw new GroupError(response.status===429?'RATE_LIMITED':'SERVER_UNAVAILABLE',true,Number.isFinite(delay)?Math.max(0,delay):0)
      }
      if(!response.ok)throw new GroupError('REQUEST_REJECTED')
      let value:unknown;try{value=await response.json()}catch{throw new GroupError('INVALID_RESPONSE')}
      return decodeRpc<T>(value)
    },signal)
  }
  summary:GroupRemote['summary']=(payload,signal)=>this.rpc('sync_summary',{p_payload:payload},signal)
  note:GroupRemote['note']=(payload,version,signal)=>this.rpc('publish_note',{
    p_membership_id:payload.membershipId,p_membership_generation:payload.membershipGeneration,p_device_generation:payload.deviceGeneration,
    p_date:payload.date,p_version:version,p_text:payload.text,
  },signal)
  stop(){this.sdk.auth.stopAutoRefresh()}
}
const instances=new WeakMap<PalabraStorage,Promise<GroupService|undefined>>()
export const groupConfig:GroupConfig={enabled:import.meta.env.VITE_GROUPS_ENABLED==='true',url:import.meta.env.VITE_SUPABASE_URL??'',key:import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY??''}
export function getGroupClient(db:PalabraStorage):Promise<GroupService|undefined>{
  const existing=instances.get(db);if(existing)return existing
  const pending=(async()=>{
    const config=validateGroupConfig(groupConfig,import.meta.env.DEV);if(!config)return undefined
    const {createClient}=await import('@supabase/supabase-js')
    const sdk=createClient(config.url,config.key,{auth:{persistSession:true,detectSessionInUrl:false,autoRefreshToken:true,
      storageKey:`palabra-group-auth:${new URL(config.url).host}`,
      storage:{getItem:key=>db.readAuthItem(key),setItem:(key,value)=>db.writeAuthItem(key,value),removeItem:key=>db.removeAuthItem(key)},
    }})
    return new SupabaseGroups(sdk,config)
  })()
  instances.set(db,pending);void pending.catch(()=>instances.delete(db));return pending
}
export function releaseGroupClient(db:PalabraStorage){const previous=instances.get(db);instances.delete(db);void previous?.then(client=>client?.stop()).catch(()=>{})}
const messages:Record<string,string>={
  DISABLED:'小组服务暂未开放，本地背词不受影响。',INVALID_CONFIG:'小组服务配置不完整。',AUTH_REQUIRED:'身份验证已失效，请重新打开小组或恢复身份。',
  AUTH_FAILED:'无法建立设备身份，请检查网络及验证码。',CAPTCHA_FAILED:'验证码未通过，请重新验证。',DEVICE_REPLACED:'身份已在另一台设备恢复，本机仍可继续背词。',
  NOT_REGISTERED:'尚未建立小组身份。',NOT_MEMBER:'你目前不在小组中。',STALE_BINDING:'小组资格已变更，旧待传记录不会共享。',
  RATE_LIMITED:'操作较频繁，请稍后再试。',BUSY:'小组服务暂时繁忙，请稍后再试。',INVALID_CODE:'恢复码无效或已使用。',INVITE_INVALID:'邀请码无效、已过期或已撤销。',
  GROUP_FULL:'小组已满 10 人。',ALREADY_MEMBER:'请先离开当前小组。',ALREADY_REGISTERED:'此设备已有身份，请先保存恢复码并退出。',
  OWNER_REQUIRED:'组主需要先转交小组或解散。',FORBIDDEN:'只有组主可以执行此操作。',INVALID_TARGET:'该成员当前不可操作。',
  NUDGES_DISABLED:'对方已关闭轻提醒。',ALREADY_SENT:'今天已发送过这类提醒。',VERSION_CONFLICT:'内容版本冲突，请刷新后重新发布。',
  TIMEOUT:'请求超时，已保存的学习不会丢失。',SERVER_UNAVAILABLE:'服务暂时不可用，请稍后重试。',INVALID_RESPONSE:'服务响应异常，请稍后重试。',
  DATE_OUT_OF_RANGE:'记录已超出可共享日期范围。',PENDING_IDENTITY:'请先完成并保存当前恢复码。',IDENTITY_CHANGED:'身份操作已取消，请重新打开小组。',
}
export function groupErrorText(error:unknown){return error instanceof GroupError?messages[error.code]??'操作未完成，请检查输入后重试。':'连接失败，请检查网络后重试；本地背词不受影响。'}
