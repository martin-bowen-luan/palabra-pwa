import { useState } from 'react'
import { useAppState } from '../app/AppState'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { AudioPackSettings } from '../components/AudioPackSettings'
import { AiSettingsPanel } from '../components/AiSettingsPanel'
import { GroupSettingsPanel } from '../groups/GroupAdmin'
import type { ThemeMode, UserSettings } from '../types'
import styles from '../styles/App.module.css'
import { useSpanish } from '../spanish/SpanishProvider'
import { WordbookSwitch } from '../wordbooks/WordbookSwitch'

const goals: UserSettings['dailyNewWords'][] = [5, 10, 15, 20]
const themes: Array<{ value: ThemeMode; label: string }> = [
  { value: 'system', label: '自动' }, { value: 'light', label: '浅色' }, { value: 'dark', label: '深色' },
]

export function SettingsPage() {
  const { settings, updateSettings, clearLearningData } = useAppState()
  const [confirming, setConfirming] = useState(false)
  const spanish = useSpanish()

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>设置</h1></header>
    <LanguageSwitch />
    <WordbookSwitch />
    <section className={styles.settingsSection}>
      <div className={styles.settingTitle}><h2>{spanish.enabled?'西语每日总量':'每日新词'}</h2><span>{spanish.enabled?'新词形与复习合计，可不完成':'按自己的节奏学习'}</span></div>
      <div className={styles.segmented}>
        {spanish.enabled ? ([10,20,30,50] as const).map(goal=><button key={goal} aria-pressed={(settings.spanishDailyGoal??50)===goal} className={(settings.spanishDailyGoal??50)===goal?styles.segmentActive:''} onClick={()=>void updateSettings({spanishDailyGoal:goal})}>{goal}</button>) : goals.map((goal) => <button key={goal} className={settings.dailyNewWords === goal ? styles.segmentActive : ''} onClick={() => void updateSettings({ dailyNewWords: goal })}>{goal}</button>)}
      </div>
    </section>
    {settings.learningLanguage === 'en' && <AudioPackSettings />}
    {settings.learningLanguage === 'en' && settings.englishWordbook === 'en-cfa-level1' && <section className={styles.settingsSection}>
      <h2>CFA 词书来源</h2>
      <p className={styles.settingDescription}>根据所提供的新东方在线词典整理，收录 1,152 个单词与短语。包含通用义项，并非 CFA 官方教材；专业用法请结合课程教材核对。</p>
      <p className={styles.settingDescription}>部分释义和例句由 AI 辅助编辑补充，并单独标注。已检查资料缺口及发现的误译，尚未对全部原始例句逐句人工审校。</p>
      <a href="https://www.koolearn.com/dict/tag_2716_1.html" target="_blank" rel="noopener noreferrer">原始词表</a> · <a href="https://github.com/martin-bowen-luan/palabra-pwa/blob/main/docs/cfa-editorial-review.md" target="_blank" rel="noopener noreferrer">补充与校订说明</a>
    </section>}
    <GroupSettingsPanel />
    {settings.learningLanguage === 'en' && <AiSettingsPanel />}
    {spanish.enabled && <section className={styles.settingsSection}><div className={styles.settingTitle}><h2>西语情境填词</h2></div><p className={styles.settingDescription}>在句子中练习词义、阴阳性和变位。每组最多 10 个，同一原词的新变化形式分散学习。</p><p className={styles.settingDescription}>复习间隔逐步延长：10 分钟、1 天、2 天、4 天、7 天、15 天、30 天。提示、答错或跳过后缩短间隔，跳过优先复习。</p></section>}
    {!spanish.enabled && <section className={styles.settingsSection}>
      {settings.learningLanguage === 'en' ? <><div className={styles.settingTitle}><h2>四关记忆</h2></div><p className={styles.settingDescription}>每组依次完成选择释义、例句回忆、无提示回忆和集中拼写。拼写可跳过，跳过词会优先复习。</p><p className={styles.settingDescription}>参考间隔：10 分钟、1 天、2 天、4 天、7 天、15 天、30 天。答错后缩短间隔，记住后逐渐延长。</p></> : <>
      <div className={styles.settingTitle}><h2>测试题型</h2><span>至少保留一种</span></div>
      <label className={styles.toggleRow}><span><strong>中西互选</strong><small>识别词义</small></span><input type="checkbox" checked={settings.enableChoice} disabled={settings.enableChoice && !settings.enableSpelling} onChange={(event) => void updateSettings({ enableChoice: event.target.checked })} /></label>
      <label className={styles.toggleRow}><span><strong>西语拼写</strong><small>主动回忆</small></span><input type="checkbox" checked={settings.enableSpelling} disabled={settings.enableSpelling && !settings.enableChoice} onChange={(event) => void updateSettings({ enableSpelling: event.target.checked })} /></label>
      </>}
    </section>
    }
    <section className={styles.settingsSection}>
      <div className={styles.settingTitle}><h2>界面主题</h2></div>
      <div className={styles.themeOptions}>
        {themes.map((theme) => <label key={theme.value}><input type="radio" name="theme" value={theme.value} checked={settings.theme === theme.value} onChange={() => void updateSettings({ theme: theme.value })} /><span>{theme.label}</span></label>)}
      </div>
    </section>
    <section className={styles.dangerSection}>
      <h2>学习数据</h2>
      {!confirming ? <button onClick={() => setConfirming(true)}>{settings.learningLanguage==='en'?'清空全部英语学习记录':'清空学习记录'}</button> : <div className={styles.confirmClear}><p>{settings.learningLanguage==='en'?'全部英语词书（高考、小学、CFA）共用记忆，都会重置。西语、词典、设置、AI 与 Wordle 会保留。':'这会删除本机西语进度与每日记录，设置会保留。'}小组共享历史不会删除，仍按原期限保留。</p><button onClick={() => { void clearLearningData(); setConfirming(false) }}>确认清空</button><button onClick={() => setConfirming(false)}>取消</button></div>}
    </section>
  </main>
}
