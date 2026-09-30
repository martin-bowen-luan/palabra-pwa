import { useEffect, useRef } from 'react'
import type { LearningLanguage } from '../types'
import styles from '../styles/App.module.css'

export function SpellingAnswer({ answer, language }: { answer: string; language: LearningLanguage }) {
  const answerRef = useRef<HTMLElement>(null)
  useEffect(() => { answerRef.current?.focus({preventScroll:true}) }, [answer])
  return <section ref={answerRef} tabIndex={-1} className={styles.spellingAnswer} aria-label="完整答案">
    <small>完整拼写</small>
    <strong lang={language}>{answer}</strong>
    <p>先记住这个词，再重新拼写。稍后还会无提示复测。</p>
  </section>
}
