import { groupDate,recordCheckin,toSummary } from './projection'
import type { CheckinDay,CheckinEvent,GroupBinding,GroupOutboxItem } from './types'
export const GROUP_STORES=['groupState','groupLedger','groupOutbox','groupCache','groupAuth','groupDrafts'] as const
export const CHECKIN_STORES=['groupState','groupLedger','groupOutbox']
type Store=typeof GROUP_STORES[number]
export interface GroupGuard {epoch:string|undefined;sharingEpoch?:string}
export const GROUP_CHANGE='palabra:groups-changed'
export function notifyGroups(){if(typeof window!=='undefined')window.dispatchEvent(new Event(GROUP_CHANGE))}
export function result<T>(request:IDBRequest<T>):Promise<T>{return new Promise((resolve,reject)=>{request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)})}
export function done(tx:IDBTransaction):Promise<void>{return new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(tx.error??new Error('本地事务未保存'))})}
const bindingKey=(b:GroupBinding|undefined)=>b?JSON.stringify([b.profileId,b.groupId,b.membershipId,b.membershipGeneration,b.deviceGeneration]):''

/** Call only inside the successful study CAS transaction. No promises/network inside callbacks. */
export function putGroupCheckin(tx:IDBTransaction,event:CheckinEvent) {
  const state=tx.objectStore('groupState').get('binding') as IDBRequest<GroupBinding|undefined>
  state.onsuccess=()=>{
    try {
      const binding=state.result
      if(!binding?.enabled)return
      const candidate=recordCheckin(undefined,binding,event)
      if(!candidate)return
      const store=tx.objectStore('groupLedger'),read=store.get(candidate.key) as IDBRequest<CheckinDay|undefined>
      read.onsuccess=()=>{
        try {
          const next=recordCheckin(read.result,binding,event)
          if(!next||next===read.result)return
          store.put(next,next.key)
          const item:GroupOutboxItem={kind:'summary',key:next.key,version:next.version,payload:toSummary(next,binding)}
          tx.objectStore('groupOutbox').put(item,item.key)
        } catch {tx.abort()}
      }
    } catch {tx.abort()}
  }
}

