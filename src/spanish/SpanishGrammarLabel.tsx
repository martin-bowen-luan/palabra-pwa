import { Fragment } from 'react'
import type { SpanishLearningData } from './types'
import styles from './Spanish.module.css'

const genderLabels = { masculine: '阳性', feminine: '阴性', common: '通性', variable: '阴阳两性均可' }

export function SpanishGrammarLabel({ data }: { data: SpanishLearningData }) {
  const gender = data.grammar.gender
  return <span className={styles.grammarLabel} aria-label="语法标签">
    {data.grammarLabel.split(' · ').map((part, index) => <Fragment key={index}>
      {index > 0 && ' · '}
      {gender && part === genderLabels[gender] ? <span data-gender={gender}>{part}</span> : part}
    </Fragment>)}
  </span>
}
