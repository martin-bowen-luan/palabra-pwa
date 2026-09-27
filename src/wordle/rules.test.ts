import { describe, expect, it } from 'vitest'
import { acceptGuess, createGame, keyboardColors, localEntry, normalizeGuess, scoreGuess, wordlePool } from './rules'
import type { VocabularyEntry } from '../types'
const word = (term: string): VocabularyEntry => ({ id: `en:${term}`, language: 'en', term, partOfSpeech: 'n.', meaningZh: term, category: '测试', examples: [] })
describe('Wordle rules', () => {
  it('filters canonical English five-letter words, deduplicates and avoids the last answer', () => {
    const pool = wordlePool([word('apple'), word('APPLE'), word('two'), word('a-bcd'), word('caféx'), { ...word('verde'), language: 'es' }, word('grape')])
    expect(pool.map(w => w.term)).toEqual(['apple', 'grape'])
    expect(createGame(pool, 'apple', () => 0).answer.term).toBe('grape')
    expect(() => createGame([])).toThrow()
  })
  it('normalizes guesses and rejects non-ASCII words', () => {
    expect(normalizeGuess(' APPLE ')).toBe('apple')
    for (const bad of ['four', 'caféx', 'a-bcd', 'a1bcd', 'a bcd']) expect(normalizeGuess(bad)).toBeUndefined()
  })
  it.each([
    ['apple', 'allee', ['correct', 'present', 'absent', 'absent', 'correct']],
    ['abbey', 'bobby', ['present', 'absent', 'correct', 'absent', 'correct']],
    ['level', 'eerie', ['present', 'correct', 'absent', 'absent', 'absent']],
    ['apple', 'apple', ['correct', 'correct', 'correct', 'correct', 'correct']],
  ])('scores %s against %s without overallocating repeated letters', (answer, guess, expected) => {
    expect(scoreGuess(answer, guess)).toEqual(expected)
  })
  it('accepts variants locally, ends in six misses, rejects repeats and never downgrades keyboard colors', () => {
    const words = [word('apple'), { ...word('colour'), spellingVariants: ['color'] }]
    expect(localEntry('color', words)?.definitions[0].text).toBe('colour')
    let game = createGame([words[0]])
    for (const guess of ['allee', 'bobby', 'level', 'grape', 'wreck', 'means']) game = acceptGuess(game, localEntry(guess, [word(guess)])!)
    expect(game.status).toBe('lost')
    expect(game.guesses).toHaveLength(6)
    expect(keyboardColors(game.guesses).a).toBe('correct')
    expect(() => acceptGuess(game, localEntry('apple', words)!)).toThrow()
    const fresh = acceptGuess(createGame([word('apple')]), localEntry('grape', [word('grape')])!)
    expect(() => acceptGuess(fresh, localEntry('grape', [word('grape')])!)).toThrow()
    expect(acceptGuess(createGame([word('apple')]), localEntry('apple', words)!).status).toBe('won')
  })
})
