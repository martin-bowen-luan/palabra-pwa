import { describe, expect, it } from 'vitest'
import {
  normalizeEnglishRecord,
  validateCorpus,
  validateErrorReport,
} from './import-english-vocabulary.mjs'

const sourceRecord = {
  schema_version: 2,
  word: 'colour',
  definition: 'n. 颜色；色彩；颜料；脸色',
  pronunciations: [
    { text: '英 [ˈkʌlə(r)]', audio_url: 'https://audio.test/uk.mp3' },
    { text: '美 [ˈkʌlər]', audio_url: 'https://audio.test/us.mp3' },
  ],
  sections: [{
    title: '双语例句',
    text: '用作名词(n.)\nWhat colour is it?\n它是什么颜色？\nBlue is my favourite colour.\n蓝色是我最喜欢的颜色。',
    html: '<div><script>bad()</script><ol><li>What colour is it?<br/>它是什么颜色？</li><li>Blue is my favourite colour.<br/>蓝色是我最喜欢的颜色。</li></ol></div>',
  }],
  url: 'https://dictionary.test/colour',
  fetched_at: '2026-09-26T00:00:00.000Z',
  main_html: '<main>must not leak</main>',
  sidebar_html: '<aside>must not leak</aside>',
}

describe('English vocabulary importer', () => {
  it('extracts a compact language-neutral entry with US pronunciation', () => {
    const result = normalizeEnglishRecord(sourceRecord, 0)

    expect(result).toMatchObject({
      id: 'en:colour',
      language: 'en',
      term: 'colour',
      partOfSpeech: 'n.',
      meaningZh: '颜色；色彩；颜料',
      category: '高考 3500',
      pronunciation: {
        ipa: '/ˈkʌlər/',
        accent: 'us',
        audioPath: 'https://audio.test/us.mp3',
        audioKind: 'human',
      },
      examples: [
        { text: 'What colour is it?', translationZh: '它是什么颜色？' },
        { text: 'Blue is my favourite colour.', translationZh: '蓝色是我最喜欢的颜色。' },
      ],
      source: {
        provider: '新东方在线词典',
        url: 'https://dictionary.test/colour',
        fetchedAt: '2026-09-26T00:00:00.000Z',
      },
    })
    expect(JSON.stringify(result)).not.toContain('html')
    expect(JSON.stringify(result)).not.toContain('script')
  })

  it('keeps configured UK and US spelling variants searchable', () => {
    expect(normalizeEnglishRecord(sourceRecord, 0).spellingVariants).toContain('color')
  })

  it('keeps subject labels together in the meaning instead of splitting brackets into the part of speech', () => {
    const result = normalizeEnglishRecord({
      ...sourceRecord,
      word: 'soluble',
      definition: 'adj. [化] 可溶的；可以解决的；可以解释的；[数]可解的',
    }, 0)

    expect(result.partOfSpeech).toBe('adj.')
    expect(result.meaningZh).toBe('[化] 可溶的；可以解决的；可以解释的')
  })

  it('recovers a missing top-level definition from the bilingual definition section', () => {
    const result = normalizeEnglishRecord({
      ...sourceRecord,
      definition: '',
      sections: [{
        title: '双语释义',
        text: 'n.\n(名词)\n[C]君主,国王\nmale ruler\n[C]大王\nthe most important person',
      }, ...sourceRecord.sections],
    }, 0)

    expect(result.partOfSpeech).toBe('n.')
    expect(result.meaningZh).toBe('君主,国王；大王')
  })

  it('uses an audited override when the source has no Chinese definition', () => {
    const result = normalizeEnglishRecord({ ...sourceRecord, word: 'ad', definition: '' }, 0)
    expect(result).toMatchObject({ partOfSpeech: 'n.', meaningZh: '广告；公元' })
  })

  it('uses an attributed supplement when the source has no bilingual example', () => {
    const result = normalizeEnglishRecord({ ...sourceRecord, word: 'homestay', sections: [] }, 0)
    expect(result.examples[0]).toMatchObject({
      text: 'My homestay family made me feel welcome.',
      translationZh: '寄宿家庭让我感到很受欢迎。',
      sourceId: 'editorial:homestay',
    })
  })

  it('rejects malformed, incomplete, and duplicate corpora', () => {
    expect(() => normalizeEnglishRecord({ ...sourceRecord, schema_version: 1 }, 0)).toThrow('schema_version')
    expect(() => normalizeEnglishRecord({ ...sourceRecord, word: '' }, 0)).toThrow('word')
    expect(() => validateCorpus([sourceRecord], 3464)).toThrow('3464')
    expect(() => validateCorpus([sourceRecord, sourceRecord], 2)).toThrow('duplicate')
  })

  it('accepts only an empty crawler error report', () => {
    expect(() => validateErrorReport('url,error\n')).not.toThrow()
    expect(() => validateErrorReport('url,error\nhttps://example.test,timeout\n')).toThrow('error report')
  })
})
