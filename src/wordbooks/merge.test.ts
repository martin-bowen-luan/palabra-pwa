import { expect, it } from 'vitest'
import { mergeWordbookBundles } from './merge'
import { projectWordbook } from './catalog'
import { bookFixture } from './fixtures'
import type { EnglishWordbookBundle } from './types'

it('keeps existing IDs and book meanings while projecting a new book’s own senses and examples', () => {
  const base = structuredClone(bookFixture)
  const extra: EnglishWordbookBundle = { revision: 1, words: [{ ...base.words[0], id: 'en:Apple', term: 'Apple', meaningZh: '苹果公司', senses: [{ id: 'cfa:apple:0', partOfSpeech: 'n.', meaningZh: '苹果公司' }], examples: [{ text: 'Apple reported its earnings.', translationZh: '苹果公司公布了收益。' }] }], books: [{ id: 'en-cfa-level1', language: 'en', title: 'CFA 一级必备词汇', revision: 1, members: [{ wordId: 'en:Apple', order: 0, memberships: [], senseIds: ['cfa:apple:0'], exampleKeys: ['Apple reported its earnings.\n苹果公司公布了收益。'] }] }] }
  const merged = mergeWordbookBundles(base, extra)
  expect(merged.words).toHaveLength(base.words.length)
  expect(merged.words[0].meaningZh).toBe('苹果')
  expect(merged.books[2].members[0].wordId).toBe('en:apple')
  const cfa = projectWordbook(merged.words, merged.books[2])
  expect(cfa[0].meaningZh).toBe('苹果公司')
  expect(cfa[0].examples[0].text).toBe('Apple reported its earnings.')
  const high = projectWordbook(merged.words, merged.books[0])
  expect(high[0].examples).toEqual(base.words[0].examples)
  expect(high[0].senses ?? []).toEqual([])
  expect(base).toEqual(bookFixture)
  expect(mergeWordbookBundles(base, extra)).toEqual(merged)
})
