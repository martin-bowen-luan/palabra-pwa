import { useAppState } from '../app/AppState'
import type { LearningLanguage } from '../types'
import styles from '../styles/App.module.css'

const languages: Array<{ value: LearningLanguage; label: string }> = [
  { value: 'es', label: '西班牙语' },
  { value: 'en', label: '英语' },
]

export function LanguageSwitch() {
  const { settings, setLearningLanguage } = useAppState()
  return <div className={styles.languageSwitch} aria-label="学习语言">
    {languages.map((language) => <button
      key={language.value}
      type="button"
      aria-pressed={settings.learningLanguage === language.value}
      className={settings.learningLanguage === language.value ? styles.languageActive : ''}
      onClick={() => void setLearningLanguage(language.value)}
    >{language.label}</button>)}
  </div>
}
