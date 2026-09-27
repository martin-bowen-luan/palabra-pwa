import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { toLocalDate } from '../domain/stats'
import type { StudyMode } from '../types'
import styles from '../styles/App.module.css'

export function EnglishToday() {
  const { activeSession, dailyPlan, progress, sessions, settings, streak, startSession } = useAppState()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const learned = sessions.filter(s => s.completed && s.date === toLocalDate(new Date())).reduce((n, s) => n + s.newCount, 0)
  const remaining = Math.min(dailyPlan.newWords.length, Math.max(0, settings.dailyNewWords - learned))
  const priorityCount = dailyPlan.review.filter(w => progress[w.id]?.reviewPriority === 'skipped').length
  const begin = async (mode: StudyMode, extra = 0) => {
    if (busy) return
    setBusy(true); setError('')
    try { if (await startSession(extra, mode)) navigate('/study') }
    catch { setError('未能保存学习进度，请重试。') }
    finally { setBusy(false) }
  }
  return <main className={styles.page}>
    <header className={styles.brandHeader}><span className={styles.brand}>palabra</span><span className={styles.streak}><i />连续 {streak} 天</span></header>
    <LanguageSwitch />
    <section className={styles.todayHero}>
      <p className={styles.date}>{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())}</p>
      <h1>今天，记住一点。</h1>
      <p className={styles.homeNote}>每组最多 10 个词，四关循序记忆。</p>
      <div className={styles.progressLine} aria-label={`今日新词 ${Math.min(learned, settings.dailyNewWords)}/${settings.dailyNewWords}`}><span style={{ width: `${Math.min(100, learned / settings.dailyNewWords * 100)}%` }} /></div>
      <div className={styles.progressMeta}><span>今日已学</span><strong>{learned} / {settings.dailyNewWords}</strong></div>
      {activeSession && <div className={styles.resumeStudy}><p>{activeSession.mode === 'review' ? '复习' : '学习'}小组尚未完成，已保存到上一次作答。</p><button className={styles.primaryButton} onClick={() => navigate('/study')}>继续{activeSession.mode === 'review' ? '复习' : '学习'}</button></div>}
      <div className={styles.studyEntrances}>
        <section><h2>学习</h2><strong>{remaining}<small> 个新词</small></strong><p>识义、例句、回忆、拼写</p><button disabled={busy || Boolean(activeSession) || !remaining} onClick={() => void begin('learn')}>{remaining ? '开始学习' : '今日已完成'}</button></section>
        <section><h2>复习</h2><strong>{dailyPlan.review.length}<small> 个到期</small></strong><p>{priorityCount ? `其中 ${priorityCount} 个跳过词优先` : '按遗忘风险安排顺序'}</p><button disabled={busy || Boolean(activeSession) || !dailyPlan.review.length} onClick={() => void begin('review')}>{dailyPlan.review.length ? '开始复习' : '暂时没有到期词'}</button></section>
      </div>
      {!remaining && !activeSession && dailyPlan.newWords.length > 0 && <button className={styles.textButton} disabled={busy} onClick={() => void begin('learn', 5)}>再学 5 个</button>}
      {error && <p role="alert" className={styles.inlineNotice}>{error}</p>}
    </section>
    <Link to="/wordle" className={styles.wordleEntry}><span>Wordle 猜词</span><small>五个字母，六次机会 · 随时来一局</small></Link>
    <section className={styles.wordPreview}><p>让记忆慢慢变牢</p><span>新词短时间内回访，记住后逐步拉长间隔。拼写跳过的词会较早回来，标为熟练的词不再复习。</span></section>
  </main>
}
