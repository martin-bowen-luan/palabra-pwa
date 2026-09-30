import type { VocabularyEntry } from '../types'
import generatedBundle from './english-wordbooks.json'
import type { EnglishWordbookBundle } from '../wordbooks/types'
import relationData from './english-relations.json'

const relations = relationData.entries as Record<string, Pick<VocabularyEntry, 'roots' | 'derivedTerms' | 'relationSourceUrls'>>
export const englishVocabulary: VocabularyEntry[] = (generatedBundle.words as unknown as VocabularyEntry[])
  .map(word => ({ ...word, ...relations[word.term] }))
export const englishWordbookBundle:EnglishWordbookBundle={...(generatedBundle as unknown as EnglishWordbookBundle),words:englishVocabulary}
