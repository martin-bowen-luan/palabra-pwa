import { expect, it } from 'vitest'
const modules = import.meta.glob('./data/validate.ts', { eager: true }) as Record<string, { parseSentence: (line: string, term: string) => unknown }>
const parse = (line: string, term: string) => modules['./data/validate.ts']?.parseSentence(line, term)
const genderModules = import.meta.glob('./data/validate.ts', { eager: true }) as Record<string, { nounGender?: (tags: string[]) => string }>
const gender = (tags: string[]) => genderModules['./data/validate.ts']?.nounGender?.(tags)
const uniquenessModules = import.meta.glob('./data/validate.ts', { eager: true }) as Record<string, { assertUniqueSentences?: (sentences: Array<{ before: string; answer: string; after: string }>) => void }>
it('rejects complete-sentence duplicates across answers after NFC, case and whitespace normalization', () => {
  const sentences = [
    { before: '  Ana ', answer: 'habló', after: '\t ayer.  ' },
    { before: 'ANA  ', answer: 'hablo\u0301', after: ' AYER.' },
  ]
  expect(() => uniquenessModules['./data/validate.ts']?.assertUniqueSentences?.(sentences)).toThrow(/duplicate.*sentence/i)
})
it('never guesses noun gender from a spelling ending or absent source tags', () => {
  expect(() => gender([])).toThrow(/gender/i)
  expect(() => gender(['plural', 'uncountable'])).toThrow(/gender/i)
  expect(gender(['feminine'])).toBe('feminine')
  expect(gender(['masculine'])).toBe('masculine')
  expect(gender(['masculine', 'feminine', 'by-personal-gender'])).toBe('common')
})
it('extracts an explicit accented answer without guessing occurrence boundaries', () => {
  expect(parse('Ayer Ana [habló] con su hermana.|昨天安娜和姐姐说了话。', 'habló')).toEqual({ before: 'Ayer Ana ', answer: 'habló', after: ' con su hermana.', translationZh: '昨天安娜和姐姐说了话。' })
})
it.each([
  ['Ana habló ayer.|安娜昨天说了话。', 'habló'],
  ['Ana [hablo] ayer.|安娜昨天说了话。', 'habló'],
  ['[Ana] [habló].|安娜说了话。', 'habló'],
  ['Aprendemos la palabra [casa].|我们学习这个词。', 'casa'],
  ['La [casa] tiene jardín.|', 'casa'],
])('rejects malformed, wrong-answer, placeholder or untranslated clozes', (line, term) => {
  expect(() => parse(line, term)).toThrow()
})
