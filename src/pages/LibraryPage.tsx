import { useMemo, useState } from 'react'
import type { VocabularyEntry } from '../types'
import { BackIcon, SearchIcon } from '../components/Icons'
import { useAppState } from '../app/AppState'
import styles from '../styles/App.module.css'

export function LibraryPage() {
  const { categories, progress, vocabulary } = useAppState()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [selected, setSelected] = useState<VocabularyEntry>()
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    return vocabulary.filter((word) =>
      (category === '全部' || word.category === category) &&
      (!needle || word.spanish.toLocaleLowerCase('es').includes(needle) || word.chinese.includes(needle)),
    )
  }, [category, query])

  if (selected) {
    const stage = progress[selected.id]?.stage
    return <main className={styles.page}>
      <button className={styles.backButton} onClick={() => setSelected(undefined)}><BackIcon />返回词库</button>
      <section className={styles.wordDetail}>
        <p>{selected.category}</p>
        <h1>{selected.spanish}</h1>
        <span className={styles.annotationLine} />
        <div><span>{selected.partOfSpeech}</span><strong>{selected.chinese}</strong></div>
        <blockquote lang="es">{selected.example}</blockquote>
        <p>{selected.exampleZh}</p>
        <footer>{stage === undefined ? '还没有学习' : `记忆阶段 ${stage + 1} / 5`}</footer>
      </section>
    </main>
  }

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>词库</h1><span>{vocabulary.length} 个词</span></header>
    <label className={styles.searchBox}>
      <SearchIcon />
      <input type="search" aria-label="搜索词库" placeholder="搜索西语或中文" value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    <div className={styles.categoryRail} aria-label="词库分类">
      {categories.map((item) => <button key={item} className={category === item ? styles.categoryActive : ''} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className={styles.dictionaryList}>
      {filtered.map((word) => <button key={word.id} className={styles.dictionaryRow} onClick={() => setSelected(word)}>
        <span><strong>{word.spanish}</strong><small>{word.partOfSpeech}</small></span>
        <span>{word.chinese}</span>
      </button>)}
      {!filtered.length && <div className={styles.emptyState}><h2>没有找到这个词</h2><p>换一个西语或中文关键词试试。</p></div>}
    </div>
  </main>
}
