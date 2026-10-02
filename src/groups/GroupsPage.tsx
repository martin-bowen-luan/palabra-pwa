import { useEffect,useRef,useState } from 'react'
import { Link } from 'react-router-dom'
import { useGroups } from './GroupsProvider'
import { IdentityPanel } from './IdentityPanel'
import { GroupAdmin,GroupSettingsPanel } from './GroupAdmin'
import { GroupMembers } from './GroupMembers'
import { groupDate } from './projection'
import { JoinGroup } from './JoinGroup'
import { GroupInvitation } from './GroupInvitation'
import base from '../styles/App.module.css'
import styles from './Groups.module.css'
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
  const [inviteOpen,setInviteOpen]=useState(false),[settingsOpen,setSettingsOpen]=useState(false)
  const settingsRef=useRef<HTMLDetailsElement>(null)
  const inviteTrigger=useRef<HTMLButtonElement>(null)
  const closeInvite=()=>{setInviteOpen(false);inviteTrigger.current?.focus()}
  const openSettings=()=>{
    setSettingsOpen(true)
    requestAnimationFrame(()=>{settingsRef.current?.scrollIntoView?.({block:'start'});settingsRef.current?.querySelector('summary')?.focus()})
  }
  const earliest=new Date(`${today}T00:00:00Z`);earliest.setUTCDate(earliest.getUTCDate()-29)
  const since=[earliest.toISOString().slice(0,10),groups.group?groupDate(groups.group.binding.joinedAt):''].sort().at(-1)
  const statusText=(!groups.enabled?'共享已关闭':!groups.online?`离线显示本机缓存${groups.cachedAt?`，更新于 ${new Date(groups.cachedAt).toLocaleString('zh-CN')}`:''}`:groups.syncing?'正在同步…':groups.error&&groups.cachedAt?'同步未完成，显示本机缓存':groups.cachedAt?`最近同步 ${new Date(groups.cachedAt).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`:'加入后，背词记录自动打卡')+(groups.pendingCount>0?` · 待同步 ${groups.pendingCount} 条`:'')
  if(!groups.ready)return <main className={`${base.page} ${styles.surface}`}><p role="status">正在读取本机小组资料…</p><Link to="/today">回到今日</Link></main>
  return <main className={`${base.page} ${styles.surface}`}>
    <header className={styles.header}><Link to="/today">回到今日</Link><div className={styles.actions}>{groups.configured&&groups.hasIdentity&&<button className={styles.quiet} disabled={groups.syncing||!groups.online||!groups.enabled} onClick={()=>void groups.refresh()}>刷新</button>}{groups.group?<button onClick={openSettings} aria-controls="group-settings" aria-expanded={settingsOpen}>小组设置</button>:null}</div></header>
    <h1>{groups.group?.group.name??'好友小组'}</h1>
    {!groups.configured?<p>好友小组尚未开放，正在完成服务与隐私配置。本地背词照常可用。</p>:<>
      {groups.group?<div className={styles.groupHeading}><div><span className={styles.caption}>{groups.group.memberProfiles.length} / 10 位成员</span><p role="status" className={styles.status}>{statusText}</p></div><button ref={inviteTrigger} className={styles.primary} onClick={()=>setInviteOpen(value=>!value)} aria-expanded={inviteOpen||Boolean(groups.invite)} aria-controls="group-invitation">邀请朋友</button></div>:<><p className={styles.intro}>一起背词，也记得给朋友加油。</p><p role="status" className={styles.status}>{statusText}</p></>}
      {groups.error&&<p role="alert" className={styles.error}>{groups.error}</p>}
      {groups.notice&&<p className={styles.caption}>{groups.notice==='DEVICE_REPLACED'?'旧设备的未同步记录不会转移到新身份。':groups.notice}</p>}
      {!groups.enabled?<button className={styles.primary} disabled={groups.busy} onClick={()=>void groups.setEnabled(true)}>重新开启共享</button>:<>
        {groups.pending||!groups.profile?<IdentityPanel/>:<>
          <div id="group-invitation">{(inviteOpen||groups.invite)&&<GroupInvitation onClose={closeInvite}/>}</div>
          {groups.group?<>
            {groups.activity?.nudges.filter(n=>n.receiverId===groups.profile?.profileId&&!n.readAt).map(n=><div className={styles.inbox} key={n.id}><p>{groups.group?.memberProfiles.find(p=>p.id===n.senderId)?.nickname??'朋友'}{n.kind==='cheer'?'给你加油了':'提醒你来学习'}</p><button disabled={groups.busy||!groups.online} onClick={()=>void groups.perform('read_nudge',{p_nudge_id:n.id})}>知道了</button></div>)}
            <div className={styles.activityHeading}><div><h2>{date===today?'今日打卡':'历史打卡'}</h2><span className={styles.caption}>根据实际背词自动更新</span></div><label><span className={styles.caption}>查看日期 · 北京时间</span><input className={styles.date} type="date" aria-label="查看打卡日期" value={date} min={since} max={today} onChange={e=>{if(e.target.value)setDate(e.target.value)}}/></label></div>
            <GroupMembers date={date}/>
            {date===today&&<details className={styles.noteComposer}><summary>写一句话</summary><DailyNote date={today}/></details>}
            <details ref={settingsRef} id="group-settings" className={styles.section} open={settingsOpen} onToggle={e=>setSettingsOpen(e.currentTarget.open)}><summary>小组管理</summary><GroupAdmin key={groups.group.group.id}/></details>
          </>:<JoinGroup/>}
        </>}
      </>}
      <details className={styles.section}><summary>身份与共享设置</summary><GroupSettingsPanel/></details>
    </>}
  </main>
}
