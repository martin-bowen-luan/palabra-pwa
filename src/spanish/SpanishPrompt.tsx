import type { VocabularyEntry } from '../types'
import styles from './Spanish.module.css'
import { SpanishGrammarLabel } from './SpanishGrammarLabel'

/** Read the cue in saved sessions as well as the current corpus, without rewriting either. */
function promptCue(cue: string, grammarLabel: string) {
  const packed = /^(?:(.*?)；)?本句：([\s\S]+)$/.exec(cue)
  if (!packed) return { meaning: cue, instruction: '' }
  // Only remove the exact grammar suffix; semicolons can also separate meanings.
  const suffix = `；${grammarLabel}`
  const meaning = packed[2].endsWith(suffix) ? packed[2].slice(0, -suffix.length) : packed[2]
  return { meaning, instruction: packed[1] ?? '' }
}

export function SpanishPrompt({ word, revealed }: { word: VocabularyEntry; revealed: boolean }) {
  const { cloze: question, grammarLabel } = word.spanishData!
  const { meaning, instruction } = promptCue(question.cueZh, grammarLabel)
  return <section className={styles.prompt} aria-label="西语句子填词">
    <h1 className={styles.meaning}>{meaning}</h1>
    <p className={styles.promptGrammar}><SpanishGrammarLabel data={word.spanishData!}/></p>
    {instruction && <p className={styles.cue}>{instruction}</p>}
    <p lang="es" className={styles.sentence}>
      {question.before}<span className={styles.blank}>{revealed ? question.answer : '____'}</span>{question.after}
    </p>
    <p className={styles.translation}>{question.translationZh}</p>
  </section>
}
