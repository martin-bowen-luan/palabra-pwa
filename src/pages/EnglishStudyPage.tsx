import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { PronunciationButton } from '../components/PronunciationButton'
import { SpellingComparison } from '../components/SpellingComparison'
import { WordRelations } from '../components/WordRelations'
import { pronunciationPlayer } from '../audio/pronunciation'
import { buildEnglishChoiceOptions } from '../domain/choiceOptions'
import { MEMORY_ROUNDS, ROUND_LABELS } from '../domain/memoryRounds'
import { isCorrectSpelling } from '../domain/reviewScheduler'
import { toLocalDate } from '../domain/stats'
import type { ActiveSession, VocabularyEntry } from '../types'
import styles from '../styles/App.module.css'

export function EnglishStudyPage() {
  const { activeSession, vocabulary, markCurrentWordFluent, exitSession } = useAppState()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const pending = useRef(false)
  const perform = async (action: () => Promise<boolean | void>) => {
    if (pending.current) return
    pending.current = true; setBusy(true); setError('')
    try { if (await action()) navigate('/result') }
    catch { setError('未能保存这一步，请重试。你的已有进度仍然保留。') }
    finally { pending.current = false; setBusy(false) }
  }
  const word = vocabulary.find(w => w.id === activeSession?.practice?.pendingIds[0])
  if (!activeSession?.memoryRound || !word) return null
  const total = (activeSession.assignedNewCount ?? activeSession.newWordIds.length) + (activeSession.assignedReviewCount ?? activeSession.reviewWordIds.length)
  const remaining = new Set([...(activeSession.practice?.pendingIds ?? []), ...(activeSession.practice?.delayed.map(d => d.wordId) ?? [])]).size
  const roundIndex = MEMORY_ROUNDS.indexOf(activeSession.memoryRound)
  return <main className={styles.studyPage}>
    <header className={styles.studyHeader}>
      <button className={styles.quietButton} disabled={busy} onClick={() => void perform(async () => { await exitSession(); navigate('/today') })}>结束</button>
      <span>{activeSession.mode === 'review' ? '复习' : '学习'} · {total - remaining} / {total}</span>
      <button className={styles.fluentButton} disabled={busy || Boolean(activeSession.quizFeedback)} onClick={() => void perform(markCurrentWordFluent)}>标为熟练</button>
    </header>
    <ol className={styles.roundRail} aria-label="四关记忆进度">{MEMORY_ROUNDS.map((round, i) => <li key={round} aria-current={round === activeSession.memoryRound ? 'step' : undefined} className={i <= roundIndex ? styles.roundReached : ''}><span>{i + 1}</span>{ROUND_LABELS[round]}</li>)}</ol>
    <EnglishPrompt key={`${activeSession.startedAt}:${activeSession.memoryRound}:${activeSession.practice?.promptNumber}:${word.id}`} session={activeSession} word={word} busy={busy} perform={perform} />
    {error && <p className={styles.inlineNotice} role="alert">{error}</p>}
  </main>
}

