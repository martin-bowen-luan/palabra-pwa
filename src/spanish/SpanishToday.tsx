import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { isDue } from '../domain/reviewScheduler'
import { buildSpanishGroup, eligibleSpanish, spanishReviewsDeferred } from './course'
import { toLocalDate } from '../domain/stats'
import { useSpanish } from './SpanishProvider'
import base from '../styles/App.module.css'
import styles from './Spanish.module.css'
import { GroupEntry } from '../groups/GroupEntry'
import { SpanishCategorySwitch } from './SpanishCategorySwitch'

export function SpanishToday() {
  const {activeSession,settings,vocabulary,progress,updateSettings}=useAppState(),course=useSpanish(),navigate=useNavigate()
  const goal=settings.spanishDailyGoal??50
  const [savingCategory,setSavingCategory]=useState(false)
  const [savingReview,setSavingReview]=useState(false)
  const [reviewError,setReviewError]=useState('')
  const deferred=spanishReviewsDeferred(settings.spanishReviewDeferredOn)
  const busy=savingCategory||savingReview||course.busy
  const entries=Object.values(course.day.entries),count=entries.length
  const newCount=entries.filter(e=>e.kind==='new').length
  const eligible=vocabulary.filter(eligibleSpanish)
  const due=eligible.filter(w=>progress[w.id]&&isDue(progress[w.id])).length
  const newRemaining=eligible.filter(w=>!progress[w.id]&&(!settings.spanishNewCategory||w.category===settings.spanishNewCategory)).length
  const available=buildSpanishGroup(vocabulary,progress,course.day,goal,new Date(),count>=goal,'learn',settings.spanishNewCategory,settings.spanishReviewDeferredOn).all.length>0
  const begin=async(mode:'learn'|'review',extra=false)=>{if(await course.start(mode,extra))navigate('/study')}
  const toggleReview=async()=>{
    if(savingReview)return
    setSavingReview(true);setReviewError('')
    try {await updateSettings({spanishReviewDeferredOn:deferred?undefined:toLocalDate(new Date())})}
    catch {setReviewError('复习安排未保存，请重试。原有安排与进度不变。')}
    finally {setSavingReview(false)}
  }
  return <main className={base.page}>
    <header className={base.brandHeader}><span className={base.brand}>palabra</span><span className={styles.grammar}>西语情境填词</span></header>
    <LanguageSwitch/>
    <SpanishCategorySwitch onSavingChange={setSavingCategory}/>
    <section className={base.todayHero}>
      <p className={base.date}>{new Intl.DateTimeFormat('zh-CN',{month:'long',day:'numeric',weekday:'long'}).format(new Date())}</p>
      <h1>今天</h1>
      <div className={base.assignment}><strong>每日目标 {goal} 个</strong><span>新词与复习合计</span></div>
      <div className={base.progressLine} aria-label={`今日练习 ${count}/${goal}`}><span style={{width:`${Math.min(100,count/goal*100)}%`}}/></div>
      <div className={base.progressMeta}><span>已练习 {count} 个</span><span>新学 {newCount} · 复习 {count-newCount}</span></div>
      <p className={styles.grammar}>每组最多 10 个。可以随时结束，不必一次完成。</p>
      {course.error&&<p className={styles.error} role="alert">{course.error}</p>}
      {activeSession?<button className={base.primaryButton} onClick={()=>navigate('/study')}>继续本组</button>:count<goal?<button disabled={busy||!available} className={base.primaryButton} onClick={()=>void begin('learn')}>开始今天的学习</button>:<><p className={styles.correct}>今日目标已达成</p><button disabled={busy||!available} className={base.primaryButton} onClick={()=>void begin('learn',true)}>自愿再练一组</button></>}
      {!available&&!activeSession&&<p className={styles.grammar}>{deferred?'当前范围暂无可安排的新词。可切换类别或恢复复习；同一原词的其他形式可能需留到后续日期。':newRemaining?'同一原词今天的新形式已安排完，其他形式会留到后续日期。':settings.spanishNewCategory?'此类别暂无新词，也没有到期复习。可切换类别或选择“全部”。':'暂时没有待学或到期词形，稍后再来复习。'}</p>}
    </section>
    <section className={styles.paths} aria-label="学习与复习">
      <div><h2>学习</h2><p>{newRemaining} 个待学词形</p><small aria-live="polite">{deferred?'今天暂缓复习，明天自动恢复。':'到期复习优先，再加入新词。'}</small>
        <button type="button" className={base.textButton} aria-pressed={deferred} disabled={busy} onClick={()=>void toggleReview()}>{savingReview?'正在保存…':deferred?'恢复复习优先':'今天先学新词'}</button>
        {activeSession&&<small>当前组不变，从下一组生效。</small>}
      </div>
      <div><h2>复习</h2><p>{due} 个已到期</p>{deferred&&<small>记录保留，随时可复习。</small>}<button className={base.textButton} disabled={busy||!due} onClick={()=>void begin('review',count>=goal)}>只复习到期词</button></div>
    </section>
    {reviewError&&<p role="alert" className={styles.error}>{reviewError}</p>}
    <GroupEntry />
  </main>
}
