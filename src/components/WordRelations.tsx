import { useId, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import type { VocabularyEntry } from '../types'
import styles from '../styles/App.module.css'
import { useWordAi } from '../ai/AiProvider'
import { mergeRelations, relationKey } from '../ai/merge'

export function WordRelations({ word, vocabulary = [] }: { word: VocabularyEntry; vocabulary?: VocabularyEntry[] }) {
  const location = useLocation()
  const tabs = ['派生词', '词根', '近义词', '特殊变形'] as const
  const [tab, setTab] = useState<typeof tabs[number]>(word.relatedTerms?.length ? '近义词' : word.derivedTerms?.length ? '派生词' : word.roots?.length ? '词根' : '特殊变形')
  const id = useId()
  const ai = useWordAi(word)
  if (word.language !== 'en') return null
  const section = tab === '派生词' ? 'derived' : tab === '词根' ? 'roots' : 'synonyms'
  const rows = mergeRelations(word, ai.analysis?.result, section, vocabulary)
  return <div className={styles.wordRelations}>
    {ai.enabled && <section className={styles.aiMeta} aria-label="AI 分析状态">
      <p role="status">{ai.loading ? '正在分析这个词，原词典资料仍可查看…' : ai.message || (ai.analysis ? 'AI 补充仅供参考，未经词典核实。' : '')}</p>
      {ai.analysis && <small>{ai.analysis.model} · {new Date(ai.analysis.generatedAt).toLocaleString('zh-CN')}</small>}
      <div><button disabled={ai.loading} onClick={ai.regenerate}>{ai.analysis ? '重新分析（会产生用量）' : '重新分析'}</button>{ai.analysis && <button onClick={() => void ai.remove()}>删除此词 AI 分析</button>}</div>
    </section>}
    <div role="tablist" aria-label="词汇拓展" className={styles.relationTabs}>{tabs.map((label, index) => <button key={label} type="button" role="tab" id={`${id}-${index}`} aria-controls={`${id}-panel`} aria-selected={tab === label} tabIndex={tab === label ? 0 : -1} onClick={() => setTab(label)} onKeyDown={event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4
      setTab(tabs[next]); document.getElementById(`${id}-${next}`)?.focus()
    }}>{label}</button>)}</div>
    <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tabs.indexOf(tab)}`} className={styles.relationPanel}>
      {tab !== '特殊变形' && <>
        {tab === '词根' && rows.length > 0 && <p>词基与词缀，帮助理解构词。</p>}
        {rows.map(row => {
          const key = relationKey(row.term)
          const target = vocabulary.find(w => w.language === word.language && relationKey(w.term) === key)
            ?? vocabulary.find(w => w.language === word.language && w.spellingVariants?.some(variant => relationKey(variant) === key))
          return <div key={row.term} className={styles.relationRow}>
            {target && tab !== '词根' ? <Link className={styles.relationLink} to={`/library?${new URLSearchParams({ word: target.id })}`} state={{ wordLinkFrom: location.pathname + location.search }}><strong lang="en">{row.term}</strong></Link> : <strong lang="en">{row.term}</strong>}
            {row.dictionary && <>{ai.enabled && <small className={styles.aiSource}>词库资料</small>}{row.meaningZh && <p>{row.meaningZh}</p>}</>}
            {(row.aiMeaning || row.explanation || row.conflictNote) && <div className={styles.aiSupplement}>
              <small>{row.conflict ? 'AI 不同分析，未核实' : row.kind === 'mnemonic' ? 'AI 记忆联想，非词源' : 'AI 补充，未核实'}</small>
              {row.partOfSpeech && <small> · {row.partOfSpeech}</small>}
              {row.kind && row.kind !== 'mnemonic' && <small> · {{ root: '词根', prefix: '前缀', suffix: '后缀', base: '词基' }[row.kind as 'root' | 'prefix' | 'suffix' | 'base']}</small>}
              {row.aiMeaning && row.aiMeaning !== row.meaningZh && <p>{row.aiMeaning}</p>}
              {row.explanation && <p>{row.explanation}</p>}{row.conflictNote && <p>{row.conflictNote}</p>}
            </div>}
          </div>
        })}
        {!rows.length && <p>{tab === '词根' ? '暂未收录可靠的词根资料。' : `暂未收录这个词的${tab}。`}</p>}
      </>}
      {tab === '特殊变形' && (word.specialForms?.length ? word.specialForms.map(form => <div className={styles.relationRow} key={`${form.label}-${form.form}`}>{form.label} <strong lang="en">{form.form}</strong></div>) : <p>暂未收录特殊变形。</p>)}
      {(tab === '派生词' || tab === '词根') && word.relationSourceUrls?.length ? <details><summary>资料来源与许可</summary>{word.relationSourceUrls.map((url, index) => <div key={url}><a href={url} target="_blank" rel="noopener noreferrer">Wiktionary 资料 {index + 1}</a></div>)}<p>Wiktionary contributors · CC BY-SA 4.0。构词成分据来源整理，中文提示取自本词库或词缀释义。</p></details> : null}
      {(tab === '近义词' || tab === '特殊变形') && word.source?.url ? <a href={word.source.url} target="_blank" rel="noopener noreferrer">词形资料来源</a> : null}
    </div>
  </div>
}
