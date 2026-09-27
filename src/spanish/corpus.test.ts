import { describe, expect, it } from 'vitest'
import { vocabulary as legacy } from '../data/vocabulary'

// Dynamic loading gives a useful RED assertion before the corpus exists.
const modules = import.meta.glob('./vocabulary.ts', { eager: true }) as Record<string, { spanishVocabulary: typeof legacy }>
const corpus = modules['./vocabulary.ts']?.spanishVocabulary ?? []
describe('Spanish contextual corpus', () => {
  it('preserves every legacy identity and replaces every placeholder with an authored cloze', () => {
    expect(corpus.length).toBeGreaterThan(300)
    for (const base of legacy) {
      const entry = corpus.find(word => word.id === base.id)
      expect(entry?.term).toBe(base.term)
      expect(entry?.meaningZh).toBe(base.meaningZh)
    }
    expect(new Set(corpus.map(word => word.id)).size).toBe(corpus.length)
    for (const entry of corpus) {
      const data = entry.spanishData!
      expect(data?.eligible).toBe(true)
      expect(data.cloze.reviewed).toBe(true)
      expect(data.cloze.provenance).toBe('original')
      expect(data.cloze.reviewVersion).toBe(1)
      expect(data.cloze.answer.normalize('NFC').toLowerCase()).toBe(entry.term.normalize('NFC').toLowerCase())
      const sentence = data.cloze.before + data.cloze.answer + data.cloze.after
      expect(sentence).not.toMatch(/practicamos el verbo|aprendemos la palabra|\{\{|___|«|»/i)
      expect(sentence.split(/\s+/).length).toBeGreaterThanOrEqual(3)
      expect(data.cloze.translationZh).toMatch(/[\u4e00-\u9fff]/)
      expect(data.cloze.cueZh).toMatch(/[\u4e00-\u9fff]/)
      expect(entry.examples[0].text).toBe(sentence)
      expect(data.source.revision).toMatch(/^sha256:[a-f0-9]{64}$/)
      expect(data.source.url).toMatch(/^https:\/\/kaikki.org\//)
    }
  })
  it('covers all 32 verbs in all four tenses and six persons, preserving homographs', () => {
    for (const base of legacy.filter(word => word.partOfSpeech === '动词')) {
      for (const tense of ['present', 'preterite', 'imperfect', 'future']) {
        const forms = corpus.filter(word => word.spanishData?.lemma === base.term && word.spanishData.grammar.tense === tense)
        expect(forms, `${base.term}/${tense}`).toHaveLength(6)
        expect(new Set(forms.map(word => word.spanishData!.grammar.pronoun)).size).toBe(6)
      }
    }
    const hablo = corpus.find(word => word.term === 'habló')!
    expect(hablo.spanishData?.grammar).toMatchObject({ tense: 'preterite', person: 3, number: 'singular' })
    const hablamos = corpus.filter(word => word.term === 'hablamos')
    expect(hablamos.map(word => word.spanishData?.grammar.tense).sort()).toEqual(['present', 'preterite'])
    expect(corpus.filter(word => word.term === 'fui').map(word => word.spanishData?.lemma).sort()).toEqual(['ir', 'ser'])
  })
  it('teaches noun plurals and independent adjective agreement without changing base IDs', () => {
    for (const term of ['casas', 'mujeres', 'manos', 'rojas', 'buenas', 'felices']) {
      expect(corpus.some(word => word.term === term), term).toBe(true)
    }
    expect(corpus.find(word => word.id === 'food-01')?.spanishData?.grammar.gender).toBe('feminine')
    expect(corpus.find(word => word.id === 'body-12')?.spanishData?.grammar.gender).toBe('feminine')
    const joven = corpus.filter(word => word.term === 'joven' && word.spanishData?.kind === 'lemma')
    expect(joven).toHaveLength(2)
    expect(new Set(joven.map(word => word.spanishData?.lemmaId)).size).toBe(1)
    expect(corpus.find(word => word.id === 'people-05')?.spanishData?.lemmaId).toBe('people-04')
    expect(corpus.find(word => word.term === 'habló')?.spanishData?.lemmaId).toBe('verbs-09')
  })
  it('covers every adjective agreement slot and every admitted noun plural', () => {
    for (const base of legacy.filter(word => word.partOfSpeech === '形容词')) {
      const entries = corpus.filter(word => word.id === base.id || word.id.startsWith(`es:form:${base.id}:`))
      expect(entries.map(word => `${word.spanishData?.grammar.gender}/${word.spanishData?.grammar.number}`).sort(), base.id)
        .toEqual(['feminine/plural', 'feminine/singular', 'masculine/plural', 'masculine/singular'])
    }
    for (const base of legacy.filter(word => word.partOfSpeech === '名词')) {
      const plural = corpus.find(word => word.id === `es:form:${base.id}:p`)
      if (['dinero', 'salud', 'hambre', 'sed'].includes(base.term)) expect(plural).toBeUndefined()
      else expect(plural?.spanishData?.grammar.number, base.term).toBe('plural')
    }
  })
  it('does not call the gendered numeral uno invariable', () => {
    expect(corpus.find(word => word.id === 'time-01')?.spanishData?.grammar).toMatchObject({ gender: 'masculine', number: 'singular' })
    expect(corpus.find(word => word.id === 'es:form:time-01:fs')?.term).toBe('una')
  })
  it('constrains finite forms by infinitive and never prints the target in the pre-answer cue', () => {
    for (const word of corpus) {
      const data = word.spanishData!
      if (data.grammar.tense) expect(data.cloze.cueZh, word.id).toContain(`原形 ${data.lemma}`)
      const escaped = word.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      expect(data.cloze.cueZh, word.id).not.toMatch(new RegExp(`(?<!\\p{L})${escaped}(?!\\p{L})`, 'iu'))
    }
    expect(corpus.find(word => word.id === 'people-17')?.spanishData?.cloze.cueZh).toContain('首字母 m')
    expect(corpus.find(word => word.id === 'es:form:people-18:ms')?.spanishData?.cloze.cueZh).toContain('原词 esposa')
  })
  it('does not make the optional first-letter hint automatic for ordinary units', () => {
    const discriminated = corpus.filter(word => word.spanishData?.cloze.cueZh.includes('首字母'))
    expect(discriminated.map(word => word.id)).toEqual(['people-17'])
    expect(corpus.find(word => word.id === 'es:form:adjectives-03:fs')?.spanishData?.cloze.cueZh).toContain('阴性')
  })
  it('gives every analysis a unique complete sentence, ignoring case, NFC and whitespace', () => {
    const seen = new Map<string, string>()
    for (const word of corpus) {
      const cloze = word.spanishData!.cloze
      const sentence = `${cloze.before}${cloze.answer}${cloze.after}`.normalize('NFC').toLowerCase().trim().replace(/\s+/g, ' ')
      expect(seen.get(sentence), `${word.id} repeats ${seen.get(sentence)}: ${sentence}`).toBeUndefined()
      seen.set(sentence, word.id)
    }
    expect(seen.size).toBe(corpus.length)
  })
  it.each([
    ['es:form:people-18:ms', '丈夫'], ['es:form:people-18:mp', '丈夫们'],
    ['es:form:people-10:p', '父母'], ['es:form:people-15:p', '祖父母；外祖父母'],
    ['es:form:food-04:p', '不同种类的奶'], ['es:form:home-15:p', '文件'],
    ['es:form:world-01:p', '恒星'], ['es:form:world-02:p', '天然卫星'],
    ['es:form:body-09:p', '毛；猫毛'],
  ])('uses the contextual derived meaning for %s while keeping legacy base meanings', (id, meaning) => {
    const word = corpus.find(word => word.id === id)!
    expect(word.meaningZh).toBe(meaning)
    expect(word.chinese).toBe(meaning)
    expect(word.spanishData?.cloze.cueZh).toContain(meaning)
  })
  it('labels the actual use of quantifiers and numeral pronouns', () => {
    for (const id of ['basic-10', 'basic-11', 'basic-12', 'basic-13']) expect(corpus.find(w => w.id === id)?.spanishData?.grammarLabel).toContain('副词')
    expect(corpus.find(w => w.id === 'basic-25')?.spanishData?.grammarLabel).toContain('中性代词')
    expect(corpus.find(w => w.id === 'basic-26')?.spanishData?.grammarLabel).toContain('不定限定词')
    expect(corpus.find(w => w.id === 'time-01')?.spanishData?.grammarLabel).toContain('数词代词用法')
  })
  it('distinguishes contextual research from classroom learning and narrows the two deictic variants', () => {
    for (const suffix of ['present:4', 'present:6', 'preterite:3', 'preterite:4', 'preterite:6', 'imperfect:5', 'future:1', 'future:3', 'future:6']) {
      expect(corpus.find(word => word.id === `es:form:verbs-19:${suffix}`)?.spanishData?.cloze.cueZh).toContain('研究；仔细考察')
    }
    expect(corpus.find(word => word.id === 'es:form:verbs-19:future:5')?.spanishData?.cloze.cueZh).toContain('分析')
    for (const id of ['basic-15', 'basic-16']) expect(corpus.find(word => word.id === id)?.spanishData?.cloze.cueZh).toContain('以 -í 结尾')
  })
})
