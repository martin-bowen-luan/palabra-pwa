import type { VocabularyEntry, VocabularyExample } from '../types'
import styles from '../styles/App.module.css'

export function EditorialExampleNote({ example }: { example?: VocabularyExample }) {
  return example?.sourceId?.startsWith('editorial:cfa:')
    ? <small className={styles.bookNote}>自编例句 · Palabra 编辑补充</small> : null
}

export function EditorialMeaningNote({ word }: { word: VocabularyEntry }) {
  return word.category === 'CFA 一级必备词汇' && word.senses?.[0]?.source?.provider === 'Palabra 编辑补充'
    ? <small className={styles.bookNote}>释义经编辑补充</small> : null
}
