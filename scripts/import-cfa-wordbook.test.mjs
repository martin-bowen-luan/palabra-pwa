import { it, expect } from 'vitest'
import { normalizeCfaDataset } from './import-cfa-wordbook.mjs'

const fixture = () => ({ expected_words: 1, downloaded_words: 1, entries: [{
  schema_version: 3, word: ' Capital Gain ', definition: 'n. 资本利得；',
  detail_url: 'https://www.koolearn.com/dict/wd_test.html', fetched_at: '2026-10-09T00:00:00Z',
  pronunciations: [{ text: '美 [test]', audio_url: 'https://picflow.koolearn.com/dict/mp3/test.mp3' }],
  sections: [{ title: '双语例句', text: 'The sale produced a capital gain.\n这次出售产生了资本利得。' }],
  raw_html: '<script>doNotImport()</script>', sidebar_text: 'Advertisement',
}] })
const normalize = (data, editorial = {}) => normalizeCfaDataset(data, editorial, { expectedCount: data.expected_words })

it('extracts only dictionary fields and preserves phrases, POS, US pronunciation and provenance', () => {
  const { bundle } = normalize(fixture())
  const word = bundle.words[0]
  expect(word.id).toBe('en:capital gain')
  expect(word.term).toBe('Capital Gain')
  expect(word.partOfSpeech).toBe('n.')
  expect(word.meaningZh).toBe('资本利得')
  expect(word.pronunciation.ipa).toBe('/test/')
  expect(word.examples[0].translationZh).toBe('这次出售产生了资本利得。')
  expect(word.examples[0].sourceUrl).toBe('https://www.koolearn.com/dict/wd_test.html')
  expect(bundle.books[0].members[0].senseIds).toEqual(['cfa:capital gain:0'])
  expect(JSON.stringify(bundle)).not.toMatch(/raw_html|script|sidebar|Advertisement/)
})

it('labels supplemental material without attributing it to the downloaded dictionary', () => {
  const data = fixture(); data.entries[0].definition = ''; data.entries[0].sections = []
  const { bundle } = normalize(data, { 'capital gain': { reviewed: true, definition: 'n. 资本利得', example: ['The investor reported a capital gain.', '投资者申报了资本利得。'] } })
  expect(bundle.words[0].examples[0]).toMatchObject({ author: 'Palabra 编辑补充', sourceId: 'editorial:cfa:capital gain' })
  expect(bundle.words[0].examples[0].sourceUrl).toBeUndefined()
  expect(bundle.words[0].senses[0].source.provider).toBe('Palabra 编辑补充')
})

it('rejects embedded HTML even when it occurs inside an otherwise valid definition', () => {
  const data = fixture(); data.entries[0].definition = 'n. <img src=x onerror=alert(1)>收益'
  expect(() => normalize(data)).toThrow(/HTML/)
})

it.each(['count', 'schema', 'word', 'definition', 'examples', 'source', 'audio', 'duplicate', 'unreviewed'])('rejects %s instead of silently publishing bad data', kind => {
  const data = fixture(); const entry = data.entries[0]; let editorial = {}
  if (kind === 'count') data.downloaded_words = 0
  if (kind === 'schema') entry.schema_version = 2
  if (kind === 'word') entry.word = ''
  if (kind === 'definition') entry.definition = ''
  if (kind === 'examples') entry.sections = []
  if (kind === 'source') entry.detail_url = 'javascript:alert(1)'
  if (kind === 'audio') entry.pronunciations[0].audio_url = 'http://example.test/audio.mp3'
  if (kind === 'duplicate') { data.entries.push({ ...entry, word: 'capital gain' }); data.expected_words = data.downloaded_words = 2 }
  if (kind === 'unreviewed') editorial = { 'capital gain': { definition: 'n. 收益' } }
  expect(() => normalize(data, editorial)).toThrow()
})
