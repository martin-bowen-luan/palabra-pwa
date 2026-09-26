import { describe, expect, it } from 'vitest'
import { extractRelations } from './import-english-relations.mjs'
describe('source-backed word components', () => {
  const words = new Map([['happy', { meaningZh: '快乐的' }]])
  it('extracts explicit English components with their source, ignoring prose and raw markup', () => {
    const text = '==English==\n===Etymology===\n{{ety|en|:af|happy|-ness|tree=1}}\n===Noun===\nSome unrelated text <script>bad()</script>'
    expect(extractRelations(text, words, 'https://example.test/revision')).toEqual([
      { part: 'happy', meaningZh: '快乐的', sourceUrl: 'https://example.test/revision' },
      { part: '-ness', meaningZh: '性质；状态', sourceUrl: 'https://example.test/revision' },
    ])
  })
  it('does not infer roots from spelling, definitions or another language', () => {
    expect(extractRelations('==French==\n===Etymology===\n{{af|en|happy|-ness}}', words, 'source')).toEqual([])
    expect(extractRelations('==English==\n===Adjective===\n{{af|en|happy|-ness}}', words, 'source')).toEqual([])
  })
  it('keeps suffixes and prefixes distinct from standalone words', () => {
    const dictionary = new Map([['account', { meaningZh: '账目' }], ['ant', { meaningZh: '蚂蚁' }], ['age', { meaningZh: '年龄' }], ['over', { meaningZh: '结束' }], ['coat', { meaningZh: '外套' }]])
    const extract = template => extractRelations(`==English==\n===Etymology===\n${template}`, dictionary, 'source')
    expect(extract('{{suffix|en|account|ant}}').map(r => r.part)).toEqual(['account'])
    expect(extract('{{suffix|en|account|age}}').some(r => r.part === 'age')).toBe(false)
    expect(extract('{{prefix|en|over|coat}}').map(r => r.part)).toEqual(['over-', 'coat'])
    expect(extract('{{compound|en|over|coat}}').map(r => r.part)).toEqual(['over', 'coat'])
  })
})
