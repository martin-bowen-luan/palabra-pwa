import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { StudyFrame } from '../study/StudyFrame'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { PronunciationButton } from '../components/PronunciationButton'
import { SpellingComparison } from '../components/SpellingComparison'
import { SpellingAnswer } from '../components/SpellingAnswer'
import { WordRelations } from '../components/WordRelations'
import { SentenceSpeechButton } from '../components/SentenceSpeechButton'
import { useAi } from '../ai/AiProvider'
import { pronunciationPlayer } from '../audio/pronunciation'
import { studyChoiceOptions } from '../domain/choiceOptions'
import { MEMORY_ROUNDS, ROUND_LABELS } from '../domain/memoryRounds'
import { isCorrectSpelling } from '../domain/reviewScheduler'
import { buildSpellingHint } from '../domain/spellingHint'
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
  return <EnglishPrompt key={`${activeSession.startedAt}:${activeSession.memoryRound}:${activeSession.practice?.promptNumber}:${word.id}`} session={activeSession} word={word} busy={busy} perform={perform} error={error} header={<>
    <header className={styles.studyHeader}>
      <button className={styles.quietButton} disabled={busy} onClick={() => void perform(async () => { await exitSession(); navigate('/today') })}>结束</button>
      <span>{activeSession.mode === 'review' ? '复习' : '学习'} · {total - remaining} / {total}</span>
      <button className={styles.fluentButton} disabled={busy || Boolean(activeSession.quizFeedback)} onClick={() => void perform(markCurrentWordFluent)}>标为熟练</button>
    </header>
    <ol className={styles.roundRail} aria-label="四关记忆进度">{MEMORY_ROUNDS.map((round, i) => <li key={round} aria-current={round === activeSession.memoryRound ? 'step' : undefined} className={i <= roundIndex ? styles.roundReached : ''}><span>{i + 1}</span>{ROUND_LABELS[round]}</li>)}</ol>
  </>} />
}

