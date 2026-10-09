import type { VocabularyEntry } from '../types'
import type { EnglishWordbookBundle } from './types'
import { exampleKey } from './catalog'

const termKey = (term: string) => term.normalize('NFC').replace(/\s+/gu, ' ').trim().toLowerCase()
const unique = <T,>(items: T[], key: (item: T) => string): T[] => [...new Map(items.map(item => [key(item), item])).values()]

/** Compose independently shipped books without changing an existing word's identity or primary meaning. */
export function mergeWordbookBundles(base: EnglishWordbookBundle, extra: EnglishWordbookBundle): EnglishWordbookBundle {
  const words = base.words.map(word => ({ ...word }))
  const byTerm = new Map(words.map(word => [termKey(word.term), word]))
  const originals = new Map(base.words.map(word => [word.id, word]))
  // Freeze content selection before extending the shared dictionary. Empty selections are meaningful.
  const books = base.books.map(book => ({ ...book, members: book.members.map(member => {
    const word = originals.get(member.wordId)!
    return { ...member,
      ...(member.senseIds === undefined ? { senseIds: word.senses?.map(sense => sense.id) ?? [], displayMeaningZh: member.displayMeaningZh ?? word.meaningZh, displayPartOfSpeech: member.displayPartOfSpeech ?? word.partOfSpeech } : {}),
      exampleKeys: member.exampleKeys ?? word.examples.map(exampleKey),
    }
  }) }))
  const ids = new Map<string, string>()
  for (const incoming of extra.words) {
    const existing = byTerm.get(termKey(incoming.term))
    if (!existing) {
      const word: VocabularyEntry = { ...incoming }
      words.push(word); byTerm.set(termKey(word.term), word); ids.set(incoming.id, word.id)
      continue
    }
    ids.set(incoming.id, existing.id)
    existing.senses = unique([...(existing.senses ?? []), ...(incoming.senses ?? [])], sense => sense.id)
    // Retain original example attribution on a duplicate; each book chooses its own examples by key.
    const examples = [...existing.examples], keys = new Set(examples.map(exampleKey))
    for (const example of incoming.examples) {
      if (!keys.has(exampleKey(example))) { examples.push(example); keys.add(exampleKey(example)) }
    }
    existing.examples = examples
    existing.sources = unique([...(existing.sources ?? []), ...(existing.source ? [existing.source] : []), ...(incoming.source ? [incoming.source] : []), ...(incoming.sources ?? [])], source => source.url)
    existing.pronunciation ??= incoming.pronunciation
  }
  return {
    revision: base.revision + extra.revision,
    words,
    books: [...books, ...extra.books.map(book => ({ ...book, members: book.members.map(member => ({ ...member, wordId: ids.get(member.wordId) ?? member.wordId })) }))],
  }
}
