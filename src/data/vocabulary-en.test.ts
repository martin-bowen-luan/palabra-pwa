import { describe, expect, it } from 'vitest'
import { englishVocabulary } from './englishVocabulary'

describe('generated English vocabulary', () => {
  it('contains 3464 complete and uniquely identified entries', () => {
    expect(englishVocabulary).toHaveLength(3464)
    expect(new Set(englishVocabulary.map((word) => word.id)).size).toBe(3464)
    expect(new Set(englishVocabulary.map((word) => word.term.toLocaleLowerCase('en-US'))).size).toBe(3464)
    englishVocabulary.forEach((word) => {
      expect(word.language).toBe('en')
      expect(word.id).toBe(`en:${word.term.toLocaleLowerCase('en-US')}`)
      expect(word.meaningZh.trim()).not.toBe('')
      expect(word.examples[0]?.text.trim()).not.toBe('')
      expect(word.examples[0]?.translationZh.trim()).not.toBe('')
    })
  })

  it('does not ship crawler HTML or page furniture', () => {
    const serialized = JSON.stringify(englishVocabulary)
    expect(serialized).not.toContain('main_html')
    expect(serialized).not.toContain('sidebar_html')
    expect(serialized).not.toContain('<script')
    expect(serialized).not.toContain('<aside')
  })
})
