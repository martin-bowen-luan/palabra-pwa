import { useEffect, useState, useSyncExternalStore } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { BackIcon } from '../components/Icons'
import { storage as defaultStorage, type PalabraStorage } from '../data/storage'
import { initialWordleState, WordleController } from './controller'
import { keyboardColors, normalizeGuess } from './rules'
import type { LetterColor, WordleDictionaryEntry } from './types'
import styles from './WordlePage.module.css'

const noopSubscribe = () => () => {}
const initialSnapshot = () => initialWordleState
const colorNames: Record<LetterColor, string> = { correct: '位置正确', present: '位置不对', absent: '无匹配字母' }
const keyRows = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm']

function GuessDefinition({ entry }: { entry: WordleDictionaryEntry }) {
  return <><div className={styles.term}><h2 lang="en">{entry.term}</h2>{entry.ipa && <span>{entry.ipa}</span>}</div>
    {entry.source === 'wiktionary' && <small>英文释义</small>}
    {entry.definitions.slice(0, 3).map((definition, i) => <p key={i} lang={entry.source === 'wiktionary' ? 'en' : 'zh-CN'}><span>{definition.partOfSpeech}</span> {definition.text}</p>)}
    {entry.source === 'wiktionary' && <div className={styles.source}><a href={entry.sourceUrl} target="_blank" rel="noopener noreferrer">Wiktionary contributors · 词条版本 {entry.revisionId}</a><a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0 · 已提取纯文本</a></div>}
  </>
}

