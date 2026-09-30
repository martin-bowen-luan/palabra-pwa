import { Navigate, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { toLocalDate } from '../domain/stats'
import styles from '../styles/App.module.css'
import { SpanishResult } from '../spanish/SpanishResult'
import { useSpanish } from '../spanish/SpanishProvider'
import { buildSpanishGroup } from '../spanish/course'

export function ResultPage() {
  const { sessions, moreGroupsToday: legacyMoreGroups, startNextGroup, vocabulary, progress, settings,wordbooks } = useAppState()
  const spanish = useSpanish()
  const navigate = useNavigate()
  const session = [...sessions].reverse().find((item) => item.date === toLocalDate(new Date()))
  if (!session) return <Navigate to="/today" replace />
  if (session.id.startsWith('es-cloze:')) return <SpanishResult session={session} />
  const moreGroupsToday = spanish.enabled
    ? buildSpanishGroup(vocabulary, progress, spanish.day, settings.spanishDailyGoal ?? 50, new Date(), false, session.mode ?? 'learn').all.length > 0
    : legacyMoreGroups
  const accuracy = session.totalCount ? Math.round(session.correctCount / session.totalCount * 100) : undefined
  return <main className={styles.resultPage}>
    <div className={styles.completionMark}><span>✓</span></div>
    {session.language==='en'&&<p className={styles.bookNote}>{wordbooks.find(b=>b.id===(session.sourceWordbook??'en-highschool'))?.title} · 已计入英语共享记忆</p>}
    <p>{session.mode ? `${session.mode === 'review' ? '复习' : '学习'}小组完成了` : moreGroupsToday ? '本组完成了' : '今天完成了'}</p>
    <h1>{accuracy === undefined ? '—' : `${accuracy}%`}</h1>
    <span>{accuracy === undefined ? '无需测试' : '测试正确率'}</span>
    <div className={styles.resultStats}>
      <div><strong>{session.newCount}</strong><span>新学词</span></div>
      <div><strong>{session.reviewCount}</strong><span>复习词</span></div>
      <div><strong>{session.newCount + session.reviewCount}</strong><span>下次会再见</span></div>
    </div>
    {Boolean(session.skippedCount) && <p className={styles.inlineNotice}>{session.skippedCount} 个拼写跳过词已加入优先复习，约 10 分钟后再见。</p>}
    {moreGroupsToday
      ? <button className={styles.primaryButton} disabled={spanish.enabled && spanish.busy} onClick={() => void (spanish.enabled ? spanish.start(session.mode ?? 'learn') : startNextGroup()).then((group) => { if (group) navigate('/study') })}>开始下一组</button>
      : <button className={styles.primaryButton} onClick={() => navigate('/today')}>回到今日</button>}
    {moreGroupsToday && <button className={styles.textButton} onClick={() => navigate('/today')}>回到今日</button>}
    {spanish.enabled && spanish.error && <p role="alert">{spanish.error}</p>}
  </main>
}
