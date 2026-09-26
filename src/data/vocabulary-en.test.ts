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

  it('ships source-backed components and derivations that resolve within the offline vocabulary', () => {
    const happiness = englishVocabulary.find(word => word.term === 'happiness')!
    expect(happiness.roots?.map(root => root.part)).toContain('happy')
    const terms = new Set(englishVocabulary.map(word => word.term))
    for (const word of englishVocabulary) {
      for (const root of word.roots ?? []) {
        expect(root.meaningZh.trim()).not.toBe('')
        expect(root.sourceUrl).toMatch(/^https:\/\/en\.wiktionary\.org\/w\/index\.php\?title=.+&oldid=\d+$/)
      }
      for (const term of word.derivedTerms ?? []) { expect(terms.has(term)).toBe(true); expect(term).not.toBe(word.term) }
    }
  })

  it('does not confuse suffixes with unrelated standalone words', () => {
    expect(englishVocabulary.find(word => word.term === 'ant')?.derivedTerms ?? []).not.toContain('accountant')
    expect(englishVocabulary.find(word => word.term === 'age')?.derivedTerms ?? []).not.toContain('marriage')
    expect(englishVocabulary.find(word => word.term === 'accountant')?.roots?.map(root => root.part) ?? []).not.toContain('ant')
  })
})
