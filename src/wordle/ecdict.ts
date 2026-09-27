import type { WordleDictionaryEntry } from './types'

let pending: Promise<ReadonlyMap<string, WordleDictionaryEntry>> | undefined

export function loadEcdict(): Promise<ReadonlyMap<string, WordleDictionaryEntry>> {
  // A separate, precached chunk keeps the main learning bundle unchanged.
  return pending ??= import('./ecdict-five.json').then(({ default: data }) => {
    const entries = new Map<string, WordleDictionaryEntry>()
    for (const [term, meanings] of data.entries as Array<[string, string[]]>) {
      entries.set(term, {
        term, source: 'ecdict',
        sourceUrl: `https://github.com/skywind3000/ECDICT/tree/${data.sourceRevision}`,
        definitions: meanings.map(meaning => {
          const match = /^(n\.|v\.|vt\.|vi\.|a\.|adj\.|adv\.|prep\.|pron\.|conj\.|interj\.|num\.|pl\.)\s*(.+)$/.exec(meaning)
          return match ? { partOfSpeech: match[1], text: match[2] } : { partOfSpeech: '', text: meaning }
        }),
      })
    }
    return entries
  }).catch(error => { pending = undefined; throw error })
}
