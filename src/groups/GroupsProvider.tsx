import { createContext,useContext,useEffect,useRef,useState,type ReactNode } from 'react'
import { useLocation } from 'react-router-dom'
import { storage as defaultStorage,type PalabraStorage } from '../data/storage'
import { getGroupClient,groupConfig,groupErrorText,releaseGroupClient,type GroupService,type RpcName } from './client'
import { IdentityService,type PendingIdentity } from './identity'
import { GROUP_CHANGE } from './local'
import { GroupError,revokedCodes,syncGroupOutbox } from './sync'
import type { GroupActivity,GroupData,GroupProfile } from './types'
import { hashSecret,makeSecret } from './secrets'

interface Snapshot {profile?:GroupProfile;group?:GroupData;activity?:GroupActivity;cachedAt?:string}
interface InviteOperation {secret:string;operationId:string;action:'create'|'rotate';name?:string;hash:string;confirmed?:boolean}
interface GroupsValue extends Snapshot {
  ready:boolean;configured:boolean;enabled:boolean;hasIdentity:boolean;busy:boolean;syncing:boolean;online:boolean;error:string;pending?:PendingIdentity;invite?:InviteOperation;pendingCount:number;notice:string
  refresh:()=>Promise<void>;setEnabled:(enabled:boolean)=>Promise<boolean>
  beginIdentity:(action:'register'|'recover',input:{nickname?:string;code?:string},captchaToken?:string)=>Promise<boolean>
  resumeIdentity:(code?:string)=>Promise<boolean>;confirmIdentity:()=>Promise<boolean>;rotateRecovery:()=>Promise<boolean>
  inviteGroup:(action:'create'|'rotate',name?:string)=>Promise<boolean>;dismissInvite:()=>Promise<boolean>
  call:<T>(name:RpcName,args?:Record<string,unknown>)=>Promise<T>
  perform:(name:RpcName,args?:Record<string,unknown>)=>Promise<boolean>
  draft:(date:string)=>Promise<string>;saveDraft:(date:string,text:string)=>Promise<void>;publish:(date:string)=>Promise<boolean>
  logout:()=>Promise<boolean>;deleteProfile:()=>Promise<boolean>
}
const Context=createContext<GroupsValue|null>(null)
export function GroupsProvider({children,storageClient:db=defaultStorage,remote}: {children:ReactNode;storageClient?:PalabraStorage;remote?:GroupService}){
  const location=useLocation(),configured=Boolean(remote)||groupConfig.enabled
  const [ready,setReady]=useState(false),[enabled,setEnabledState]=useState(true),[snapshot,setSnapshot]=useState<Snapshot>({})
  const [hasIdentity,setHasIdentity]=useState(false)
  const [busy,setBusy]=useState(false),[syncing,setSyncing]=useState(false),[error,setError]=useState(''),[online,setOnline]=useState(navigator.onLine)
  const [pending,setPending]=useState<PendingIdentity>(),[invite,setInvite]=useState<InviteOperation>(),[pendingCount,setPendingCount]=useState(0),[notice,setNotice]=useState('')
  const mounted=useRef(true),actionBusy=useRef(false),epoch=useRef(0),flight=useRef<Promise<void>|undefined>(undefined),queued=useRef(false)
  const refreshController=useRef<AbortController|undefined>(undefined),actionController=useRef(new AbortController())
  const current=useRef({configured,enabled});current.current={configured,enabled}
  const client=async()=>{const value=remote??await getGroupClient(db);if(!value)throw new GroupError('DISABLED');return value}
  async function local(){
    const [sharing,consent,cached,pendingValue,inviteValue,queue,noticeValue]=await Promise.all([
      db.groups.read<boolean>('groupState','enabled'),db.groups.read<boolean>('groupState','consent'),db.groups.read<Snapshot>('groupCache','snapshot'),
      db.groups.read<PendingIdentity>('groupState','pendingIdentity'),db.groups.read<InviteOperation>('groupState','inviteOperation'),db.getGroupOutbox(),db.groups.read<string>('groupState','syncNotice'),
    ])
    if(!mounted.current)return
    setHasIdentity(Boolean(consent||pendingValue))
    current.current.enabled=sharing!==false;setEnabledState(sharing!==false);setPending(pendingValue);setInvite(inviteValue);setPendingCount(queue.length);setNotice(noticeValue??'')
    if(consent&&sharing!==false&&configured&&cached)setSnapshot(cached)
    else if(!consent||sharing===false||!configured)setSnapshot({})
  }
  async function refresh():Promise<void>{
    if(flight.current){queued.current=true;return flight.current}
    const version=epoch.current
    flight.current=(async()=>{
      do {
        queued.current=false
        await local()
        if(!mounted.current||version!==epoch.current||!current.current.configured||!current.current.enabled||!navigator.onLine||document.visibilityState==='hidden')return
        if(!await db.groups.read('groupState','consent'))return
        const guard=await db.groups.guard()
        const controller=new AbortController();refreshController.current=controller
        setSyncing(true);setError('')
        try{
          const service=await client()
          if(!await service.uid())return
          const response=await service.rpc<GroupProfile>('self',{},controller.signal)
          if(version!==epoch.current||controller.signal.aborted)return
          if(!response.ok){if(response.code==='NOT_REGISTERED'){if(await db.saveGroupBinding(undefined,guard))setSnapshot({});return}throw new GroupError(response.code)}
          const identity=response.data,waiting=await db.groups.read<PendingIdentity>('groupState','pendingIdentity')
          if(!await db.saveGroupBinding(identity.binding?{...identity.binding,enabled:!waiting}:undefined,guard))return
          let group:GroupData|undefined,activity:GroupActivity|undefined
          if(identity.binding&&!waiting){
            await syncGroupOutbox(db,service,controller.signal)
            const [g,a]=await Promise.all([service.rpc<GroupData>('group',{},controller.signal),service.rpc<GroupActivity>('activity',{p_from_date:null},controller.signal)])
            if(!g.ok)throw new GroupError(g.code);if(!a.ok)throw new GroupError(a.code);group=g.data;activity=a.data
          }
          if(version!==epoch.current||controller.signal.aborted||!mounted.current)return
          const next:Snapshot={profile:identity,group,activity,cachedAt:new Date().toISOString()}
          if(!await db.groups.cacheSnapshot(next,guard.epoch,guard.sharingEpoch))return
          setSnapshot(next);await local()
        }catch(cause){
          if(controller.signal.aborted||version!==epoch.current||!mounted.current)return
          if(cause instanceof GroupError&&(revokedCodes.has(cause.code)||cause.code==='DISABLED')){if(await db.saveGroupBinding(undefined,guard))setSnapshot({})}
          setError(groupErrorText(cause))
        }finally{if(mounted.current)setSyncing(false)}
      }while(queued.current&&version===epoch.current)
    })().catch(cause=>{if(mounted.current)setError(groupErrorText(cause))}).finally(()=>{flight.current=undefined})
    return flight.current
  }
  const refreshRef=useRef(refresh);refreshRef.current=refresh
  useEffect(()=>{
    mounted.current=true
    const channel=typeof BroadcastChannel==='undefined'?undefined:new BroadcastChannel(`${db.aiChannelName}:groups`)
    let observed:Awaited<ReturnType<typeof db.groups.guard>>|undefined
    const invalidate=async()=>{
      const latest=await db.groups.guard()
      if(observed&&(observed.epoch!==latest.epoch||observed.sharingEpoch!==latest.sharingEpoch)){
        refreshController.current?.abort()
        if(observed.epoch!==latest.epoch){epoch.current++;actionController.current.abort();releaseGroupClient(db);remote?.stop()}
      }
      observed=latest
    }
    const update=()=>{setOnline(navigator.onLine);if(!navigator.onLine||document.visibilityState==='hidden')refreshController.current?.abort();else void refreshRef.current()}
    const changed=()=>{channel?.postMessage('changed');void invalidate().then(()=>refreshRef.current())}
    if(channel)channel.onmessage=()=>{void invalidate().then(()=>refreshRef.current())}
    void invalidate()
    void local().then(async()=>{
      if(!configured){const binding=await db.getGroupBinding();if(binding?.enabled)await db.saveGroupBinding({...binding,enabled:false})}
      if(mounted.current){setReady(true);void refreshRef.current()}
    }).catch(cause=>{if(mounted.current){setReady(true);setError(groupErrorText(cause))}})
    window.addEventListener(GROUP_CHANGE,changed);window.addEventListener('online',update);window.addEventListener('offline',update);window.addEventListener('focus',update);document.addEventListener('visibilitychange',update)
    return()=>{mounted.current=false;epoch.current++;refreshController.current?.abort();actionController.current.abort();channel?.close();releaseGroupClient(db);window.removeEventListener(GROUP_CHANGE,changed);window.removeEventListener('online',update);window.removeEventListener('offline',update);window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update)}
  },[db,configured,remote])
  useEffect(()=>{if(location.pathname!=='/groups')return;const timer=setInterval(()=>{void refreshRef.current()},60000);return()=>clearInterval(timer)},[location.pathname])
  async function execute(work:()=>Promise<void>){
    if(actionBusy.current)return false
    actionBusy.current=true;setBusy(true);setError('');const version=epoch.current;actionController.current=new AbortController()
    try{await work();if(version!==epoch.current)return false;await local();await refreshRef.current();return true}
    catch(cause){if(mounted.current&&version===epoch.current)setError(groupErrorText(cause));await local();return false}
    finally{actionBusy.current=false;if(mounted.current)setBusy(false)}
  }
  async function call<T>(name:RpcName,args:Record<string,unknown>={}):Promise<T>{
    if(!navigator.onLine)throw new GroupError('OFFLINE')
    const service=await client(),version=epoch.current
    const response=await service.rpc<T>(name,args,actionController.current.signal)
    if(version!==epoch.current)throw new GroupError('IDENTITY_CHANGED')
    if(!response.ok)throw new GroupError(response.code)
    return response.data
  }
  const identity=async()=>new IdentityService(db,await client())
  const beginIdentity:GroupsValue['beginIdentity']=(action,input,captchaToken)=>execute(async()=>{
    const guard=await db.groups.guard()
    if(!remote&&!import.meta.env.DEV&&!captchaToken)throw new GroupError('CAPTCHA_REQUIRED')
    if(!navigator.onLine)throw new GroupError('OFFLINE')
    const service=await client();await db.groups.write('groupState','consent',true);await db.groups.write('groupState','enabled',true)
    await service.authenticate(captchaToken)
    const latest=await db.groups.guard();if(latest.epoch!==guard.epoch||latest.sharingEpoch!==guard.sharingEpoch)throw new GroupError('IDENTITY_CHANGED')
    await new IdentityService(db,service).start(action,input)
  })
  const setEnabled:GroupsValue['setEnabled']=value=>execute(async()=>{
    refreshController.current?.abort()
    await db.groups.setSharing(value);current.current.enabled=value;setEnabledState(value)
    if(!value){releaseGroupClient(db);remote?.stop();setSnapshot({})}
  })
  const inviteGroup:GroupsValue['inviteGroup']=(action,name)=>execute(async()=>{
    const identityEpoch=await db.groups.read<string>('groupState','identityEpoch')
    if(await db.groups.read('groupState','pendingIdentity'))throw new GroupError('PENDING_IDENTITY')
    let op=await db.groups.read<InviteOperation>('groupState','inviteOperation')
    if(op?.confirmed)throw new GroupError('PENDING_INVITE')
    if(!op){const secret=makeSecret(16);op={secret,hash:await hashSecret(secret),operationId:crypto.randomUUID(),action,name};if(!await db.groups.reserveInvite(op,identityEpoch))throw new GroupError('IDENTITY_CHANGED')}
    const service=await client(),receipt=await service.rpc<GroupData>('operation',{p_operation_id:op.operationId},actionController.current.signal)
    if(!receipt.ok){
      if(receipt.code!=='NOT_FOUND')throw new GroupError(receipt.code)
      const result=await service.rpc(op.action==='create'?'create_group':'manage_group',op.action==='create'?{p_name:op.name,p_invite_hash:op.hash,p_operation_id:op.operationId}:{p_action:'rotate_invite',p_target_profile_id:null,p_name:null,p_invite_hash:op.hash,p_operation_id:op.operationId},actionController.current.signal)
      if(!result.ok){await db.groups.updateInvite(op.operationId);throw new GroupError(result.code)}
    }
    if(!await db.groups.updateInvite(op.operationId,{...op,confirmed:true}))throw new GroupError('IDENTITY_CHANGED')
  })
  const logout=()=>execute(async()=>{
    refreshController.current?.abort();releaseGroupClient(db);remote?.stop();await db.groups.logout();setSnapshot({});setPending(undefined);setInvite(undefined)
  })
  const value:GroupsValue={...snapshot,ready,configured,enabled,hasIdentity,busy,syncing,online,error,pending,invite,pendingCount,notice,refresh,setEnabled,beginIdentity,inviteGroup,
    resumeIdentity:code=>execute(async()=>{await(await identity()).resume(code)}),confirmIdentity:()=>execute(async()=>{await(await identity()).confirmSaved()}),
    rotateRecovery:()=>execute(async()=>{await(await identity()).start('rotate')}),dismissInvite:()=>execute(()=>db.groups.remove('groupState','inviteOperation')),
    call,perform:(name,args)=>execute(async()=>{await call(name,args)}),draft:async date=>await db.groups.read<string>('groupDrafts',date)??'',saveDraft:(date,text)=>db.saveGroupDraft(date,text),publish:date=>execute(()=>db.publishGroupDraft(date)),logout,
    deleteProfile:()=>execute(async()=>{await call('delete_profile',{p_operation_id:crypto.randomUUID()});refreshController.current?.abort();releaseGroupClient(db);await db.groups.logout();setSnapshot({});setPending(undefined);setInvite(undefined)}),
  }
  return <Context.Provider value={value}>{children}</Context.Provider>
}
export function useGroups(){const value=useContext(Context);if(!value)throw new Error('GroupsProvider required');return value}
