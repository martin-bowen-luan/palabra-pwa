import type { VocabularyEntry } from '../types'
import styles from '../styles/App.module.css'

export function WordRelations({ word }: { word: VocabularyEntry }) {
  if (word.language !== 'en' || !word.relatedTerms?.length && !word.specialForms?.length) return null
  return <div className={styles.wordRelations}>
    {word.relatedTerms?.length ? <div className={styles.relationRow}>近义词：{word.relatedTerms.join('、')}</div> : null}
    {word.specialForms?.length ? <div className={styles.relationRow}>特殊变形：{word.specialForms.map((item) => `${item.label} ${item.form}`).join('；')}</div> : null}
    {word.source?.url ? <a className={styles.relationSource} href={word.source.url} target="_blank" rel="noopener noreferrer">词形资料来源</a> : null}
  </div>
}
