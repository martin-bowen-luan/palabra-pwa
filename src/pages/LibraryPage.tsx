import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { BackIcon, SearchIcon } from '../components/Icons'
import { LanguageSwitch } from '../components/LanguageSwitch'
import { PronunciationButton } from '../components/PronunciationButton'
import { WordRelations } from '../components/WordRelations'
import { SentenceSpeechButton } from '../components/SentenceSpeechButton'
import { useAi } from '../ai/AiProvider'
import { useAppState } from '../app/AppState'
import { pronunciationPlayer } from '../audio/pronunciation'
import styles from '../styles/App.module.css'
import { SpanishDictionary, groupSpanishResults } from '../spanish/SpanishDictionary'
import spanishStyles from '../spanish/Spanish.module.css'
import { WordbookSwitch } from '../wordbooks/WordbookSwitch'
import { PrimaryRangeFilter } from '../wordbooks/PrimaryRangeFilter'
import { projectWordbook } from '../wordbooks/catalog'
import type { PrimaryRange } from '../wordbooks/types'

export function LibraryPage() {
  const { categories, progress, settings, vocabulary, bookVocabulary,selectedWordbook,wordbooks } = useAppState()
  const [range,setRange]=useState<PrimaryRange>({})
  const { settings: aiSettings } = useAi()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部')
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const selectedId = searchParams.get('word')
  const contextBook=wordbooks.find(b=>b.id===searchParams.get('book'))??selectedWordbook
  const selected = (contextBook&&settings.learningLanguage==='en'?projectWordbook(vocabulary,contextBook).find(word=>word.id===selectedId):undefined)??vocabulary.find(word => word.id === selectedId)
  const browseWords=useMemo(()=>settings.learningLanguage==='en'&&selectedWordbook?.id==='en-oxford-primary'?projectWordbook(vocabulary,selectedWordbook,range):bookVocabulary,[vocabulary,bookVocabulary,selectedWordbook,range,settings.learningLanguage])
  const heading = useRef<HTMLHeadingElement>(null)
  const from = location.state?.wordLinkFrom
  const backLabel = from === '/study' ? '返回学习' : typeof from === 'string' && from.startsWith('/library?') ? '返回上一词' : '返回词库'
  const goBack = () => {
    if (from === '/study' || from === '/library' || typeof from === 'string' && from.startsWith('/library?')) navigate(-1)
    else navigate('/library', { replace: true })
  }
  const [visibleCount, setVisibleCount] = useState(80)
  const [view, setView] = useState<'all' | 'learned'>('all')
  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase('es')
    return browseWords.filter((word) =>
      (view === 'all' || Boolean(progress[word.id])) &&
      (category === '全部' || word.category === category) &&
      (!needle || word.term.toLocaleLowerCase(word.language).includes(needle) || word.meaningZh.includes(needle) || word.spanishData?.lemma.toLocaleLowerCase('es').includes(needle) || word.spanishData?.grammarLabel.includes(needle) || word.spellingVariants?.some((variant) => variant.toLocaleLowerCase('en').includes(needle))),
    )
  }, [category, progress, query, view, browseWords])
  useEffect(() => {
    setVisibleCount(80)
    setCategory('全部')
    setView('all')
    setQuery('');setRange({})
  }, [settings.learningLanguage,settings.englishWordbook])
  useEffect(() => setVisibleCount(80), [category, query, view,range])
  useEffect(() => () => pronunciationPlayer.stop(), [selectedId])
  useEffect(() => {
    heading.current?.focus({ preventScroll: true })
    heading.current?.closest('main')?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [selectedId])
  const visibleWords = filtered.slice(0, visibleCount)
  const spanishGroups = settings.learningLanguage === 'es' && vocabulary.some(word=>word.spanishData) ? groupSpanishResults(filtered) : undefined

  if (selectedId && !selected) return <main className={styles.page}>
    <button className={styles.backButton} onClick={goBack}><BackIcon />{backLabel}</button>
    <div className={styles.emptyState}><h1>词库未收录这个词</h1><p>请返回词库搜索当前语言的词汇。</p></div>
  </main>

  if (selected) {
    const stage = progress[selected.id]?.stage
    return <main className={styles.page}>
      <button className={styles.backButton} onClick={goBack}><BackIcon />{backLabel}</button>
      <section className={styles.wordDetail}>
        <p>{selected.category}</p>
        {selected.language==='en'&&!bookVocabulary.some(w=>w.id===selected.id)&&<p className={styles.bookNote}>当前词书未收录 · 记忆仍与英语词库共享</p>}
        <h1 ref={heading} tabIndex={-1} lang={selected.language}>{selected.term}</h1>
        {selected.language === 'en' && <div className={styles.pronunciationRow}>
          <span>{selected.pronunciation?.ipa || '美式发音'}</span>
          <PronunciationButton word={selected} />
        </div>}
        <span className={styles.annotationLine} />
        <div><span>{selected.partOfSpeech}</span><strong>{selected.meaningZh}</strong></div>
        {selected.examples.slice(0, 3).map((example) => <div className={styles.examplePair} key={`${example.text}-${example.translationZh}`}>
          <blockquote lang={selected.language}>{example.text}</blockquote>
          {aiSettings.enabled && selected.language === 'en' && <SentenceSpeechButton text={example.text} />}
          <p>{example.translationZh}</p>
        </div>)}
        <WordRelations key={selected.id} word={selected} vocabulary={vocabulary} bookContext={contextBook?.id==='en-oxford-primary'?contextBook.id:undefined} />
        <SpanishDictionary word={selected} vocabulary={vocabulary} progress={progress} select={id=>setSearchParams({word:id},{state:{wordLinkFrom:location.pathname+location.search}})} />
        <footer>{progress[selected.id]?.skipReview ? '已标为熟练 · 无需复习' : stage === undefined ? '还没有学习' : `记忆阶段 ${stage + 1} / ${progress[selected.id]?.scheduleVersion === 1 ? 7 : 5}`}{progress[selected.id]?.reviewPriority === 'skipped' && ' · 拼写跳过，优先复习'}</footer>
      </section>
    </main>
  }

  return <main className={styles.page}>
    <header className={styles.pageHeader}><h1>词库</h1><span>{bookVocabulary.length} 个词</span></header>
    <LanguageSwitch />
    <WordbookSwitch />
    {settings.learningLanguage==='en'&&selectedWordbook?.id==='en-oxford-primary'&&<PrimaryRangeFilter value={range} onChange={setRange} label="浏览"/>}
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
      {spanishGroups ? spanishGroups.slice(0,visibleCount).map(group=>group.words.length===1?<button key={group.term} className={`${styles.dictionaryRow} ${spanishStyles.resultRow}`} onClick={()=>setSearchParams({word:group.words[0].id},{state:{wordLinkFrom:'/library'}})}><span><strong>{group.term}</strong><small>{group.words[0].spanishData?.grammarLabel??group.words[0].partOfSpeech}</small></span><span>{group.words[0].meaningZh}</span></button>:<details key={group.term} className={spanishStyles.searchGroup}><summary><strong lang="es">{group.term}</strong><span>{group.words.length} 种语法用法</span></summary>{group.words.map(word=><button key={word.id} className={spanishStyles.formRow} onClick={()=>setSearchParams({word:word.id},{state:{wordLinkFrom:'/library'}})}><strong>{word.meaningZh}</strong><span>{word.spanishData?.lemma} · {word.spanishData?.grammarLabel}</span></button>)}</details>) : visibleWords.map((word) => <button key={word.id} className={styles.dictionaryRow} onClick={() => setSearchParams({ word: word.id }, { state: { wordLinkFrom: '/library' } })}>
        <span><strong>{word.term}</strong><small>{word.partOfSpeech}</small></span>
        <span>{word.meaningZh}</span>
      </button>)}
      {visibleCount < (spanishGroups?.length??filtered.length) && <button className={styles.loadMoreButton} onClick={() => setVisibleCount((count) => count + 80)}>显示更多</button>}
      {!filtered.length && <div className={styles.emptyState}>
        <h2>{view === 'learned' && !Object.keys(progress).length ? '还没有背过单词' : '没有找到这个词'}</h2>
        <p>{view === 'learned' && !Object.keys(progress).length ? '开始学习后，背过的词会出现在这里。' : '换一个关键词或分类试试。'}</p>
      </div>}
    </div>
  </main>
}
