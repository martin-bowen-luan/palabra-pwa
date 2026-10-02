import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { useGroups } from './GroupsProvider'
import styles from './Groups.module.css'
export function ConfirmButton({label,description,onConfirm,disabled=false}:{label:string;description:string;onConfirm:()=>Promise<boolean>;disabled?:boolean}){
  const [open,setOpen]=useState(false),trigger=useRef<HTMLButtonElement>(null),confirm=useRef<HTMLButtonElement>(null)
  useEffect(()=>{if(open)confirm.current?.focus()},[open])
  const close=()=>{setOpen(false);trigger.current?.focus()}
  return <><button ref={trigger} className={styles.danger} disabled={disabled} onClick={()=>setOpen(true)}>{label}</button>{open&&<section role="region" aria-label="确认操作" className={styles.confirmation}><p>{description}</p><div className={styles.actions}><button ref={confirm} disabled={disabled} className={styles.danger} onClick={()=>void onConfirm().then(ok=>{if(ok)close()})}>确认{label}</button><button disabled={disabled} onClick={close}>取消</button></div></section>}</>
}
export function GroupAdmin(){
  const groups=useGroups(),[name,setName]=useState(groups.group?.group.name??''),[target,setTarget]=useState('')
  if(!groups.group||!groups.profile)return null
  const own=groups.group.group.ownerId===groups.profile.profileId
  const manage=(action:string,targetId:string|null=null,nextName:string|null=null)=>groups.perform('manage_group',{p_action:action,p_target_profile_id:targetId,p_name:nextName,p_invite_hash:null,p_operation_id:crypto.randomUUID()})
  return <section className={styles.management}>
    {own?<><label className={styles.field}>小组名称<input value={name} onChange={e=>setName(Array.from(e.target.value).slice(0,30).join(''))}/></label>
      <div className={styles.actions}><button disabled={groups.busy||!groups.online||Array.from(name.trim()).length<2} onClick={()=>void manage('rename',null,name.trim())}>保存组名</button></div>
      <label className={styles.field}>选择成员<select value={target} onChange={e=>setTarget(e.target.value)}><option value="">请选择</option>{groups.group.memberProfiles.filter(p=>p.id!==groups.profile?.profileId).map(p=><option key={p.id} value={p.id}>{p.nickname} · {p.id.slice(0,4)}</option>)}</select></label>
      <div className={styles.actions}><ConfirmButton label="移除成员" disabled={groups.busy||!target} description="该成员将立即失去小组访问权，旧待传记录不再共享。" onConfirm={()=>manage('remove',target)}/><ConfirmButton label="转交组主" disabled={groups.busy||!target} description="转交后，你将成为普通成员，失去小组管理权限。" onConfirm={()=>manage('transfer',target)}/></div>
      <ConfirmButton label="解散小组" disabled={groups.busy} description="所有成员将退出小组，邀请码失效，待传记录不再共享。本机背词记录不受影响。" onConfirm={()=>manage('dissolve')}/>
    </>:<ConfirmButton label="离开小组" disabled={groups.busy} description="离开后不能再查看组员记录，旧待传记录不再共享。本机背词记录保留。" onConfirm={()=>manage('leave')}/>}
  </section>
}
export function GroupSettingsPanel(){
  const groups=useGroups()
  if(!groups.configured)return null
  return <section className={`${styles.surface} ${styles.section}`}>
    <h2>小组与隐私</h2>
    <label className={styles.check}><input type="checkbox" checked={groups.enabled} disabled={groups.busy} onChange={e=>void groups.setEnabled(e.target.checked)}/>开启小组共享</label>
    <p className={styles.caption}>关闭后停止新的打卡和上传，已保存的待传项保留。重新开启后验证资格再补传。</p>
    {groups.profile&&<><label className={styles.check}><input type="checkbox" checked={groups.profile.receiveNudges} disabled={groups.busy||!groups.online} onChange={e=>void groups.perform('update_profile',{p_nickname:groups.profile!.nickname,p_receive_nudges:e.target.checked,p_operation_id:crypto.randomUUID()})}/>接收朋友的轻提醒</label>
      <div className={styles.actions}><button disabled={groups.busy||Boolean(groups.pending)||!groups.online} onClick={()=>void groups.rotateRecovery()}>重新生成恢复码</button></div>
      <p className={styles.caption}>新码生成后请到好友小组页保存，旧码随即失效。</p>
      <ConfirmButton label="删除云端小组资料" disabled={groups.busy||!groups.online} description="将删除你的昵称、小组资格、云端打卡、留言和提醒，无法恢复。组主需先转交或解散。此操作不删除本机学习记录，也不等于删除整个 Supabase Auth 账号。" onConfirm={groups.deleteProfile}/>
    </>}
    {groups.hasIdentity&&<ConfirmButton label="退出本机身份" disabled={groups.busy} description="请先保存恢复码。退出会清除本机小组凭据、缓存及待传项，不删除本机背词记录；未同步部分不会共享。身份被替换后，可先退出本机身份，再用最新恢复码找回。" onConfirm={groups.logout}/>}
    <p><Link to="/groups">打开好友小组</Link></p>
    {groups.error&&<p className={styles.error} role="alert">{groups.error}</p>}
  </section>
}
