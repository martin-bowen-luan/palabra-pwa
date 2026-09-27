import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { recentSevenDays, summarizeStages } from '../domain/stats'
import styles from '../styles/App.module.css'
import { useSpanish } from '../spanish/SpanishProvider'
import { calculateStreak } from '../domain/stats'

export function ProgressPage() {
  const { progress, sessions, streak, settings } = useAppState()
  const spanish = useSpanish()
  const legacySessions = sessions.filter(session=>!session.id.startsWith('es-cloze:')&&!session.spanishDailyTracked)
    .map(session=>session.spanishUntrackedCount===undefined?session:{...session,newCount:session.spanishUntrackedCount,reviewCount:0})
  const chartSessions = spanish.enabled ? [...legacySessions, ...spanish.days.map(day=>({id:`day:${day.id}`,language:'es' as const,date:day.id,completed:true,newCount:Object.values(day.entries).filter(e=>e.kind==='new').length,reviewCount:Object.values(day.entries).filter(e=>e.kind==='review').length,correctCount:0,totalCount:Object.keys(day.entries).length,durationSeconds:0}))] : sessions
  const days = recentSevenDays(chartSessions)
  const stages = summarizeStages(Object.values(progress), settings.learningLanguage === 'en' || spanish.enabled ? 7 : 5)
  const maxDay = Math.max(1, ...days.map((day) => day.count))
  const total = Object.keys(progress).length

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>进度</h1><span>连续 {spanish.enabled?calculateStreak(chartSessions):streak} 天</span></header>
    <LanguageSwitch />
    {!chartSessions.length ? <div className={styles.emptyState}><h2>完成第一次学习后，<br />这里会出现趋势</h2><p>每天几分钟，就能让记忆慢慢留下来。</p></div> : <>
      <section className={styles.chartSection}>
        <div className={styles.sectionHeading}><h2>最近 7 天</h2><span>共学习 {days.reduce((sum, day) => sum + day.count, 0)} 次</span></div>
        <div className={styles.barChart}>
          {days.map((day) => <div key={day.date} className={styles.dayBar}>
            <span className={styles.barValue}>{day.count || ''}</span>
            <i style={{ height: `${Math.max(4, day.count / maxDay * 100)}%` }} />
            <small>{new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(`${day.date}T12:00:00`))}</small>
          </div>)}
        </div>
      </section>
      <section className={styles.stageSection}>
        <div className={styles.sectionHeading}><h2>记忆阶段</h2><span>{total} 个已学词</span></div>
        {stages.map((count, index) => <div className={styles.stageRow} key={index}>
          <span>阶段 {index + 1}</span><i><b style={{ width: `${total ? count / total * 100 : 0}%` }} /></i><strong>{count}</strong>
        </div>)}
      </section>
    </>}
  </main>
}
