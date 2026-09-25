import { describe, expect, it } from 'vitest'
import { vocabulary } from './vocabulary'

describe('built-in vocabulary', () => {
  it('contains 300 complete, uniquely identified A1 entries', () => {
    expect(vocabulary).toHaveLength(300)
    expect(new Set(vocabulary.map((word) => word.id)).size).toBe(300)
    vocabulary.forEach((word) => {
      expect(word.spanish.trim()).not.toBe('')
      expect(word.chinese.trim()).not.toBe('')
      expect(word.partOfSpeech.trim()).not.toBe('')
      expect(word.category.trim()).not.toBe('')
      expect(word.example.trim()).not.toBe('')
      expect(word.exampleZh.trim()).not.toBe('')
    })
  })
})