function EnglishPrompt({ session, word, busy, perform, header, error }: { session: ActiveSession; word: VocabularyEntry; busy: boolean; perform: (action: () => Promise<boolean | void>) => Promise<void>; header:ReactNode; error:string }) {
  const { vocabulary, progress, submitQuizAnswer, completeQuizItem, skipSpellingWord, revealSpellingLetter, revealSpellingAnswer } = useAppState()
  const { settings: aiSettings } = useAi()
  const [answer, setAnswer] = useState('')
  const location = useLocation()
  const navigate = useNavigate()
  const promptId = `${session.startedAt}:${session.memoryRound}:${session.practice?.promptNumber}:${word.id}`
  // Keep an unfinished self-assessment on this history entry while looking up related words.
  const checking = location.state?.studyReveal?.promptId === promptId
  const hinted = checking && location.state.studyReveal.hinted === true
  const reveal = (useHint: boolean) => navigate(location.pathname + location.search, {
    replace: true,
    state: { ...location.state, studyReveal: { promptId, hinted: useHint } },
  })
  const round = session.memoryRound!
  const feedback = session.quizFeedback
  const hintCount = session.spellingHint?.wordId === word.id && session.spellingHint.promptNumber === session.practice?.promptNumber ? session.spellingHint.revealedCount : 0
  const letterHint = buildSpellingHint(word.term, hintCount)
  const choices = useMemo(() => studyChoiceOptions(session, word, vocabulary, progress), [session, word, vocabulary, progress])
  useEffect(() => {
    if (round !== 'choice' || feedback) return
    void pronunciationPlayer.play(word).catch(() => undefined)
    return () => pronunciationPlayer.stop()
    // Feedback is persisted; it must not replay the initial prompt after answering.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [word.id, round])
  const submit = (correct: boolean, selected: string, selectedWordId?: string) => perform(() => submitQuizAnswer(correct, selected, selectedWordId, choices?.map(option => option.id)))
  const correctingChoice = round === 'choice' && Boolean(choices) && feedback?.correct === false
  const wrongChoiceIds = feedback?.wrongChoiceIds ?? (feedback?.correct === false && feedback.selectedWordId ? [feedback.selectedWordId] : [])
  const revealed = checking || Boolean(feedback) && !(correctingChoice && feedback?.selectedWordId)
  const selectedWord = feedback?.selectedWordId ? vocabulary.find(w => w.id === feedback.selectedWordId) : undefined
  const recall = round === 'context' || round === 'recall' || round === 'choice' && !choices
  const actions=<>
    {round === 'choice' && choices && !feedback && <button className={styles.textButton} disabled={busy} onClick={() => void submit(false, '没有想起')}>看答案</button>}
    {recall && !revealed && <div className={styles.recallActions}><button className={styles.textButton} disabled={busy} onClick={() => reveal(true)}>提示一下</button><div><button disabled={busy} onClick={() => reveal(false)}>认识</button><button disabled={busy} onClick={() => void submit(false, '不认识')}>不认识</button></div></div>}
    {checking && !feedback && <div className={styles.recallActions}><p>{hinted ? '看过提示后，再练习一次。' : '和你刚才回忆的意思一致吗？'}</p><div>{!hinted && <button disabled={busy} onClick={() => void submit(true, '记对了')}>记对了</button>}<button disabled={busy} onClick={() => void submit(false, hinted ? '使用提示' : '记错了')}>{hinted ? '继续练习' : '记错了'}</button></div></div>}
    {round === 'spelling' && !feedback && <form className={styles.spellingForm} onKeyDown={e=>{if(e.key==='Enter'&&e.nativeEvent.isComposing)e.preventDefault()}} onSubmit={e => { e.preventDefault(); if (answer.trim()) void submit(isCorrectSpelling(answer, word.term, word.spellingVariants), answer) }}>
      <label htmlFor="group-spelling">英语</label><input id="group-spelling" value={answer} onChange={e => setAnswer(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} maxLength={120} disabled={busy} enterKeyHint="done"/>
      <p className={styles.compactHint} lang="en" aria-label="字母提示" aria-live="polite">{hintCount>0 && <>{letterHint.mask}<small>稍后需无提示拼写{hintCount>=letterHint.limit?' · 已达到提示上限':''}</small></>}</p>
      <div className={styles.studyHelpers}>
        {letterHint.limit>0 && <button type="button" className={styles.textButton} disabled={busy || hintCount >= letterHint.limit} onClick={() => void perform(revealSpellingLetter)}>提示字母</button>}
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => void perform(() => revealSpellingAnswer(answer))}>不认识</button>
        <button type="button" className={styles.textButton} disabled={busy} onClick={() => void perform(skipSpellingWord)}>跳过，稍后优先复习</button>
      </div>
      <button className={styles.primaryButton} disabled={busy || !answer.trim()}>检查答案</button>
    </form>}
    {feedback && !correctingChoice && <button className={styles.primaryButton} disabled={busy} onClick={() => void perform(completeQuizItem)}>{feedback.correct ? '继续' : feedback.answerRevealed ? '重新拼写' : '立即重做'}</button>}
    {round==='spelling' && feedback && !feedback.correct && <button className={styles.textButton} disabled={busy} onClick={() => void perform(skipSpellingWord)}>跳过，稍后优先复习</button>}
  </>
  return <StudyFrame label="学习" header={header} actions={actions}><section className={styles.memoryPrompt}>
    {error && <p className={styles.inlineNotice} role="alert">{error}</p>}
    <p className={styles.quizPrompt}>第 {MEMORY_ROUNDS.indexOf(round) + 1} 关 · {ROUND_LABELS[round]}{session.practice?.stateById[word.id] === 'retry' ? ' · 再试一次' : session.practice?.stateById[word.id] === 'revisit' ? ' · 再回想一次' : ''}</p>
    <div className={styles.memoryIdentity}>
      <h1 lang={round === 'spelling' ? 'zh-CN' : 'en'} className={round === 'spelling' ? styles.meaningPrompt : ''}>{round === 'spelling' ? <><span className={styles.promptPartOfSpeech}>{word.partOfSpeech} </span>{word.meaningZh}</> : word.term}</h1>
      <div className={styles.pronunciationRow}><span>{word.pronunciation?.ipa || '美式发音'}</span><PronunciationButton word={word} /></div>
    </div>
    {round === 'context' && !revealed && <><blockquote className={styles.contextSentence} lang="en">{word.examples[0]?.text || '这个词暂未收录例句，请直接回忆词义。'}</blockquote>{aiSettings.enabled && word.examples[0] && <SentenceSpeechButton text={word.examples[0].text} />}</>}
    {round === 'recall' && !revealed && <p className={styles.recallInstruction}>先在心里说出词义，再核对答案。</p>}
    {round === 'choice' && choices && !feedback?.correct && <>
      <div className={styles.memoryChoices} role="group" aria-label="选择释义">{choices.map(option => {
        const wrong = wrongChoiceIds.includes(option.id)
        return <button key={option.id} className={wrong ? styles.wrongChoice : undefined} disabled={busy} onClick={() => void submit(option.id === word.id, option.meaningZh, option.id)}>
          <small>{option.partOfSpeech}</small>{option.meaningZh}
          {wrong && <span className={styles.choiceCorrection}>选错了：<strong lang="en">{option.term}</strong></span>}
        </button>
      })}</div>
    </>}
    {revealed && round !== 'spelling' && <div className={styles.memoryDefinition}>
      <p><small>{word.partOfSpeech}</small><strong>{word.meaningZh}</strong></p>
      {word.examples[0] && <><blockquote lang="en">{word.examples[0].text}</blockquote>{aiSettings.enabled && <SentenceSpeechButton text={word.examples[0].text} />}<p>{word.examples[0].translationZh}</p></>}
      {selectedWord && !feedback?.correct && <div className={styles.choiceComparison} role="region" aria-label="释义错误对比"><small>你选的是</small><strong lang="en">{selectedWord.term}</strong><p>{selectedWord.partOfSpeech} {selectedWord.meaningZh}</p><small>本题单词</small><strong lang="en">{word.term}</strong><p>{word.partOfSpeech} {word.meaningZh}</p></div>}
      <details className={styles.studyDetails}><summary>词汇详情</summary><WordRelations word={word} vocabulary={vocabulary} /></details>
    </div>}
    {feedback && <div className={`${styles.memoryFeedback} ${feedback.correct ? styles.feedbackCorrect : styles.feedbackWrong}`} role="status">
      <strong>{feedback.correct ? '正确' : correctingChoice ? '请在上方选对释义后继续' : '再记一次'}</strong>
      {feedback.correct && feedback.assisted && <p>用过提示，稍后再无提示拼写一次。</p>}
      {round === 'spelling' && !feedback.correct && (feedback.answerRevealed ? <SpellingAnswer answer={word.term} language="en"/> : <SpellingComparison input={feedback.selected} word={word} />)}
    </div>}
  </section></StudyFrame>
}
