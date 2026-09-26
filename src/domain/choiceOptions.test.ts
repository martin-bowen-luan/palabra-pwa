import { describe, expect, it } from 'vitest'
import { buildEnglishChoiceOptions } from './choiceOptions'
import type { VocabularyEntry } from '../types'

function entry(term: string, meaningZh: string): VocabularyEntry {
  return { id: `en:${term}`, language: 'en', term, meaningZh, partOfSpeech: 'n.', category: '高考 3500', examples: [] }
}

describe('English choice options', () => {
  const target = entry('form', '形状')
  const corpus = [
    target, entry('from', '从'), entry('farm', '农场'), entry('foam', '泡沫'),
    entry('storm', '暴风雨'), entry('planet', '行星'), entry('today-word', '今日词'),
    entry('former', '形状'),
  ]

  it('builds four distinct meanings with no already-studied distractors', () => {
    const excluded = new Set(['en:today-word'])
    const first = buildEnglishChoiceOptions(target, corpus, excluded, 'session:form:1')
    expect(first).toHaveLength(4)
    expect(first?.filter((item) => item.id === target.id)).toHaveLength(1)
    expect(first?.some((item) => excluded.has(item.id))).toBe(false)
    expect(new Set(first?.map((item) => item.meaningZh)).size).toBe(4)
    expect(first?.filter((item) => ['from', 'farm', 'foam', 'storm'].includes(item.term)).length).toBeGreaterThanOrEqual(2)
    expect(buildEnglishChoiceOptions(target, corpus, excluded, 'session:form:1')).toEqual(first)
  })

  it('shuffles option order deterministically for a prompt seed', () => {
    const orders = new Set(Array.from({ length: 12 }, (_, index) =>
      buildEnglishChoiceOptions(target, corpus, new Set(), `session:form:${index}`)?.map((item) => item.id).join(',')))
    expect(orders.size).toBeGreaterThan(1)
  })

  it('still returns exactly four options when the fallback pool is large', () => {
    const large = [...corpus, ...Array.from({ length: 40 }, (_, i) => entry(`extra${i}`, `其他含义${i}`))]
    expect(buildEnglishChoiceOptions(target, large, new Set(), 'large')).toHaveLength(4)
  })

  it('uses spelling instead of a partial choice list when corpus is too small', () => {
    expect(buildEnglishChoiceOptions(target, [target, entry('from', '从'), entry('farm', '农场')], new Set(), 'sparse')).toBeUndefined()
  })
})
