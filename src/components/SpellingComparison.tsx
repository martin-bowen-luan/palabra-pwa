import { closestSpelling, spellingDiff } from '../domain/spellingDiff'
import type { VocabularyEntry } from '../types'
import styles from '../styles/App.module.css'

export function SpellingComparison({ input, word }: { input: string; word: VocabularyEntry }) {
  const expected = closestSpelling(input, word.term, word.spellingVariants)
  const parts = spellingDiff(input, expected)
  const missing = parts.filter(p => p.kind === 'missing').length
  const extra = parts.filter(p => p.kind === 'extra').length
  const changed = parts.filter(p => p.kind === 'changed').length
  return <div className={styles.spellingComparison} aria-label="拼写错误对比">
    <p>{[missing && `漏了 ${missing} 个字母`, extra && `多写 ${extra} 个字母`, changed && `${changed} 个字母写错`].filter(Boolean).join('，')}</p>
    <div><small>你的拼写</small><div lang="en" aria-label={`你的拼写：${input.trim() || '空白'}`}>{parts.map((p, i) => <span key={i} className={p.kind === 'equal' ? styles.diffEqual : styles.diffWrong}>{p.actual || '＿'}</span>)}</div></div>
    <div><small>正确拼写</small><div lang="en" aria-label={`正确拼写：${expected}`}>{parts.map((p, i) => <span key={i} className={p.kind === 'equal' ? styles.diffEqual : styles.diffExpected}>{p.expected || '·'}</span>)}</div></div>
  </div>
}
