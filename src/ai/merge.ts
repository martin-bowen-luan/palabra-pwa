import type { VocabularyEntry } from '../types'
import type { AiResult } from './types'

export interface MergedRelation {
  term: string
  dictionary: boolean
  meaningZh?: string
  aiMeaning?: string
  partOfSpeech?: string
  explanation?: string
  kind?: string
  conflict?: boolean
  conflictNote?: string
}
export const relationKey = (value: string): string => value.normalize('NFKC').trim().toLocaleLowerCase('en').replace(/\s+/gu, ' ')
export function mergeRelations(word: VocabularyEntry, ai: AiResult | undefined, section: 'derived' | 'roots' | 'synonyms', vocabulary: VocabularyEntry[] = []): MergedRelation[] {
  const rows = new Map<string, MergedRelation>()
  if (section === 'roots') {
    for (const root of word.roots ?? []) rows.set(relationKey(root.part), { term: root.part, dictionary: true, meaningZh: root.meaningZh })
  } else {
    for (const term of (section === 'derived' ? word.derivedTerms : word.relatedTerms) ?? []) {
      rows.set(relationKey(term), { term, dictionary: true, meaningZh: vocabulary.find(w => relationKey(w.term) === relationKey(term))?.meaningZh })
    }
  }
  const seen = new Set<string>()
  for (const item of ai?.[section] ?? []) {
    const term = 'part' in item ? item.part : item.term
    const key = relationKey(term)
    if (seen.has(key)) continue
    seen.add(key)
    const original = rows.get(key)
    const explanation = 'relationship' in item ? item.relationship : 'explanation' in item ? item.explanation : item.difference
    rows.set(key, { ...original, term: original?.term ?? term.trim(), dictionary: Boolean(original), aiMeaning: item.meaningZh, explanation,
      partOfSpeech: 'partOfSpeech' in item ? item.partOfSpeech : undefined,
      kind: 'kind' in item ? item.kind : undefined,
      conflict: Boolean(original?.meaningZh && relationKey(original.meaningZh) !== relationKey(item.meaningZh)),
    })
  }
  for (const conflict of ai?.conflicts ?? []) {
    if (conflict.section !== section) continue
    const key = relationKey(conflict.term)
    const row = rows.get(key)
    rows.set(key, { ...(row ?? { term: conflict.term, dictionary: false }), conflict: true, conflictNote: conflict.explanation })
  }
  return [...rows.values()]
}
