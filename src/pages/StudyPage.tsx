import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppState } from '../app/AppState'
import { isCorrectSpelling } from '../domain/reviewScheduler'
import type { ReviewRating } from '../types'
import styles from '../styles/App.module.css'

export function StudyPage() {
  const { activeSession, settings, vocabulary, rateCurrentWord, completeQuizItem, exitSession } = useAppState()
  const navigate = useNavigate()
  const [revealed, setRevealed] = useState(false)
  const [answer, setAnswer] = useState('')
  const [feedback, setFeedback] = useState<{ correct: boolean; selected: string }>()

  const phaseWordIds = activeSession?.phase === 'learn' ? activeSession.newWordIds : activeSession?.wordIds
  const word = activeSession && phaseWordIds ? vocabulary.find((item) => item.id === phaseWordIds[activeSession.currentIndex]) : undefined
  const mode = useMemo(() => {
    if (!activeSession) return 'choice'
    if (!settings.enableSpelling) return 'choice'
    if (!settings.enableChoice) return 'spelling'
    return activeSession.currentIndex % 2 === 0 ? 'choice' : 'spelling'
  }, [activeSession, settings.enableChoice, settings.enableSpelling])

  const options = useMemo(() => {
    if (!word) return []
    const distractors = vocabulary.filter((item) => item.id !== word.id && item.category === word.category).slice(0, 3)
    return [word, ...distractors].sort((a, b) => a.id.localeCompare(b.id)).map((item) => item.meaningZh)
  }, [word])

  useEffect(() => {
    setRevealed(false)
    setAnswer('')
    setFeedback(undefined)
  }, [activeSession?.currentIndex, activeSession?.phase])

  if (!activeSession || !word) {
    return <main className={styles.studyPage}><div className={styles.emptyState}><h1>没有进行中的学习</h1><button className={styles.primaryButton} onClick={() => navigate('/today')}>回到今日</button></div></main>
  }

  const leave = async () => {
    await exitSession()
    navigate('/today')
  }

  const rate = async (rating: ReviewRating) => {
    await rateCurrentWord(rating)
  }

  const submit = (selected: string) => {
    if (feedback) return
    const correct = mode === 'spelling' ? isCorrectSpelling(selected, word.term, word.spellingVariants) : selected === word.meaningZh
    setFeedback({ correct, selected })
  }

  const next = async () => {
    if (!feedback) return
    const finished = await completeQuizItem(feedback.correct)
    if (finished) navigate('/result')
  }

  const phaseTotal = phaseWordIds?.length ?? 0
  const percent = ((activeSession.currentIndex + (activeSession.phase === 'quiz' ? 1 : 0)) / phaseTotal) * 100

  return <main className={styles.studyPage}>
    <header className={styles.studyHeader}>
      <button className={styles.quietButton} onClick={() => void leave()}>结束</button>
      <span>{activeSession.currentIndex + 1} / {phaseTotal}</span>
    </header>
    <div className={styles.studyProgress}><span style={{ width: `${percent}%` }} /></div>

    {activeSession.phase === 'learn' ? (
      <section className={styles.wordStage}>
        <div className={styles.wordIdentity}>
          <h1>{word.term}</h1>
          <span className={styles.annotationLine} />
          <p>{word.partOfSpeech}</p>
        </div>
        {!revealed ? (
          <button className={styles.revealButton} onClick={() => setRevealed(true)}>点击查看释义</button>
        ) : (
          <div className={styles.definition}>
            <strong>{word.meaningZh}</strong>
            <p lang={word.language}>{word.examples[0]?.text}</p>
            <span>{word.examples[0]?.translationZh}</span>
          </div>
        )}
        {revealed && <div className={styles.ratingBar} aria-label="记忆程度">
          <button onClick={() => void rate('forgotten')}>忘记</button>
          <button onClick={() => void rate('fuzzy')}>模糊</button>
          <button className={styles.knownButton} onClick={() => void rate('known')}>认识</button>
        </div>}
      </section>
    ) : (
      <section className={styles.quizStage}>
        <p className={styles.quizPrompt}>{mode === 'choice' ? '选择正确的中文意思' : `写出这个${word.language === 'en' ? '英语' : '西班牙语'}单词`}</p>
        <h1>{mode === 'choice' ? word.term : word.meaningZh}</h1>
        {mode === 'choice' ? (
          <div className={styles.choiceList}>
            {options.map((option) => <button
              key={option}
              className={feedback?.selected === option ? (feedback.correct ? styles.correctChoice : styles.wrongChoice) : ''}
              onClick={() => submit(option)}
              disabled={Boolean(feedback)}
            >{option}</button>)}
          </div>
        ) : (
          <form className={`${styles.spellingForm} ${feedback && !feedback.correct ? styles.shake : ''}`} onSubmit={(event) => { event.preventDefault(); submit(answer) }}>
            <label htmlFor="spelling">{word.language === 'en' ? '英语' : '西班牙语'}</label>
            <input id="spelling" value={answer} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="none" disabled={Boolean(feedback)} />
            {!feedback && <button className={styles.primaryButton} type="submit" disabled={!answer.trim()}>检查答案</button>}
          </form>
        )}
        {feedback && <div className={`${styles.feedback} ${feedback.correct ? styles.feedbackCorrect : styles.feedbackWrong}`} role="status">
          <strong>{feedback.correct ? '正确' : '再记一次'}</strong>
          {!feedback.correct && <p>正确答案是 <span lang={word.language}>{word.term}</span></p>}
          <button className={styles.primaryButton} onClick={() => void next()}>继续</button>
        </div>}
      </section>
    )}
  </main>
}
