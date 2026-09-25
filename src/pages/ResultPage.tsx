import { Navigate, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { toLocalDate } from '../domain/stats'
import styles from '../styles/App.module.css'

export function ResultPage() {
  const { sessions } = useAppState()
  const navigate = useNavigate()
  const session = [...sessions].reverse().find((item) => item.date === toLocalDate(new Date()))
  if (!session) return <Navigate to="/today" replace />
  const accuracy = session.totalCount ? Math.round(session.correctCount / session.totalCount * 100) : 0
  return <main className={styles.resultPage}>
    <div className={styles.completionMark}><span>✓</span></div>
    <p>今天完成了</p>
    <h1>{accuracy}%</h1>
    <span>测试正确率</span>
    <div className={styles.resultStats}>
      <div><strong>{session.newCount}</strong><span>新学词</span></div>
      <div><strong>{session.reviewCount}</strong><span>复习词</span></div>
      <div><strong>{session.newCount + session.reviewCount}</strong><span>下次会再见</span></div>
    </div>
    <button className={styles.primaryButton} onClick={() => navigate('/today')}>回到今日</button>
  </main>
}
