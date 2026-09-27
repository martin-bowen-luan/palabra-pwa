export interface SpanishGrammar {
  gender?: 'masculine' | 'feminine' | 'common' | 'variable'
  number?: 'singular' | 'plural' | 'invariable'
  mood?: 'indicative' | 'infinitive'
  tense?: 'present' | 'preterite' | 'imperfect' | 'future'
  person?: 1 | 2 | 3
  pronoun?: string
  noteZh?: string
}

export interface SpanishCloze {
  id: string
  before: string
  answer: string
  after: string
  translationZh: string
  cueZh: string
  reviewed: boolean
  provenance: 'original'
  reviewVersion: 1
}

export interface SpanishLearningData {
  lemmaId: string
  lemma: string
  kind: 'lemma' | 'form'
  grammar: SpanishGrammar
  grammarLabel: string
  eligible: boolean
  cloze: SpanishCloze
  source: { url: string; revision: string; license: string }
}
