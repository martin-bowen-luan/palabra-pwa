import { useEffect, useMemo, useState } from 'react'
import type { VocabularyEntry } from '../types'
import { BackIcon, SearchIcon } from '../components/Icons'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { PronunciationButton } from '../components/PronunciationButton'
import { WordRelations } from '../components/WordRelations'
import { useAppState } from '../app/AppState'
import styles from '../styles/App.module.css'

export function LibraryPage() {
  const { categories, progress, settings, vocabulary } = useAppState()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [selected, setSelected] = useState<VocabularyEntry>()
  const [visibleCount, setVisibleCount] = useState(80)
  const [view, setView] = useState<'all' | 'learned'>('all')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    return vocabulary.filter((word) =>
      (view === 'all' || Boolean(progress[word.id])) &&
      (category === '全部' || word.category === category) &&
      (!needle || word.term.toLocaleLowerCase(word.language).includes(needle) || word.meaningZh.includes(needle) || word.spellingVariants?.some((variant) => variant.toLocaleLowerCase('en').includes(needle))),
    )
  }, [category, progress, query, view, vocabulary])
  useEffect(() => {
    setVisibleCount(80)
    setCategory('全部')
    setSelected(undefined)
    setView('all')
  }, [settings.learningLanguage])
  useEffect(() => setVisibleCount(80), [category, query, view])
  const visibleWords = filtered.slice(0, visibleCount)

  if (selected) {
    const stage = progress[selected.id]?.stage
    return <main className={styles.page}>
      <button className={styles.backButton} onClick={() => setSelected(undefined)}><BackIcon />返回词库</button>
      <section className={styles.wordDetail}>
        <p>{selected.category}</p>
        <h1>{selected.term}</h1>
        {selected.language === 'en' && <div className={styles.pronunciationRow}>
          <span>{selected.pronunciation?.ipa || '美式发音'}</span>
          <PronunciationButton word={selected} />
        </div>}
        <span className={styles.annotationLine} />
        <div><span>{selected.partOfSpeech}</span><strong>{selected.meaningZh}</strong></div>
        <WordRelations word={selected} />
        {selected.examples.slice(0, 3).map((example) => <div className={styles.examplePair} key={`${example.text}-${example.translationZh}`}>
          <blockquote lang={selected.language}>{example.text}</blockquote>
          <p>{example.translationZh}</p>
        </div>)}
        <footer>{progress[selected.id]?.skipReview ? '已标为熟练 · 无需复习' : stage === undefined ? '还没有学习' : `记忆阶段 ${stage + 1} / 5`}</footer>
      </section>
    </main>
  }

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>词库</h1><span>{vocabulary.length} 个词</span></header>
    <LanguageSwitch />
    <div className={styles.libraryViews} role="group" aria-label="词库范围">
      <button type="button" className={view === 'all' ? styles.libraryViewActive : ''} aria-pressed={view === 'all'} onClick={() => setView('all')}>全部</button>
      <button type="button" className={view === 'learned' ? styles.libraryViewActive : ''} aria-pressed={view === 'learned'} onClick={() => setView('learned')}>已背</button>
    </div>
    <label className={styles.searchBox}>
      <SearchIcon />
      <input type="search" aria-label="搜索词库" placeholder={settings.learningLanguage === 'en' ? '搜索英语或中文' : '搜索西语或中文'} value={query} onChange={(event) => setQuery(event.target.value)} />
    </label>
    <div className={styles.categoryRail} aria-label="词库分类">
      {categories.map((item) => <button key={item} className={category === item ? styles.categoryActive : ''} onClick={() => setCategory(item)}>{item}</button>)}
    </div>
    <div className={styles.dictionaryList}>
      {visibleWords.map((word) => <button key={word.id} className={styles.dictionaryRow} onClick={() => setSelected(word)}>
        <span><strong>{word.term}</strong><small>{word.partOfSpeech}</small></span>
        <span>{word.meaningZh}</span>
      </button>)}
      {visibleCount < filtered.length && <button className={styles.loadMoreButton} onClick={() => setVisibleCount((count) => count + 80)}>显示更多</button>}
      {!filtered.length && <div className={styles.emptyState}>
        <h2>{view === 'learned' && !Object.keys(progress).length ? '还没有背过单词' : '没有找到这个词'}</h2>
        <p>{view === 'learned' && !Object.keys(progress).length ? '开始学习后，背过的词会出现在这里。' : '换一个关键词或分类试试。'}</p>
      </div>}
    </div>
  </main>
}
