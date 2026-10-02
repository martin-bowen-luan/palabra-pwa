import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { isDue } from '../domain/reviewScheduler'
import { buildSpanishGroup, eligibleSpanish } from './course'
import { useSpanish } from './SpanishProvider'
import base from '../styles/App.module.css'
import styles from './Spanish.module.css'
import { GroupEntry } from '../groups/GroupEntry'

export function SpanishToday() {
  const {activeSession,settings,vocabulary,progress}=useAppState(),course=useSpanish(),navigate=useNavigate()
  const goal=settings.spanishDailyGoal??50
  const entries=Object.values(course.day.entries),count=entries.length
  const newCount=entries.filter(e=>e.kind==='new').length
  const eligible=vocabulary.filter(eligibleSpanish)
  const due=eligible.filter(w=>progress[w.id]&&isDue(progress[w.id])).length
  const newRemaining=eligible.filter(w=>!progress[w.id]).length
  const available=buildSpanishGroup(vocabulary,progress,course.day,goal,new Date(),count>=goal).all.length>0
  const begin=async(mode:'learn'|'review',extra=false)=>{if(await course.start(mode,extra))navigate('/study')}
  return <main className={base.page}>
    <header className={base.brandHeader}><span className={base.brand}>palabra</span><span className={styles.grammar}>西语情境填词</span></header>
    <LanguageSwitch/>
    <section className={base.todayHero}>
      <p className={base.date}>{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</p>
      <h1>今天</h1>
      <div className={base.assignment}><strong>每日目标 {goal} 个</strong><span>新词与复习合计</span></div>
      <div className={base.progressLine} aria-label={`今日练习 ${count}/${goal}`}><span style={{width:`${Math.min(100,count/goal*100)}%`}}/></div>
      <div className={base.progressMeta}><span>已练习 {count} 个</span><span>新学 {newCount} · 复习 {count-newCount}</span></div>
      <p className={styles.grammar}>每组最多 10 个。可以随时结束，不必一次完成。</p>
      {course.error&&<p className={styles.error} role="alert">{course.error}</p>}
      {activeSession?<button className={base.primaryButton} onClick={()=>navigate('/study')}>继续本组</button>:count<goal?<button disabled={course.busy||!available} className={base.primaryButton} onClick={()=>void begin('learn')}>开始今天的学习</button>:<><p className={styles.correct}>今日目标已达成</p><button disabled={course.busy||!available} className={base.primaryButton} onClick={()=>void begin('learn',true)}>自愿再练一组</button></>}
      {!available&&!activeSession&&<p className={styles.grammar}>{newRemaining?'同一原词今天的新形式已安排完，其他形式会留到后续日期。':'暂时没有待学或到期词形，稍后再来复习。'}</p>}
    </section>
    <section className={styles.paths} aria-label="学习与复习">
      <div><h2>学习</h2><p>{newRemaining} 个待学词形</p><small>到期复习优先，再加入新词。</small></div>
      <div><h2>复习</h2><p>{due} 个已到期</p><button className={base.textButton} disabled={course.busy||!due} onClick={()=>void begin('review',count>=goal)}>只复习到期词</button></div>
    </section>
    <GroupEntry />
  </main>
}
