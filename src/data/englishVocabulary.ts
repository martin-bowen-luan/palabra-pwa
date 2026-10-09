import type { VocabularyEntry } from '../types'
import generatedBundle from './english-wordbooks.json'
import generatedCfa from './cfa-wordbook.json'
import type { EnglishWordbookBundle } from '../wordbooks/types'
import { mergeWordbookBundles } from '../wordbooks/merge'
import relationData from './english-relations.json'

const relations = relationData.entries as Record<string, Pick<VocabularyEntry, 'roots' | 'derivedTerms' | 'relationSourceUrls'>>
const sharedBundle = mergeWordbookBundles(generatedBundle as unknown as EnglishWordbookBundle, generatedCfa as unknown as EnglishWordbookBundle)
export const englishVocabulary: VocabularyEntry[] = sharedBundle.words
  .map(word => ({ ...word, ...relations[word.term] }))
export const englishWordbookBundle:EnglishWordbookBundle={...sharedBundle,words:englishVocabulary}
