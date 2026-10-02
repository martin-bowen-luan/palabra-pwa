import { useGroups } from './GroupsProvider'
import { Link } from 'react-router-dom'
import { groupDate } from './projection'
import type { GroupSummary } from './types'
import styles from './Groups.module.css'
function LanguageLine({language,summary,isToday}:{language:'en'|'es';summary?:GroupSummary;isToday:boolean}){
  const count=summary?(language==='en'?summary.newCount:summary.newCount+summary.reviewCount):0
  const percent=summary?Math.round(Math.min(100,count/summary.goal*100)):0
  return <div className={styles.language}>
    <div className={styles.languageHead}><strong>{language==='en'?'英语':'西班牙语'}</strong>{summary&&<span>{percent}%</span>}</div>
    {summary?<><div className={styles.meter} role="progressbar" aria-label={`${language==='en'?'英语新学':'西语练习'}目标`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}><i style={{width:`${percent}%`}}/></div>
      <p className={styles.caption}>{language==='en'?`新学 ${summary.newCount} / ${summary.goal} · 复习 ${summary.reviewCount}`:`已练习 ${count} / ${summary.goal} · 新学 ${summary.newCount} · 复习 ${summary.reviewCount}`}{summary.skippedCount?` · 跳过待复习 ${summary.skippedCount}`:''}</p>
      {summary.conservative&&<p className={styles.caption}>{isToday?'今天':'当日'}更换设备，统计为保守汇总</p>}
    </>:<p className={styles.caption}>{isToday?'今日':'当日'}尚未同步</p>}
  </div>
}
export function GroupMembers({date}:{date:string}){
  const groups=useGroups(),today=groupDate(new Date().toISOString())
  const members=[...(groups.group?.memberProfiles??[])].sort((a,b)=>Number(b.id===groups.profile?.profileId)-Number(a.id===groups.profile?.profileId))
  return <section aria-label="组员练习记录">{members.map(member=>{
    const own=member.id===groups.profile?.profileId,note=groups.activity?.notes.find(n=>n.profileId===member.id&&n.date===date)
    return <article className={`${styles.member} ${own?styles.selfMember:''}`} key={member.id} aria-label={`${member.nickname}（${member.id.slice(0,4)}）的记录`}>
      <div className={styles.memberHeader}><div className={styles.memberIdentity}><span className={styles.memberInitial} aria-hidden="true">{Array.from(member.nickname)[0]}</span><div><h3>{member.nickname}</h3><small className={styles.caption}>{own?'我的进度':`${member.id===groups.group?.group.ownerId?'组主':'组员'} · ${member.id.slice(0,4)}`}</small></div></div>{own&&<Link className={styles.studyLink} to="/today">继续学习</Link>}</div>
      <div className={styles.memberProgress}>{(['en','es'] as const).map(language=><LanguageLine key={language} language={language} isToday={date===today} summary={groups.activity?.summaries.find(s=>s.profileId===member.id&&s.language===language&&s.date===date)}/>)}</div>
      {note?.text&&<p className={styles.note}>{note.text}</p>}
      {!own&&<><div className={styles.memberActions}>{(['remind','cheer'] as const).map(kind=>{
        const sent=groups.activity?.nudges.some(n=>n.senderId===groups.profile?.profileId&&n.receiverId===member.id&&n.kind===kind&&n.date===today)
        return <button key={kind} disabled={groups.busy||!groups.online||!member.receiveNudges||sent} onClick={()=>void groups.perform('send_nudge',{p_target_profile_id:member.id,p_kind:kind,p_operation_id:crypto.randomUUID()})}>{sent?(kind==='remind'?'今日已提醒':'今日已加油'):(kind==='remind'?'提醒学习':'加油')}</button>
      })}</div>{!member.receiveNudges&&<p className={styles.caption}>对方已关闭轻提醒</p>}{!groups.online&&<p className={styles.caption}>联网后可以提醒或加油。</p>}</>}
    </article>
  })}</section>
}
