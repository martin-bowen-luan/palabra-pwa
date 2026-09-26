import type { VocabularyEntry } from '../types'

function seededRandom(seed: string): () => number {
  let state = 2166136261
  for (const char of seed) state = Math.imul(state ^ char.charCodeAt(0), 16777619)
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function seededShuffle(words: VocabularyEntry[], seed: string): VocabularyEntry[] {
  const shuffled = [...words]
  const random = seededRandom(seed)
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const chosen = Math.floor(random() * (index + 1))
    ;[shuffled[index], shuffled[chosen]] = [shuffled[chosen], shuffled[index]]
  }
  return shuffled
}

function lookalikeScore(a: string, b: string): number {
  const left = a.toLocaleLowerCase('en')
  const right = b.toLocaleLowerCase('en')
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row += 1) {
    let diagonal = previous[0]
    previous[0] = row
    for (let column = 1; column <= right.length; column += 1) {
      const above = previous[column]
      previous[column] = Math.min(
        previous[column] + 1,
        previous[column - 1] + 1,
        diagonal + (left[row - 1] === right[column - 1] ? 0 : 1),
      )
      diagonal = above
    }
  }
  let prefix = 0
  while (prefix < Math.min(left.length, right.length) && left[prefix] === right[prefix]) prefix += 1
  return previous[right.length] / Math.max(left.length, right.length, 1) - prefix * 0.04
}

function seededPickDistinctMeanings(words: VocabularyEntry[], count: number, seed: string): VocabularyEntry[] {
  const picked: VocabularyEntry[] = []
  const meanings = new Set<string>()
  for (const word of seededShuffle(words, seed)) {
    const meaning = word.meaningZh.trim()
    if (!meaning || meanings.has(meaning)) continue
    meanings.add(meaning)
    picked.push(word)
    if (picked.length === count) break
  }
  return picked
}

export function buildEnglishChoiceOptions(
  target: VocabularyEntry,
  vocabulary: VocabularyEntry[],
  excludedIds: ReadonlySet<string>,
  seed: string,
): VocabularyEntry[] | undefined {
  const candidates = vocabulary
    .filter((item) => item.language === 'en' && item.id !== target.id && !excludedIds.has(item.id)
      && item.meaningZh.trim() && item.meaningZh.trim() !== target.meaningZh.trim())
    .sort((left, right) => lookalikeScore(target.term, left.term) - lookalikeScore(target.term, right.term)
      || left.term.localeCompare(right.term))
  const near = seededPickDistinctMeanings(candidates.slice(0, 8), 3, `${seed}:near`)
  const fallback = seededPickDistinctMeanings(
    candidates.slice(8).filter((item) => !near.some((picked) => picked.meaningZh.trim() === item.meaningZh.trim())),
    3 - near.length,
    `${seed}:fallback`,
  )
  const distractors = [...near, ...fallback]
  if (distractors.length < 3) return undefined
  return seededShuffle([target, ...distractors], `${seed}:order`)
}
