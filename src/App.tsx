import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppStateProvider, useAppState } from './app/AppState'
import { BottomNav } from './components/BottomNav'
import type { PalabraStorage } from './data/storage'
import { LibraryPage } from './pages/LibraryPage'
import { ProgressPage } from './pages/ProgressPage'
import { ResultPage } from './pages/ResultPage'
import { SettingsPage } from './pages/SettingsPage'
import { StudyPage } from './pages/StudyPage'
import { TodayPage } from './pages/TodayPage'
import styles from './styles/App.module.css'

function AppRoutes() {
  const { loadError, ready } = useAppState()
  const location = useLocation()
  const immersive = location.pathname === '/study' || location.pathname === '/result'
  if (loadError) return <main className={styles.loadError}>
    <span className={styles.brand}>palabra</span>
    <div><h1>{loadError}</h1><p>请刷新页面重试，或检查浏览器是否允许本地存储。</p></div>
    <button className={styles.primaryButton} onClick={() => window.location.reload()}>刷新页面</button>
  </main>
  if (!ready) return <div className={styles.loading}><span>palabra</span><i /></div>
  return <div className={styles.appShell}>
    <Routes>
      <Route path="/today" element={<TodayPage />} />
      <Route path="/study" element={<StudyPage />} />
      <Route path="/result" element={<ResultPage />} />
      <Route path="/library" element={<LibraryPage />} />
      <Route path="/progress" element={<ProgressPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/today" replace />} />
    </Routes>
    {!immersive && <BottomNav />}
  </div>
}

export default function App({ storageClient }: { storageClient?: PalabraStorage }) {
  return <AppStateProvider storageClient={storageClient}><AppRoutes /></AppStateProvider>
}
