import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { useGroups } from './GroupsProvider'
import { IdentityPanel,SecretCode } from './IdentityPanel'
import { GroupAdmin,GroupSettingsPanel } from './GroupAdmin'
import { GroupMembers } from './GroupMembers'
import { groupDate } from './projection'
import { groupErrorText } from './client'
import base from '../styles/App.module.css'
import styles from './Groups.module.css'
function JoinGroup(){
  const groups=useGroups(),[name,setName]=useState(''),[code,setCode]=useState(''),[preview,setPreview]=useState<{name:string;memberCount:number}>(),[error,setError]=useState(''),[busy,setBusy]=useState(false)
  const version=useRef(0)
  const inspect=async()=>{const turn=++version.current;setBusy(true);setError('');try{const data=await groups.call<{name:string;memberCount:number}>('preview_invite',{p_code:code});if(turn===version.current)setPreview(data)}catch(cause){if(turn===version.current)setError(groupErrorText(cause))}finally{setBusy(false)}}
  return <section className={styles.section}>
    <h2>选一个开始</h2>
    <p className={styles.caption}>每个身份同时加入一个小组，最多 10 人。只共享加入之后的实际练习。</p>
    <label className={styles.field}>新小组名称<input value={name} onChange={e=>setName(Array.from(e.target.value).slice(0,30).join(''))} placeholder="例如：每天十个词"/></label>
    <button className={styles.primary} disabled={groups.busy||!groups.online||Array.from(name.trim()).length<2} onClick={()=>void groups.inviteGroup('create',name.trim())}>创建小组</button>
    <label className={styles.field}>朋友的邀请码<input value={code} onChange={e=>{version.current++;setCode(e.target.value);setPreview(undefined)}} autoComplete="off" spellCheck={false}/></label>
    <button disabled={busy||groups.busy||!groups.online||!code.trim()} onClick={()=>void inspect()}>查看邀请</button>
    {preview&&<div><p>加入「{preview.name}」？目前 {preview.memberCount} / 10 人。</p><button className={styles.primary} disabled={groups.busy||preview.memberCount>=10} onClick={()=>void groups.perform('join_group',{p_code:code,p_operation_id:crypto.randomUUID()})}>确认加入</button></div>}
    {error&&<p className={styles.error} role="alert">{error}</p>}
  </section>
}
function DailyNote({date}:{date:string}){
  const groups=useGroups(),[text,setText]=useState(''),[error,setError]=useState(''),[saving,setSaving]=useState(false)
  const chain=useRef<Promise<void>>(Promise.resolve()),editVersion=useRef(0)
  useEffect(()=>{let active=true;const edit=editVersion.current;void groups.draft(date).then(value=>{if(active&&edit===editVersion.current)setText(value)}).catch(()=>{if(active)setError('未能读取草稿，请重试。')});return()=>{active=false}},[date,groups.profile?.profileId])
  const change=(value:string)=>{editVersion.current++;setText(value);setError('');chain.current=chain.current.catch(()=>{}).then(()=>groups.saveDraft(date,value)).catch(()=>setError('草稿未能保存，请检查本机存储。'))}
  const publish=async()=>{setSaving(true);setError('');try{await chain.current;await groups.saveDraft(date,text);await groups.publish(date)}catch{setError('留言尚未保存，请重试。')}finally{setSaving(false)}}
  return <section className={styles.section}><label className={styles.field}>今天的一句话<textarea value={text} rows={2} onChange={e=>change(Array.from(e.target.value).slice(0,100).join(''))} placeholder="给今天的自己和朋友留句话"/></label>
    <div className={styles.actions}><small className={styles.caption}>{Array.from(text).length} / 100 · 草稿仅本机保存</small><button disabled={groups.busy||saving} className={styles.primary} onClick={()=>void publish()}>发布</button></div>
    <p className={styles.caption}>点发布才会共享；清空后再发布可删除已发内容。</p>{error&&<p role="alert" className={styles.error}>{error}</p>}
  </section>
}
export function GroupsPage(){
  const groups=useGroups(),today=groupDate(new Date().toISOString()),[date,setDate]=useState(today)
  const earliest=new Date(`${today}T00:00:00Z`);earliest.setUTCDate(earliest.getUTCDate()-29)
  const since=[earliest.toISOString().slice(0,10),groups.group?groupDate(groups.group.binding.joinedAt):''].sort().at(-1)
  if(!groups.ready)return <main className={`${base.page} ${styles.surface}`}><p role="status">正在读取本机小组资料…</p><Link to="/today">回到今日</Link></main>
  return <main className={`${base.page} ${styles.surface}`}>
    <header className={styles.header}><Link to="/today">回到今日</Link>{groups.configured&&<button className={styles.quiet} disabled={groups.syncing||!groups.online||!groups.enabled} onClick={()=>void groups.refresh()}>刷新</button>}</header>
    <h1>{groups.group?.group.name??'好友小组'}</h1>
    {!groups.configured?<p>好友小组尚未开放，正在完成服务与隐私配置。本地背词照常可用。</p>:<>
      <p role="status" className={styles.status}>{!groups.enabled?'共享已关闭':!groups.online?`离线显示本机缓存${groups.cachedAt?`，更新于 ${new Date(groups.cachedAt).toLocaleString('zh-CN')}`:''}`:groups.syncing?'正在同步…':groups.cachedAt?`最近同步 ${new Date(groups.cachedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:'从加入后的练习开始共享'}{groups.pendingCount>0?` · 待同步 ${groups.pendingCount} 条`:''}</p>
      {groups.error&&<p role="alert" className={styles.error}>{groups.error}</p>}
      {groups.notice&&<p className={styles.caption}>{groups.notice==='DEVICE_REPLACED'?'旧设备的未同步记录不会转移到新身份。':groups.notice}</p>}
      {!groups.enabled?<button className={styles.primary} disabled={groups.busy} onClick={()=>void groups.setEnabled(true)}>重新开启共享</button>:<>
        {groups.pending||!groups.profile?<IdentityPanel/>:<>
          {groups.invite&&<section className={styles.section} aria-label="邀请朋友"><h2>邀请朋友</h2>{groups.invite.confirmed?<><SecretCode label="邀请码" value={groups.invite.secret}/><p className={styles.caption}>仅分享给信任的朋友，7 天内有效。代码不放进网页链接。</p><button disabled={groups.busy} onClick={()=>void groups.dismissInvite()}>我已保存邀请码</button></>:<><p>邀请码操作结果尚待确认，请继续原操作。</p><button disabled={groups.busy} onClick={()=>void groups.inviteGroup(groups.invite!.action,groups.invite!.name)}>确认邀请码操作</button></>}</section>}
          {groups.group?<>
            {groups.activity?.nudges.filter(n=>n.receiverId===groups.profile?.profileId&&!n.readAt).map(n=><div className={styles.inbox} key={n.id}><p>{groups.group?.memberProfiles.find(p=>p.id===n.senderId)?.nickname??'朋友'}{n.kind==='cheer'?'给你加油了':'提醒你来学习'}</p><button disabled={groups.busy||!groups.online} onClick={()=>void groups.perform('read_nudge',{p_nudge_id:n.id})}>知道了</button></div>)}
            <div className={styles.header}><span className={styles.caption}>组内日期 · 北京时间</span><label><span className={styles.caption}>查看日期 </span><input className={styles.date} type="date" aria-label="查看打卡日期" value={date} min={since} max={today} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label></div>
            {date===today&&<DailyNote date={today}/>}
            <GroupMembers date={date}/><GroupAdmin key={groups.group.group.id}/>
          </>:<JoinGroup/>}
        </>}
      </>}
      <details className={styles.section}><summary>身份与共享设置</summary><GroupSettingsPanel/></details>
    </>}
  </main>
}