export function WordlePage({ storageClient = defaultStorage }: { storageClient?: PalabraStorage }) {
  const { setLearningLanguage } = useAppState()
  const navigate = useNavigate()
  const [controller, setController] = useState<WordleController>()
  const [selected, setSelected] = useState<number>()
  const [notice, setNotice] = useState('')
  useEffect(() => {
    const next = new WordleController(storageClient)
    setController(next); void next.initialize()
    return () => next.dispose()
  }, [storageClient])
  const state = useSyncExternalStore(controller?.subscribe ?? noopSubscribe, controller?.getSnapshot ?? initialSnapshot)
  const { game, draft, busy, error, loading } = state
  const finished = game?.status !== 'playing'
  useEffect(() => { setSelected(undefined); setNotice('') }, [game?.gameId, game?.guesses.length])
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (!controller || event.isComposing || event.ctrlKey || event.altKey || event.metaKey) return
      const target = event.target as HTMLElement
      if (target.matches('input,textarea') || target.isContentEditable) return
      if (event.key === 'Enter' && target.closest('button,a,summary') && !target.closest('[data-wordle-key]')) return
      const current = controller.getSnapshot()
      if (current.busy || current.game?.status !== 'playing') return
      if (/^[a-z]$/i.test(event.key)) { event.preventDefault(); void controller.edit(current.draft + event.key.toLowerCase()) }
      else if (event.key === 'Backspace') { event.preventDefault(); void controller.edit(current.draft.slice(0, -1)) }
      else if (event.key === 'Enter') { event.preventDefault(); void controller.submit() }
    }
    window.addEventListener('keydown', keydown)
    return () => window.removeEventListener('keydown', keydown)
  }, [controller])
  const entry = game?.guesses[selected ?? game.guesses.length - 1]?.entry
  const keys = keyboardColors(game?.guesses ?? [])
  const openAnswer = async () => {
    try { await setLearningLanguage('en'); navigate(`/library?${new URLSearchParams({ word: game!.answer.id })}`) }
    catch { setNotice('无法打开英语词库，请重试。') }
  }
  return <main className={styles.page}>
    <header className={styles.header}><Link to="/today" aria-label="返回首页"><BackIcon /></Link><h1>Wordle</h1><span>{game?.guesses.length ?? 0} / 6</span></header>
    {loading ? <p role="status">正在打开猜词练习…</p> : !game ? <div className={styles.failure}><p role="alert">{error}</p><button onClick={() => void controller?.initialize()}>重试</button></div> : <>
      <section className={styles.definition} aria-label="猜测词释义" tabIndex={0}>
        {entry ? <GuessDefinition entry={entry} /> : <div className={styles.intro}><p>五个字母，六次机会。</p><span>先猜一个词。每次有效猜测后，<br />这里会显示它的词义。</span></div>}
      </section>
      <div className={styles.board} role="group" aria-label="六次猜词棋盘">
        {Array.from({ length: 6 }, (_, row) => {
          const guess = game.guesses[row]
          const active = row === game.guesses.length && !finished
          const cells = Array.from({ length: 5 }, (_, col) => <span key={col} aria-hidden="true" className={`${styles.cell} ${guess ? styles[guess.colors[col]] : ''}`}>{(guess?.term ?? (active ? draft : ''))[col]?.toUpperCase()}</span>)
          return guess ? <button key={row} type="button" className={styles.row} onClick={() => setSelected(row)} aria-label={`查看第 ${row + 1} 次猜测 ${guess.term}：${[...guess.term].map((letter, i) => `${letter.toUpperCase()} ${colorNames[guess.colors[i]]}`).join('，')}`}>{cells}</button>
            : <div key={row} className={`${styles.row} ${active ? styles.active : ''}`} aria-label={`第 ${row + 1} 次${active ? '，当前输入' : '，尚未使用'}`}>{cells}{active && <input className={styles.input} aria-label="输入五字母单词" value={draft} maxLength={5} inputMode="none" autoComplete="off" autoCapitalize="none" spellCheck={false} disabled={busy}
              onChange={event => { setNotice(''); void controller?.edit(event.target.value) }}
              onKeyDown={event => { if (event.key === 'Enter' && !event.nativeEvent.isComposing) { event.preventDefault(); void controller?.submit() } }}
              onPaste={event => { event.preventDefault(); const term = normalizeGuess(event.clipboardData.getData('text')); if (term) { setNotice(''); void controller?.edit(term) } else setNotice('请粘贴一个五字母英语单词。') }} />}</div>
        })}
      </div>
      <div className={styles.status} aria-live="polite">{error || notice ? <span role="alert">{error || notice}</span> : busy ? '正在验证并保存…' : game.status === 'playing' ? `已猜 ${game.guesses.length} 次，还可猜 ${6 - game.guesses.length} 次` : game.status === 'won' ? '猜对了！' : '六次机会已用完'}</div>
      {finished && <section className={styles.result} aria-label="游戏结果"><p>{game.status === 'won' ? '你找到了' : '这次的答案'}</p><strong lang="en">{game.answer.term}</strong><p>{game.answer.partOfSpeech} {game.answer.meaningZh}</p><div><button onClick={() => void openAnswer()}>在英语词库查看</button><button disabled={busy} onClick={() => void controller?.newGame()}>再来一局</button></div></section>}
      <div className={styles.keyboard} role="group" aria-label="屏幕键盘">{keyRows.map((letters, row) => <div key={letters} className={styles.keyRow}>
        {row === 2 && <button data-wordle-key className={styles.wideKey} aria-label="删除字母" disabled={busy || finished} onClick={() => void controller?.edit(draft.slice(0, -1))}>删除</button>}
        {[...letters].map(letter => <button data-wordle-key key={letter} className={keys[letter] ? styles[keys[letter]] : ''} aria-label={`输入 ${letter.toUpperCase()}`} aria-description={keys[letter] ? colorNames[keys[letter]] : '尚未猜测'} disabled={busy || finished} onClick={() => void controller?.edit(draft + letter)}>{letter.toUpperCase()}</button>)}
        {row === 2 && <button data-wordle-key className={styles.wideKey} aria-label="提交猜测" disabled={busy || finished} onClick={() => void controller?.submit()}>确认</button>}
      </div>)}</div>
      <div className={styles.legend}>{(['correct', 'present', 'absent'] as const).map(color => <span key={color}><i className={styles[color]} />{colorNames[color]}</span>)}</div>
      <details className={styles.rules}><summary>规则与词典来源</summary><p>答案来自高考 3500 本地词库中的 {state.candidateCount} 个五字母词。每局六次机会，不限局数，不计入背词进度。</p><p>重复字母按答案实际数量匹配。无效词、重复猜测或验证失败不扣次数。点击已猜行查看词义。</p><p>词库外猜测会将这个单词发送至 Wiktionary 验证，不发送学习记录。成功结果保存在本机；断网时可使用本地词和已验证的词。</p><p>页面中的本地词显示中文释义，Wiktionary 词条显示英文原释义，不使用 AI 翻译。外部文本由 Wiktionary contributors 提供，按 CC BY-SA 4.0 使用。</p></details>
    </>}
  </main>
}
