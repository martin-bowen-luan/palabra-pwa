import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { toLocalDate } from '../domain/stats'
import styles from '../styles/App.module.css'
import { EnglishToday } from './EnglishToday'

export function TodayPage() {
  const { activeSession, dailyPlan, sessions, settings, startSession, startNextGroup, moreGroupsToday, streak } = useAppState()
  const navigate = useNavigate()
  const completedToday = sessions.some((session) => session.completed && session.date === toLocalDate(new Date()))
  const preview = dailyPlan.newWords[0] ?? dailyPlan.review[0]
  const completedNewToday = sessions.filter((session) => session.completed && session.date === toLocalDate(new Date()))
    .reduce((sum, session) => sum + session.newCount, 0)
  const completed = Math.min(settings.dailyNewWords, completedNewToday)
  const total = settings.dailyNewWords
  const groupTotal = (activeSession?.assignedNewCount ?? activeSession?.newWordIds.length ?? 0)
    + (activeSession?.assignedReviewCount ?? activeSession?.reviewWordIds.length ?? 0)
  const groupRemaining = activeSession?.phase === 'learn' ? activeSession.wordIds.length : activeSession?.practice
    ? new Set([...activeSession.practice.pendingIds, ...activeSession.practice.delayed.map((item) => item.wordId)]).size
    : groupTotal - (activeSession?.currentIndex ?? 0)

  const begin = async (extra = 0) => {
    const session = await startSession(extra)
    if (session) navigate('/study')
  }

  if (settings.learningLanguage === 'en') return <EnglishToday />

  return <main className={styles.page}>
    <header className={styles.brandHeader}>
      <span className={styles.brand}>palabra</span>
      <span className={styles.streak}><i />连续 {streak} 天</span>
    </header>
    <LanguageSwitch />

    <section className={styles.todayHero}>
      <p className={styles.date}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p>
      <h1>今天</h1>
      <div className={styles.assignment}>
        <strong>{settings.dailyNewWords} 个新词</strong>
        <span>还有 {dailyPlan.review.length} 个需要复习</span>
      </div>
      <div className={styles.progressLine} aria-label={`今日进度 ${completed}/${total}`}>
        <span style={{ width: `${total ? Math.min(100, completed / total * 100) : 100}%` }} />
      </div>
      <div className={styles.progressMeta}><span>今日进度</span><strong>{completed} / {total}</strong></div>
      {activeSession && <div className={styles.progressMeta}><span>本组进度</span><strong>{Math.max(0, groupTotal - groupRemaining)} / {groupTotal}</strong></div>}
      {activeSession ? (
        <button className={styles.primaryButton} onClick={() => navigate('/study')}>继续今天的学习</button>
      ) : completedToday && moreGroupsToday ? (
        <button className={styles.primaryButton} onClick={() => void startNextGroup().then((group) => { if (group) navigate('/study') })}>开始下一组</button>
      ) : completedToday ? (
        <>
          <button className={styles.primaryButton} disabled>今日已完成</button>
          <button className={styles.textButton} onClick={() => void begin(5)}>再学 5 个</button>
        </>
      ) : (
        <button className={styles.primaryButton} onClick={() => void begin()}>开始今天的学习</button>
      )}
    </section>

    {preview && <section className={styles.wordPreview} aria-label="今天会遇见的词">
      <p>今天会遇见的一个词</p>
      <strong>{preview.term}</strong>
      <span>{preview.partOfSpeech} · {preview.meaningZh}</span>
    </section>}
  </main>
}
