import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { useSpanish } from './SpanishProvider'
import { spanishReviewsDeferred } from './course'
import styles from '../styles/App.module.css'

/** Category names come from the same dictionary list used by LibraryPage. */
export function SpanishCategorySwitch({ category, onSavingChange }: { category?: string; onSavingChange?: (saving: boolean) => void }) {
  const { categories, settings, activeSession, updateSettings } = useAppState()
  const { enabled } = useSpanish()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  if (!enabled) return null
  const selected = settings.spanishNewCategory ?? ''
  const save = async (value: string, openToday = false) => {
    setSaving(true); onSavingChange?.(true); setError('')
    try {
      await updateSettings({ spanishNewCategory: value })
      if (openToday) navigate('/today')
    } catch {
      setError('学习类别未保存，请重试。原有进度不受影响。')
    } finally { setSaving(false); onSavingChange?.(false) }
  }
  return <section aria-label="按类别学习">
    {category !== undefined ? <>
      <p className={styles.bookNote}>新词范围：{category}。不受搜索关键词或“已背”筛选影响。</p>
      <button type="button" className={styles.textButton} disabled={saving} onClick={() => void save(category === '全部' ? '' : category, true)}>{saving ? '正在保存…' : category === '全部' ? '学习全部类别' : '学习此类别'}</button>
    </> : <div className={styles.bookRange}>
      <label>新词学习类别<select value={selected} disabled={saving} onChange={event => void save(event.target.value)}>
        <option value="">全部</option>
        {selected && !categories.includes(selected) && <option value={selected}>{selected}（词库已无此类别）</option>}
        {categories.filter(item => item !== '全部').map(item => <option key={item} value={item}>{item}</option>)}
      </select></label>
    </div>}
    <p className={styles.bookNote}>{activeSession ? '当前组不变，类别从下一组生效。' : '新词按所选类别安排。'}{spanishReviewsDeferred(settings.spanishReviewDeferredOn)?'今天暂缓复习，复习记录保留。':'到期复习包含所有类别。'}</p>
    {error && <p role="alert" className={styles.inlineNotice}>{error}</p>}
  </section>
}
