import type { VocabularyEntry } from '../types'
import generatedVocabulary from './vocabulary-en.json'

export const englishVocabulary = generatedVocabulary as unknown as VocabularyEntry[]
