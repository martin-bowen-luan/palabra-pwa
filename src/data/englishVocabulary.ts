import type { VocabularyEntry } from '../types'
import generatedVocabulary from './vocabulary-en.json'
import relationData from './english-relations.json'

const relations = relationData.entries as Record<string, Pick<VocabularyEntry, 'roots' | 'derivedTerms' | 'relationSourceUrls'>>
export const englishVocabulary: VocabularyEntry[] = (generatedVocabulary as unknown as VocabularyEntry[])
  .map(word => ({ ...word, ...relations[word.term] }))
