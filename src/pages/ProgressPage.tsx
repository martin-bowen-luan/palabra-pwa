import { useAppState } from '../app/AppState'
import { recentSevenDays, summarizeStages } from '../domain/stats'
import styles from '../styles/App.module.css'

export function ProgressPage() {
  const { progress, sessions, streak } = useAppState()
  const days = recentSevenDays(sessions)
  const stages = summarizeStages(Object.values(progress))
  const maxDay = Math.max(1, ...days.map((day) => day.count))
  const total = Object.keys(progress).length

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>进度</h1><span>连续 {streak} 天</span></header>
    {!sessions.length ? <div className={styles.emptyState}><h2>完成第一次学习后，<br />这里会出现趋势</h2><p>每天几分钟，就能让记忆慢慢留下来。</p></div> : <>
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
