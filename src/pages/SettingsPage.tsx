import { useState } from 'react'
import { useAppState } from '../app/AppState'
import type { ThemeMode, UserSettings } from '../types'
import styles from '../styles/App.module.css'

const goals: UserSettings['dailyNewWords'][] = [5, 10, 15, 20]
const themes: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '自动' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' },
]

export function SettingsPage() {
  const { settings, updateSettings, clearLearningData } = useAppState()
  const [confirming, setConfirming] = useState(false)

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>设置</h1></header>
    <section className={styles.settingsSection}>
      <div className={styles.settingTitle}><h2>每日新词</h2><span>按自己的节奏学习</span></div>
      <div className={styles.segmented}>
        {goals.map((goal) => <button key={goal} className={settings.dailyNewWords === goal ? styles.segmentActive : ''} onClick={() => void updateSettings({ dailyNewWords: goal })}>{goal}</button>)}
      </div>
    </section>
    <section className={styles.settingsSection}>
      <div className={styles.settingTitle}><h2>测试题型</h2><span>至少保留一种</span></div>
      <label className={styles.toggleRow}><span><strong>中西互选</strong><small>识别词义</small></span><input type="checkbox" checked={settings.enableChoice} disabled={settings.enableChoice && !settings.enableSpelling} onChange={(event) => void updateSettings({ enableChoice: event.target.checked })} /></label>
      <label className={styles.toggleRow}><span><strong>西语拼写</strong><small>主动回忆</small></span><input type="checkbox" checked={settings.enableSpelling} disabled={settings.enableSpelling && !settings.enableChoice} onChange={(event) => void updateSettings({ enableSpelling: event.target.checked })} /></label>
    </section>
    <section className={styles.settingsSection}>
      <div className={styles.settingTitle}><h2>界面主题</h2></div>
      <div className={styles.themeOptions}>
        {themes.map((theme) => <label key={theme.value}><input type="radio" name="theme" value={theme.value} checked={settings.theme === theme.value} onChange={() => void updateSettings({ theme: theme.value })} /><span>{theme.label}</span></label>)}
      </div>
    </section>
    <section className={styles.dangerSection}>
      <h2>学习数据</h2>
      {!confirming ? <button onClick={() => setConfirming(true)}>清空学习记录</button> : <div className={styles.confirmClear}><p>这会删除进度和打卡记录，设置会保留。</p><button onClick={() => { void clearLearningData(); setConfirming(false) }}>确认清空</button><button onClick={() => setConfirming(false)}>取消</button></div>}
    </section>
  </main>
}
