import { useNavigate } from 'react-router-dom'
import type { StudySession } from '../types'
import { useAppState } from '../app/AppState'
import { buildSpanishGroup } from './course'
import { useSpanish } from './SpanishProvider'
import base from '../styles/App.module.css'

export function SpanishResult({session}:{session:StudySession}) {
  const course=useSpanish(),app=useAppState(),navigate=useNavigate()
  const mode=session.mode??'learn'
  const more=buildSpanishGroup(app.vocabulary,app.progress,course.day,app.settings.spanishDailyGoal??50,new Date(),false,mode).all.length>0
  const accuracy=session.totalCount?Math.round(session.correctCount/session.totalCount*100):undefined
  return <main className={base.resultPage}>
    <div className={base.completionMark}><span>✓</span></div><p>本组练习完成</p>
    <h1>{accuracy===undefined?'—':`${accuracy}%`}</h1><span>首次无提示正确率</span>
    <div className={base.resultStats}><div><strong>{session.newCount}</strong><span>新学词形</span></div><div><strong>{session.reviewCount}</strong><span>复习词形</span></div><div><strong>{session.skippedCount??0}</strong><span>跳过待复习</span></div></div>
    <p className={base.inlineNotice}>今日已练习 {Object.keys(course.day.entries).length} / {app.settings.spanishDailyGoal??50} 个，可随时结束。</p>
    {Boolean(session.skippedCount)&&<p className={base.inlineNotice}>跳过的词形已加入优先复习，约 10 分钟后再见。</p>}
    {course.error&&<p role="alert">{course.error}</p>}
    {more&&<button className={base.primaryButton} disabled={course.busy} onClick={()=>void course.start(mode).then(started=>{if(started)navigate('/study')})}>开始下一组</button>}
    <button className={more?base.textButton:base.primaryButton} onClick={()=>navigate('/today')}>回到今日</button>
  </main>
}
