import type { ActiveSession, VocabularyEntry, WordProgress } from '../types'
import { toLocalDate } from './stats'

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
  if (count <= 0) return []
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
    .map(word => ({ word, score: lookalikeScore(target.term, word.term) }))
    .sort((left, right) => left.score - right.score || left.word.term.localeCompare(right.word.term))
    .map(item => item.word)
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

/** Share restoration rules between the visible choices and the advance guard. */
export function studyChoiceOptions(session: ActiveSession, target: VocabularyEntry, vocabulary: VocabularyEntry[], progress: Record<string, WordProgress>, now = new Date()): VocabularyEntry[] | undefined {
  if (session.language !== 'en' || session.memoryRound !== 'choice') return undefined
  const feedback = session.quizFeedback
  const saved = feedback?.choiceOptionIds?.map(id => vocabulary.find(word => word.id === id && word.language === 'en'))
  if (saved?.length === 4 && saved.every((word): word is VocabularyEntry => Boolean(word))
    && new Set(saved.map(word => word.id)).size === 4 && saved.some(word => word.id === target.id)) return saved

  const wrongIds = feedback?.wrongChoiceIds ?? (feedback?.correct === false && feedback.selectedWordId ? [feedback.selectedWordId] : [])
  const knownWrong = wrongIds.map(id => vocabulary.find(word => word.id === id && word.language === 'en'))
    .filter((word): word is VocabularyEntry => Boolean(word) && word!.id !== target.id)
  const excluded = new Set(session.wordIds)
  for (const record of Object.values(progress)) if (toLocalDate(new Date(record.lastReviewedAt)) === toLocalDate(now)) excluded.add(record.wordId)
  // Restoring an existing mistake is not assigning a new distractor: retain it
  // even if it is now excluded from fresh questions (e.g. after a date change).
  for (const wrong of knownWrong) excluded.delete(wrong.id)
  const choices = buildEnglishChoiceOptions(target, vocabulary, excluded, `${session.startedAt}:${target.id}:${session.practice?.promptNumber}`)
  if (!choices) return undefined
  for (const wrong of knownWrong) {
    if (choices.some(word => word.id === wrong.id)) continue
    const replace = choices.findIndex(word => word.id !== target.id && !wrongIds.includes(word.id))
    if (replace !== -1) choices[replace] = wrong
  }
  return choices
}
