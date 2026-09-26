import { useId, useState } from 'react'
import type { VocabularyEntry } from '../types'
import styles from '../styles/App.module.css'

export function WordRelations({ word, vocabulary = [], onSelectTerm }: { word: VocabularyEntry; vocabulary?: VocabularyEntry[]; onSelectTerm?: (word: VocabularyEntry) => void }) {
  const tabs = ['派生词', '词根', '近义词', '特殊变形'] as const
  const [tab, setTab] = useState<typeof tabs[number]>(word.relatedTerms?.length ? '近义词' : word.derivedTerms?.length ? '派生词' : word.roots?.length ? '词根' : '特殊变形')
  const id = useId()
  if (word.language !== 'en') return null
  const terms = tab === '派生词' ? word.derivedTerms : word.relatedTerms
  return <div className={styles.wordRelations}>
    <div role="tablist" aria-label="词汇拓展" className={styles.relationTabs}>{tabs.map((label, index) => <button key={label} type="button" role="tab" id={`${id}-${index}`} aria-controls={`${id}-panel`} aria-selected={tab === label} tabIndex={tab === label ? 0 : -1} onClick={() => setTab(label)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4
      setTab(tabs[next]); document.getElementById(`${id}-${next}`)?.focus()
    }}>{label}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tabs.indexOf(tab)}`} className={styles.relationPanel}>
      {tab === '派生词' || tab === '近义词' ? terms?.length ? terms.map(term => {
        const target = vocabulary.find(w => w.term === term)
        return <div key={term} className={styles.relationRow}>{target && onSelectTerm ? <button className={styles.quietButton} onClick={() => onSelectTerm(target)}><strong lang="en">{term}</strong></button> : <strong lang="en">{term}</strong>}{target && <p>{target.meaningZh}</p>}</div>
      }) : <p>暂未收录这个词的{tab}。</p> : null}
      {tab === '词根' && (word.roots?.length ? <><p>词基与词缀，帮助理解构词。</p>{word.roots.map(root => <div key={root.part} className={styles.relationRow}><strong lang="en">{root.part}</strong><p>{root.meaningZh}</p></div>)}</> : <p>暂未收录可靠的词根资料。</p>)}
      {tab === '特殊变形' && (word.specialForms?.length ? word.specialForms.map(form => <div className={styles.relationRow} key={`${form.label}-${form.form}`}>{form.label} <strong lang="en">{form.form}</strong></div>) : <p>暂未收录特殊变形。</p>)}
      {(tab === '派生词' || tab === '词根') && word.relationSourceUrls?.length ? <details><summary>资料来源与许可</summary>{word.relationSourceUrls.map((url, index) => <div key={url}><a href={url} target="_blank" rel="noopener noreferrer">Wiktionary 资料 {index + 1}</a></div>)}<p>Wiktionary contributors · CC BY-SA 4.0。构词成分据来源整理，中文提示取自本词库或词缀释义。</p></details> : null}
      {(tab === '近义词' || tab === '特殊变形') && word.source?.url ? <a href={word.source.url} target="_blank" rel="noopener noreferrer">词形资料来源</a> : null}
    </div>
  </div>
}