/** Dedicated adapter uses the existing database connection, never a second source of truth. */
export class GroupLocal {
  constructor(private open:()=>Promise<IDBDatabase>){}
  async read<T>(store:Store,key:string):Promise<T|undefined>{const db=await this.open();return result(db.transaction(store).objectStore(store).get(key))}
  async write<T>(store:Store,key:string,value:T):Promise<void>{const db=await this.open(),tx=db.transaction(store,'readwrite'),saved=done(tx);tx.objectStore(store).put(value,key);await saved}
  async remove(store:Store,key:string):Promise<void>{const db=await this.open(),tx=db.transaction(store,'readwrite'),saved=done(tx);tx.objectStore(store).delete(key);await saved}
  async getBinding(){return this.read<GroupBinding>('groupState','binding')}
  async guard():Promise<GroupGuard>{const db=await this.open(),state=db.transaction('groupState').objectStore('groupState');const [epoch,sharingEpoch]=await Promise.all([result(state.get('identityEpoch')),result(state.get('sharingEpoch'))]);return{epoch,sharingEpoch}}
  private whenCurrent(state:IDBObjectStore,guard:GroupGuard,apply:()=>void){
    const epoch=state.get('identityEpoch'),sharing=state.get('sharingEpoch'),enabled=state.get('enabled')
    enabled.onsuccess=()=>{if(epoch.result===guard.epoch&&sharing.result===guard.sharingEpoch&&enabled.result!==false)apply()}
  }
  async setSharing(enabled:boolean){
    const db=await this.open(),tx=db.transaction('groupState','readwrite'),saved=done(tx),state=tx.objectStore('groupState'),binding=state.get('binding')
    state.put(enabled,'enabled');state.put(crypto.randomUUID(),'sharingEpoch');state.delete('lease')
    binding.onsuccess=()=>{if(binding.result)state.put({...binding.result,enabled:false},'binding')}
    await saved;notifyGroups()
  }
  async authItem(key:string,epoch:string|undefined,write?:{value?:string}):Promise<string|null>{
    const db=await this.open(),tx=db.transaction(['groupState','groupAuth'],write?'readwrite':'readonly'),saved=done(tx),check=tx.objectStore('groupState').get('identityEpoch')
    let value:string|null=null
    check.onsuccess=()=>{
      if(check.result!==epoch)return
      const auth=tx.objectStore('groupAuth')
      if(write){if(write.value===undefined)auth.delete(key);else auth.put(write.value,key)}
      else{const read=auth.get(key);read.onsuccess=()=>{value=read.result??null}}
    }
    await saved;return value
  }
  async saveBinding(binding:GroupBinding|undefined,guard?:GroupGuard){
    const db=await this.open(),tx=db.transaction(['groupState','groupOutbox','groupCache','groupDrafts'],'readwrite'),saved=done(tx)
    const state=tx.objectStore('groupState'),read=state.get('binding') as IDBRequest<GroupBinding|undefined>
    let changed=false,accepted=false
    read.onsuccess=()=>{
      const apply=()=>{
        accepted=true;changed=JSON.stringify(read.result)!==JSON.stringify(binding)
        if(bindingKey(read.result)!==bindingKey(binding)){
          tx.objectStore('groupOutbox').clear();tx.objectStore('groupCache').clear();tx.objectStore('groupDrafts').clear();state.delete('lease')
        }
        if(binding)state.put(binding,'binding');else state.delete('binding')
      }
      if(guard)this.whenCurrent(state,guard,apply)
      else apply()
    }
    await saved;if(changed)notifyGroups();return accepted
  }
  async cacheSnapshot(value:unknown,epoch:string|undefined,sharingEpoch?:string){
    const db=await this.open(),tx=db.transaction(['groupState','groupCache'],'readwrite'),saved=done(tx)
    let accepted=false
    this.whenCurrent(tx.objectStore('groupState'),{epoch,sharingEpoch},()=>{tx.objectStore('groupCache').put(value,'snapshot');accepted=true})
    await saved;return accepted
  }
  async outbox():Promise<GroupOutboxItem[]>{const db=await this.open();return result(db.transaction('groupOutbox').objectStore('groupOutbox').getAll())}
  async ack(key:string,version:number){
    const db=await this.open(),tx=db.transaction('groupOutbox','readwrite'),saved=done(tx),store=tx.objectStore('groupOutbox'),read=store.get(key) as IDBRequest<GroupOutboxItem|undefined>
    read.onsuccess=()=>{if(read.result?.version===version)store.delete(key)}
    await saved
  }
  async saveDraft(date:string,text:string){
    if(Array.from(text).length>100||!/^\d{4}-\d{2}-\d{2}$/.test(date))throw new Error('留言最多 100 个字')
    await this.write('groupDrafts',date,text)
  }
  async publishDraft(date:string){
    const db=await this.open(),tx=db.transaction(['groupState','groupDrafts','groupOutbox'],'readwrite'),saved=done(tx)
    let error:Error|undefined
    const state=tx.objectStore('groupState'),binding=state.get('binding') as IDBRequest<GroupBinding|undefined>
    binding.onsuccess=()=>{
      const b=binding.result
      if(!b?.enabled||date<groupDate(b.joinedAt)){error=new Error('请先加入小组');tx.abort();return}
      const draft=tx.objectStore('groupDrafts').get(date)
      draft.onsuccess=()=>{
        if(typeof draft.result!=='string'||Array.from(draft.result).length>100){error=new Error('请先保存留言草稿');tx.abort();return}
        const key=JSON.stringify(['note',bindingKey(b),date]),counter=state.get(key)
        counter.onsuccess=()=>{
          const version=(counter.result??0)+1
          state.put(version,key)
          const item:GroupOutboxItem={kind:'note',key,version,payload:{membershipId:b.membershipId,membershipGeneration:b.membershipGeneration,deviceGeneration:b.deviceGeneration,date,text:draft.result}}
          tx.objectStore('groupOutbox').put(item,key)
        }
      }
    }
    try{await saved}catch(cause){throw error??cause}notifyGroups()
  }
  async logout(){
    const stores:Store[]=['groupState','groupOutbox','groupCache','groupAuth','groupDrafts']
    const db=await this.open(),tx=db.transaction(stores,'readwrite'),saved=done(tx)
    stores.forEach(store=>tx.objectStore(store).clear());tx.objectStore('groupState').put(crypto.randomUUID(),'identityEpoch');await saved;notifyGroups()
  }
  async acquireLease(owner:string,now=Date.now()){return this.lease(owner,now,false)}
  async renewLease(owner:string,now=Date.now()){return this.lease(owner,now,true)}
  private async lease(owner:string,now:number,renew:boolean){
    const db=await this.open(),tx=db.transaction('groupState','readwrite'),saved=done(tx),state=tx.objectStore('groupState')
    let acquired=false
    const binding=state.get('binding') as IDBRequest<GroupBinding|undefined>
    binding.onsuccess=()=>{
      if(!binding.result?.enabled)return
      const read=state.get('lease') as IDBRequest<{owner:string;expiresAt:number;binding:string}|undefined>
      read.onsuccess=()=>{
        const enabled=state.get('enabled')
        enabled.onsuccess=()=>{
        if(enabled.result===false)return
        const previous=read.result,key=bindingKey(binding.result)
        if(renew&&(!previous||previous.owner!==owner||previous.binding!==key||previous.expiresAt<=now))return
        if(!renew&&previous&&previous.binding===key&&previous.expiresAt>now&&previous.owner!==owner)return
        state.put({owner,expiresAt:now+30000,binding:key},'lease');acquired=true
        }
      }
    }
    await saved;return acquired
  }
  async releaseLease(owner:string){
    const db=await this.open(),tx=db.transaction('groupState','readwrite'),saved=done(tx),state=tx.objectStore('groupState'),read=state.get('lease')
    read.onsuccess=()=>{if(read.result?.owner===owner)state.delete('lease')};await saved
  }
  async reserveIdentity<T extends {operationId:string}>(value:T,epoch?:string){return this.changeIdentity(undefined,value,epoch)}
  async updateIdentity<T extends {operationId:string}>(operationId:string,value?:T){return this.changeIdentity(operationId,value)}
  async reserveInvite<T extends {operationId:string}>(value:T,epoch?:string){return this.changeIdentity(undefined,value,epoch,'inviteOperation')}
  async updateInvite<T extends {operationId:string}>(operationId:string,value?:T){return this.changeIdentity(operationId,value,undefined,'inviteOperation')}
  private async changeIdentity<T extends {operationId:string}>(expected:string|undefined,value:T|undefined,epoch?:string,key='pendingIdentity'){
    const db=await this.open(),tx=db.transaction('groupState','readwrite'),saved=done(tx),state=tx.objectStore('groupState'),read=state.get(key)
    let changed=false
    read.onsuccess=()=>{
      if(read.result?.operationId!==expected)return
      const epochRead=state.get('identityEpoch')
      epochRead.onsuccess=()=>{
        if(expected===undefined&&epochRead.result!==epoch)return
        if(value)state.put(value,key);else state.delete(key);changed=true
      }
    }
    await saved;return changed
  }
}
