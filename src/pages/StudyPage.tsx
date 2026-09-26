import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { isCorrectSpelling } from '../domain/reviewScheduler'
import { createPracticeQueue, currentPracticeWord } from '../domain/practiceQueue'
import { buildEnglishChoiceOptions } from '../domain/choiceOptions'
import { toLocalDate } from '../domain/stats'
import type { ReviewRating } from '../types'
import { PronunciationButton } from '../components/PronunciationButton'
import { WordRelations } from '../components/WordRelations'
import { pronunciationPlayer } from '../audio/pronunciation'
import styles from '../styles/App.module.css'

export function StudyPage() {
  const { activeSession, settings, vocabulary, progress, rateCurrentWord, markCurrentWordFluent, submitQuizAnswer, completeQuizItem, exitSession } = useAppState()
  const navigate = useNavigate()
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const actionPending = useRef(false)

  const phaseWordIds = activeSession?.phase === 'learn' ? activeSession.newWordIds : activeSession?.wordIds
  const queue = activeSession?.practice ?? createPracticeQueue(phaseWordIds?.slice(activeSession?.currentIndex ?? 0) ?? [])
  const word = activeSession ? vocabulary.find((item) => item.id === currentPracticeWord(queue)) : undefined
  const feedback = activeSession?.quizFeedback
  const phaseTotal = activeSession?.phase === 'learn'
    ? activeSession.assignedNewCount ?? activeSession.newWordIds.length
    : (activeSession?.assignedNewCount ?? activeSession?.newWordIds.length ?? 0) + (activeSession?.assignedReviewCount ?? activeSession?.reviewWordIds.length ?? 0)
  const remainingUnique = new Set([...queue.pendingIds, ...queue.delayed.map((item) => item.wordId)]).size
  const completedUnique = Math.max(0, phaseTotal - remainingUnique)
  const requestedMode = useMemo(() => {
    if (!activeSession) return 'choice'
    if (!settings.enableSpelling) return 'choice'
    if (!settings.enableChoice) return 'spelling'
    return (phaseTotal - remainingUnique) % 2 === 0 ? 'choice' : 'spelling'
  }, [activeSession, phaseTotal, remainingUnique, settings.enableChoice, settings.enableSpelling])

  const englishOptions = useMemo(() => {
    if (!word || word.language !== 'en' || !activeSession || requestedMode !== 'choice') return undefined
    const today = toLocalDate(new Date())
    const excluded = new Set(activeSession.wordIds)
    for (const record of Object.values(progress)) {
      if (toLocalDate(new Date(record.lastReviewedAt)) === today) excluded.add(record.wordId)
    }
    return buildEnglishChoiceOptions(word, vocabulary, excluded, `${activeSession.id}:${word.id}:${queue.promptNumber}`)
  }, [activeSession, progress, queue.promptNumber, requestedMode, vocabulary, word])
  const mode = requestedMode === 'choice' && word?.language === 'en' && !englishOptions ? 'spelling' : requestedMode

  const options = useMemo(() => {
    if (!word) return []
    if (word.language === 'en') return englishOptions?.map((item) => item.meaningZh) ?? []
    const distractors = vocabulary.filter((item) => item.id !== word.id && item.category === word.category).slice(0, 3)
    return [word, ...distractors].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.meaningZh)
  }, [englishOptions, vocabulary, word])

  useEffect(() => {
    if (activeSession?.phase !== 'quiz' || word?.language !== 'en' || mode !== 'choice') return
    void pronunciationPlayer.play(word).catch(() => undefined)
    return () => pronunciationPlayer.stop()
  }, [activeSession?.id, activeSession?.phase, activeSession?.practice?.promptNumber, mode, word])

  useEffect(() => {
    setRevealed(false)
    setAnswer('')
  }, [activeSession?.practice?.promptNumber, activeSession?.currentIndex, activeSession?.phase, word?.id])

  if (!activeSession || !word) {
    return <main className={styles.studyPage}><div className={styles.emptyState}><h1>没有进行中的学习</h1><button className={styles.primaryButton} onClick={() => navigate('/today')}>回到今日</button></div></main>
  }

  const runAction = async (action: () => Promise<void>) => {
    if (actionPending.current) return
    actionPending.current = true
    setBusy(true)
    try {
      await action()
    } finally {
      actionPending.current = false
      setBusy(false)
    }
  }

  const leave = async () => runAction(async () => {
    await exitSession()
    navigate('/today')
  })

  const rate = async (rating: ReviewRating) => {
    await runAction(() => rateCurrentWord(rating))
  }

  const markAsFluent = async () => {
    await runAction(async () => {
      if (await markCurrentWordFluent()) navigate('/result')
    })
  }

  const submit = async (selected: string) => {
    if (feedback || actionPending.current) return
    const correct = mode === 'spelling' ? isCorrectSpelling(selected, word.term, word.spellingVariants) : selected === word.meaningZh
    await runAction(() => submitQuizAnswer(correct, selected))
  }

  const next = async () => {
    if (!feedback) return
    await runAction(async () => {
      if (await completeQuizItem()) navigate('/result')
    })
  }

  const percent = phaseTotal ? completedUnique / phaseTotal * 100 : 100

  return <main className={styles.studyPage}>
    <header className={styles.studyHeader}>
      <button className={styles.quietButton} disabled={busy} onClick={() => void leave()}>结束</button>
      <div className={styles.studyHeaderActions}>
        <span>{Math.min(phaseTotal, completedUnique + 1)} / {phaseTotal}</span>
        {!feedback && <button className={styles.fluentButton} type="button" disabled={busy} onClick={() => void markAsFluent()}>标为熟练</button>}
      </div>
    </header>
    <div className={styles.studyProgress}><span style={{ width: `${percent}%` }} /></div>

    {activeSession.phase === 'learn' ? (
      <section className={styles.wordStage}>
        <div className={styles.wordIdentity}>
          <h1 lang={word.language}>{word.term}</h1>
          {word.language === 'en' && <div className={styles.pronunciationRow}>
            <span>{word.pronunciation?.ipa || '美式发音'}</span>
            <PronunciationButton word={word} />
          </div>}
          <span className={styles.annotationLine} />
          <p>{word.partOfSpeech}</p>
        </div>
        {!revealed ? (
          <button className={styles.revealButton} disabled={busy} onClick={() => setRevealed(true)}>点击查看释义</button>
        ) : (
          <div className={styles.definition}>
            <strong>{word.meaningZh}</strong>
            <p lang={word.language}>{word.examples[0]?.text}</p>
            <span>{word.examples[0]?.translationZh}</span>
            <WordRelations word={word} />
          </div>
        )}
        {revealed && <div className={styles.ratingBar} aria-label="记忆程度">
          <button disabled={busy} onClick={() => void rate('forgotten')}>忘记</button>
          <button disabled={busy} onClick={() => void rate('fuzzy')}>模糊</button>
          <button className={styles.knownButton} disabled={busy} onClick={() => void rate('known')}>认识</button>
        </div>}
      </section>
    ) : (
      <section className={styles.quizStage}>
        <p className={styles.quizPrompt}>{mode === 'choice' ? '选择正确的中文意思' : `写出这个${word.language === 'en' ? '英语' : '西班牙语'}单词`}</p>
        <h1 lang={mode === 'choice' ? word.language : 'zh-CN'}>{mode === 'choice' ? word.term : word.meaningZh}</h1>
        {word.language === 'en' && mode === 'choice' && <div className={styles.quizPronunciation}><PronunciationButton word={word} /></div>}
        {mode === 'choice' ? (
          <div className={styles.choiceList} role="group" aria-label="选择释义">
            {options.map((option) => <button
              key={option}
              className={feedback?.selected === option ? (feedback.correct ? styles.correctChoice : styles.wrongChoice) : ''}
              onClick={() => void submit(option)}
              disabled={Boolean(feedback) || busy}
            >{option}</button>)}
          </div>
        ) : (
          <form className={`${styles.spellingForm} ${feedback && !feedback.correct ? styles.shake : ''}`} onSubmit={(event) => { event.preventDefault(); void submit(answer) }}>
            <label htmlFor="spelling">{word.language === 'en' ? '英语' : '西班牙语'}</label>
            <input id="spelling" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" disabled={Boolean(feedback) || busy} />
            {!feedback && <button className={styles.primaryButton} type="submit" disabled={!answer.trim() || busy}>检查答案</button>}
          </form>
        )}
        {feedback && <div className={`${styles.feedback} ${feedback.correct ? styles.feedbackCorrect : styles.feedbackWrong}`} role="status">
          <strong>{feedback.correct ? '正确' : '再记一次'}</strong>
          {!feedback.correct && <p>正确答案是 <span lang={word.language}>{word.term}</span></p>}
          <button className={styles.primaryButton} disabled={busy} onClick={() => void next()}>继续</button>
        </div>}
      </section>
    )}
  </main>
}
