import { describe, expect, it } from 'vitest'
import { vocabulary } from './vocabulary'

describe('built-in vocabulary', () => {
  it('contains 300 complete, uniquely identified A1 entries', () => {
    expect(vocabulary).toHaveLength(300)
    expect(new Set(vocabulary.map((word) => word.id)).size).toBe(300)
    vocabulary.forEach((word) => {
      expect(word.language).toBe('es')
      expect(word.term.trim()).not.toBe('')
      expect(word.meaningZh.trim()).not.toBe('')
      expect(word.partOfSpeech.trim()).not.toBe('')
      expect(word.category.trim()).not.toBe('')
      expect(word.examples[0]?.text.trim()).not.toBe('')
      expect(word.examples[0]?.translationZh.trim()).not.toBe('')
    })
  })
})
