import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cleanText, termKey, exampleKey, definitionSenses, bilingualSenses, bilingualExamples, pronunciation } from './lib/english-record-fields.mjs'
import { parseSpecialForms, parseRelatedTerms } from './import-english-vocabulary.mjs'
import { validatePrimaryBundle } from './import-primary-wordbook.mjs'

const title = 'CFA 一级必备词汇'
const editorialUrl = 'https://github.com/martin-bowen-luan/palabra-pwa/blob/main/docs/cfa-editorial-review.md'

export function normalizeCfaDataset(dataset, editorial = {}, { expectedCount = 1152 } = {}) {
  if (!Array.isArray(dataset.entries) || dataset.entries.length !== expectedCount || dataset.expected_words !== expectedCount || dataset.downloaded_words !== expectedCount) throw new Error(`Expected ${expectedCount} CFA entries`)
  const words = [], members = [], seen = new Set(), gaps = []
  for (const [order, record] of dataset.entries.entries()) {
    const key = termKey(record.word), edit = editorial[key]
    if (record.schema_version !== 3 || !key) throw new Error(`Invalid CFA record: ${order}`)
    if (seen.has(key)) throw new Error(`Duplicate CFA term: ${key}`)
    seen.add(key)
    if (edit && edit.reviewed !== true) throw new Error(`Editorial review required: ${key}`)
    const source = { provider: '新东方在线词典', url: cleanText(record.detail_url), fetchedAt: record.fetched_at }
    if (!/^https:\/\//u.test(source.url)) throw new Error(`Missing HTTPS source: ${key}`)
    let senses = definitionSenses(edit?.definition ?? record.definition)
    if (!senses.length) senses = bilingualSenses(record.sections)
    senses = senses.map((sense, index) => ({ ...sense, id: `cfa:${key}:${index}`, source: edit?.definition ? { provider: 'Palabra 编辑补充', url: editorialUrl } : source }))
    const examples = edit?.example
      ? [{ text: cleanText(edit.example[0]), translationZh: cleanText(edit.example[1]), sourceId: `editorial:cfa:${key}`, author: 'Palabra 编辑补充' }]
      : bilingualExamples(record.sections).map(example => ({ ...example, sourceUrl: source.url }))
    if (!senses.some(sense => /[\u3400-\u9fff]/u.test(sense.meaningZh))) gaps.push(`${key}: definition`)
    if (!examples.length || examples.some(example => !/[a-z]/iu.test(example.text) || !/[\u3400-\u9fff]/u.test(example.translationZh))) gaps.push(`${key}: examples`)
    const word = {
      id: `en:${key}`, language: 'en', term: cleanText(record.word),
      partOfSpeech: senses[0]?.partOfSpeech ?? '', meaningZh: senses[0]?.meaningZh ?? '',
      category: title, senses, examples, source,
      pronunciation: pronunciation(record.pronunciations),
      specialForms: parseSpecialForms(record.sections ?? [], key),
      relatedTerms: parseRelatedTerms(record.sections ?? [], key),
    }
    words.push(word)
    members.push({ wordId: word.id, order, memberships: [], displayTerm: word.term, senseIds: senses.map(sense => sense.id), exampleKeys: examples.map(exampleKey) })
  }
  if (gaps.length) throw new Error(`CFA quality gaps: ${gaps.join(', ')}`)
  for (const key of Object.keys(editorial)) if (!seen.has(key)) throw new Error(`Unknown editorial term: ${key}`)
  const bundle = { revision: 1, words, books: [{ id: 'en-cfa-level1', language: 'en', title, revision: 1, members }] }
  if (/<\/?[a-z][^>]*>/iu.test(JSON.stringify(bundle))) throw new Error('HTML embedded in CFA text')
  validatePrimaryBundle(bundle)
  return { bundle, report: { count: words.length, editorialDefinitions: Object.values(editorial).filter(edit => edit.definition).length, editorialExamples: Object.values(editorial).filter(edit => edit.example).length, sourceGeneratedAt: dataset.generated_at, gaps, reviewScope: '全量自动字段检查；补充释义与原创例句经模型逐项复核。原词典例句未逐句人工审校。' } }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), option = (name, fallback) => { const index = args.indexOf(name); return index < 0 ? fallback : args[index + 1] }
  try {
    const out = option('--out', 'src/data/cfa-wordbook.json')
    if (args.includes('--check')) {
      const bundle = JSON.parse(await readFile(out, 'utf8')); validatePrimaryBundle(bundle)
      if (bundle.words.length !== 1152 || bundle.books.length !== 1 || bundle.books[0].members.length !== 1152) throw new Error('CFA production counts mismatch')
      for (const word of bundle.words) if (!/[\u3400-\u9fff]/u.test(word.meaningZh) || !word.examples.length) throw new Error(`Incomplete CFA word: ${word.term}`)
      console.log('CFA: 1,152 terms, examples and catalog references verified')
    } else {
      const input = option('--source'); if (!input) throw new Error('Provide --source PATH')
      const data = JSON.parse(await readFile(input, 'utf8'))
      const editorial = JSON.parse(await readFile('src/data/cfa-editorial.json', 'utf8'))
      const { bundle, report } = normalizeCfaDataset(data, editorial)
      await writeFile(out, JSON.stringify(bundle) + '\n')
      await writeFile(option('--report', 'docs/cfa-vocabulary-report.json'), JSON.stringify(report, null, 2) + '\n')
      console.log(JSON.stringify(report))
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
