import type { VocabularyEntry } from '../types'
import type { LetterColor, WordleDictionaryEntry, WordleGame, WordleGuess } from './types'

export function normalizeGuess(value: string): string | undefined {
  const term = value.trim().toLowerCase()
  return /^[a-z]{5}$/.test(term) ? term : undefined
}
export function wordlePool(vocabulary: VocabularyEntry[]): VocabularyEntry[] {
  const seen = new Set<string>()
  return vocabulary.filter(word => {
    const term = word.term.toLowerCase()
    if (word.language !== 'en' || !/^[a-z]{5}$/.test(term) || seen.has(term)) return false
    seen.add(term); return true
  }).map(word => ({ ...word, term: word.term.toLowerCase() }))
}
export function createGame(pool: VocabularyEntry[], previous?: string, random = Math.random): WordleGame {
  const candidates = pool.length > 1 ? pool.filter(w => w.term !== previous) : pool
  if (!candidates.length) throw new Error('词库中没有可用的五字母英语单词。')
  return { id: 'current', gameId: crypto.randomUUID(), answer: candidates[Math.floor(random() * candidates.length)], guesses: [], draft: '', status: 'playing', revision: 0 }
}
export function scoreGuess(answer: string, guess: string): LetterColor[] {
  const colors: LetterColor[] = Array(5).fill('absent')
  const remaining: Record<string, number> = {}
  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) colors[i] = 'correct'
    else remaining[answer[i]] = (remaining[answer[i]] ?? 0) + 1
  }
  for (let i = 0; i < 5; i++) if (colors[i] !== 'correct' && remaining[guess[i]] > 0) {
    colors[i] = 'present'; remaining[guess[i]]--
  }
  return colors
}
export function keyboardColors(guesses: WordleGuess[]): Record<string, LetterColor> {
  const result: Record<string, LetterColor> = {}
  const rank = { absent: 1, present: 2, correct: 3 }
  for (const guess of guesses) for (let i = 0; i < 5; i++) {
    const letter = guess.term[i], color = guess.colors[i]
    if (!result[letter] || rank[color] > rank[result[letter]]) result[letter] = color
  }
  return result
}
export function localEntry(term: string, vocabulary: VocabularyEntry[]): WordleDictionaryEntry | undefined {
  const word = vocabulary.find(w => w.language === 'en' && w.term.toLowerCase() === term)
    ?? vocabulary.find(w => w.language === 'en' && w.spellingVariants?.some(v => v.toLowerCase() === term))
  return word ? { term, source: 'local', ipa: word.pronunciation?.ipa, definitions: [{ partOfSpeech: word.partOfSpeech, text: word.meaningZh }] } : undefined
}
export function acceptGuess(game: WordleGame, entry: WordleDictionaryEntry): WordleGame {
  if (game.status !== 'playing') throw new Error('这一局已经结束。')
  if (!normalizeGuess(entry.term)) throw new Error('请输入五个英文字母。')
  if (game.guesses.some(g => g.term === entry.term)) throw new Error('这个词已经猜过了，换一个试试。')
  const guesses = [...game.guesses, { term: entry.term, colors: scoreGuess(game.answer.term, entry.term), entry }]
  return { ...game, guesses, draft: '', revision: game.revision + 1, status: entry.term === game.answer.term ? 'won' : guesses.length === 6 ? 'lost' : 'playing' }
}