function EnglishPrompt({ session, word, busy, perform }: { session: ActiveSession; word: VocabularyEntry; busy: boolean; perform: (action: () => Promise<boolean | void>) => Promise<void> }) {
  const { vocabulary, progress, submitQuizAnswer, completeQuizItem, skipSpellingWord } = useAppState()
  const [answer, setAnswer] = useState('')
  const [checking, setChecking] = useState(false)
  const [hinted, setHinted] = useState(false)
  const round = session.memoryRound!
  const feedback = session.quizFeedback
  const choices = useMemo(() => {
    if (round !== 'choice') return undefined
    const excluded = new Set(session.wordIds)
    for (const record of Object.values(progress)) if (toLocalDate(new Date(record.lastReviewedAt)) === toLocalDate(new Date())) excluded.add(record.wordId)
    return buildEnglishChoiceOptions(word, vocabulary, excluded, `${session.startedAt}:${word.id}:${session.practice?.promptNumber}`)
  }, [round, session.startedAt, session.wordIds, session.practice?.promptNumber, word, vocabulary, progress])
  useEffect(() => {
    if (round !== 'choice' || feedback) return
    void pronunciationPlayer.play(word).catch(() => undefined)
    return () => pronunciationPlayer.stop()
    // Feedback is persisted; it must not replay the initial prompt after answering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, round])
  const submit = (correct: boolean, selected: string, selectedWordId?: string) => perform(() => submitQuizAnswer(correct, selected, selectedWordId))
  const revealed = checking || Boolean(feedback)
  const selectedWord = feedback?.selectedWordId ? vocabulary.find(w => w.id === feedback.selectedWordId) : undefined
  const recall = round === 'context' || round === 'recall' || round === 'choice' && !choices
  return <section className={styles.memoryPrompt}>
    <p className={styles.quizPrompt}>第 {MEMORY_ROUNDS.indexOf(round) + 1} 关 · {ROUND_LABELS[round]}{session.practice?.stateById[word.id] === 'retry' ? ' · 再试一次' : session.practice?.stateById[word.id] === 'revisit' ? ' · 再回想一次' : ''}</p>
    <div className={styles.memoryIdentity}>
      <h1 lang={round === 'spelling' ? 'zh-CN' : 'en'} className={round === 'spelling' ? styles.meaningPrompt : ''}>{round === 'spelling' ? word.meaningZh : word.term}</h1>
      <div className={styles.pronunciationRow}><span>{word.pronunciation?.ipa || '美式发音'}</span><PronunciationButton word={word} /></div>
    </div>
    {round === 'context' && !revealed && <blockquote className={styles.contextSentence} lang="en">{word.examples[0]?.text || '这个词暂未收录例句，请直接回忆词义。'}</blockquote>}
    {round === 'recall' && !revealed && <p className={styles.recallInstruction}>先在心里说出词义，再核对答案。</p>}
    {round === 'choice' && choices && !feedback && <><div className={styles.memoryChoices} role="group" aria-label="选择释义">{choices.map(option => <button key={option.id} disabled={busy} onClick={() => void submit(option.id === word.id, option.meaningZh, option.id)}><small>{option.partOfSpeech}</small>{option.meaningZh}</button>)}</div><button className={styles.textButton} disabled={busy} onClick={() => void submit(false, '没有想起')}>看答案</button></>}
    {recall && !revealed && <div className={styles.recallActions}><button className={styles.textButton} disabled={busy} onClick={() => { setChecking(true); setHinted(true) }}>提示一下</button><div><button disabled={busy} onClick={() => setChecking(true)}>认识</button><button disabled={busy} onClick={() => void submit(false, '不认识')}>不认识</button></div></div>}
    {revealed && round !== 'spelling' && <div className={styles.memoryDefinition}>
      <p><small>{word.partOfSpeech}</small><strong>{word.meaningZh}</strong></p>
      {word.examples[0] && <><blockquote lang="en">{word.examples[0].text}</blockquote><p>{word.examples[0].translationZh}</p></>}
      {selectedWord && !feedback?.correct && <div className={styles.choiceComparison}><small>你选的是</small><strong lang="en">{selectedWord.term}</strong><p>{selectedWord.meaningZh}</p><small>本题单词</small><strong lang="en">{word.term}</strong><p>{word.meaningZh}</p></div>}
      <WordRelations word={word} />
    </div>}
    {checking && !feedback && <div className={styles.recallActions}><p>{hinted ? '看过提示后，再练习一次。' : '和你刚才回忆的意思一致吗？'}</p><div>{!hinted && <button disabled={busy} onClick={() => void submit(true, '记对了')}>记对了</button>}<button disabled={busy} onClick={() => void submit(false, hinted ? '使用提示' : '记错了')}>{hinted ? '继续练习' : '记错了'}</button></div></div>}
    {round === 'spelling' && !feedback && <form className={styles.spellingForm} onSubmit={e => { e.preventDefault(); if (answer.trim()) void submit(isCorrectSpelling(answer, word.term, word.spellingVariants), answer) }}>
      <label htmlFor="group-spelling">英语</label><input id="group-spelling" value={answer} onChange={e => setAnswer(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} disabled={busy} />
      <button className={styles.primaryButton} disabled={busy || !answer.trim()}>检查答案</button>
    </form>}
    {feedback && <div className={`${styles.memoryFeedback} ${feedback.correct ? styles.feedbackCorrect : styles.feedbackWrong}`} role="status">
      <strong>{feedback.correct ? '正确' : '再记一次'}</strong>
      {round === 'spelling' && !feedback.correct && <SpellingComparison input={feedback.selected} word={word} />}
      <button className={styles.primaryButton} disabled={busy} onClick={() => void perform(completeQuizItem)}>{feedback.correct ? '继续' : '立即重做'}</button>
    </div>}
    {round === 'spelling' && !feedback?.correct && <div className={styles.skipSpelling}><button disabled={busy} onClick={() => void perform(skipSpellingWord)}>跳过，稍后优先复习</button><small>不计为掌握，约 10 分钟后进入复习。</small></div>}
  </section>
}
