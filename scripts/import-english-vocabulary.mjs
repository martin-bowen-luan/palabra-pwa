import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const EXPECTED_COUNT = 3464
const DEFAULT_INPUT = '/home/martin/Desktop/wordlist/koolearn_words.json'
const DEFAULT_ERRORS = '/home/martin/Desktop/wordlist/koolearn_words.errors.csv'
const DEFAULT_OUTPUT = resolve('src/data/vocabulary-en.json')
const DEFAULT_MANIFEST = resolve('public/audio/en/manifest.json')
const DEFAULT_REPORT = resolve('docs/english-vocabulary-report.json')

const spellingVariantPairs = [
  ['analyse', 'analyze'], ['apologise', 'apologize'], ['behaviour', 'behavior'],
  ['centre', 'center'], ['colour', 'color'], ['defence', 'defense'],
  ['favourite', 'favorite'], ['favour', 'favor'], ['honour', 'honor'],
  ['labour', 'labor'], ['metre', 'meter'], ['neighbour', 'neighbor'],
  ['organise', 'organize'], ['practice', 'practise'], ['programme', 'program'],
  ['realise', 'realize'], ['theatre', 'theater'], ['traveller', 'traveler'],
]

const spellingVariants = new Map()
for (const [uk, us] of spellingVariantPairs) {
  spellingVariants.set(uk, [us])
  spellingVariants.set(us, [uk])
}

const definitionOverrides = new Map([
  ['ad', { partOfSpeech: 'n.', meaningZh: '广告；公元' }],
  ['hotdog', { partOfSpeech: 'n.', meaningZh: '热狗' }],
  ['seaweed', { partOfSpeech: 'n.', meaningZh: '海草；海藻' }],
])

const exampleSupplements = new Map(Object.entries({
  homestay: { text: 'My homestay family made me feel welcome.', translationZh: '寄宿家庭让我感到很受欢迎。', sourceId: 'editorial:homestay' },
  graphology: { text: 'Graphology studies handwriting.', translationZh: '笔迹学研究书写特征。', sourceId: 'editorial:graphology' },
  widow: { text: 'The widow mourned her husband for a long time.', translationZh: '寡妇为她的丈夫哀悼了很久。', sourceId: 'tatoeba:8533307', sourceUrl: 'https://tatoeba.org/en/sentences/show/8533307', author: 'fucongcong', license: 'CC BY 2.0 FR' },
  ess: { text: 'The word “class” ends with an ess.', translationZh: '单词 class 以字母 S 结尾。', sourceId: 'editorial:ess' },
  'p.m.': { text: 'The meeting ended at 4 p.m.', translationZh: '会议于下午4点结束。', sourceId: 'tatoeba:11985558', sourceUrl: 'https://tatoeba.org/en/sentences/show/11985558', author: 'Martha', license: 'CC BY 2.0 FR' },
  bc: { text: 'This temple was built in 200 BC.', translationZh: '这座寺庙建于公元前200年。', sourceId: 'editorial:bc' },
  't-shirt': { text: 'Which T-shirt is red?', translationZh: '哪一件T恤是红色的？', sourceId: 'tatoeba:687434', sourceUrl: 'https://tatoeba.org/en/sentences/show/687434', author: 'cienias', license: 'CC BY 2.0 FR' },
  stateswoman: { text: 'She was respected as an experienced stateswoman.', translationZh: '她作为一位经验丰富的女政治家备受尊敬。', sourceId: 'editorial:stateswoman' },
  'x-ray': { text: 'Do I need X-rays?', translationZh: '我需要拍X光片吗？', sourceId: 'tatoeba:434520', sourceUrl: 'https://tatoeba.org/en/sentences/show/434520', author: 'GlossaMatik', license: 'CC BY 2.0 FR' },
  hotdog: { text: 'I bought a hotdog for lunch.', translationZh: '午餐我买了一个热狗。', sourceId: 'editorial:hotdog' },
  heep: { text: 'HEEP is a measure used in chromatography.', translationZh: 'HEEP 是色谱分析中使用的一种度量。', sourceId: 'editorial:heep' },
  alary: { text: 'The insect has alary muscles near its wings.', translationZh: '这种昆虫的翅膀附近有翼肌。', sourceId: 'editorial:alary' },
  pe: { text: 'PE can stand for physical education.', translationZh: 'PE 可以表示体育课。', sourceId: 'editorial:pe' },
  hod: { text: 'The worker carried bricks in a hod.', translationZh: '工人用灰浆桶搬砖。', sourceId: 'editorial:hod' },
  ticktock: { text: 'The clock went ticktock all night.', translationZh: '时钟整夜滴答作响。', sourceId: 'editorial:ticktock' },
  'a.m.': { text: 'He set off at 4 a.m.', translationZh: '他早上4点出发了。', sourceId: 'tatoeba:10616429', sourceUrl: 'https://tatoeba.org/en/sentences/show/10616429', author: 'fucongcong', license: 'CC BY 2.0 FR' },
  illy: { text: 'He was illy prepared for the difficult task.', translationZh: '他对这项艰巨任务准备得很不充分。', sourceId: 'editorial:illy' },
  search: { text: 'Search!', translationZh: '搜索！', sourceId: 'tatoeba:9353250', sourceUrl: 'https://tatoeba.org/en/sentences/show/9353250', author: 'LeviHighway', license: 'CC BY 2.0 FR' },
}))

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim()
}

function parseDefinition(definition) {
  const normalized = cleanText(definition)
  const firstChinese = normalized.search(/[\u3400-\u9fff]/u)
  if (firstChinese < 0) return { partOfSpeech: '', meaningZh: normalized }
  const prefix = normalized.slice(0, firstChinese)
  const openingBracket = prefix.search(/[\[［【（(〈“]/u)
  const meaningStart = openingBracket >= 0 ? openingBracket : firstChinese
  const partOfSpeech = normalized.slice(0, meaningStart).trim().replace(/[|；;]+$/u, '').trim()
  const meanings = normalized.slice(meaningStart)
    .split(/[；;|]/u)
    .map((item) => cleanText(item).replace(/[，,。]+$/u, ''))
    .filter(Boolean)
    .slice(0, 3)
  return { partOfSpeech, meaningZh: meanings.join('；') }
}

function parseBilingualDefinition(sections) {
  const section = Array.isArray(sections) ? sections.find((item) => item?.title === '双语释义') : undefined
  const lines = String(section?.text ?? '').split(/\r?\n/u).map(cleanText).filter(Boolean)
  const partOfSpeech = lines.find((line) => /^[a-z][a-z.&\s]*\.?$/iu.test(line)) ?? ''
  const meanings = lines
    .filter((line) => /[\u3400-\u9fff]/u.test(line) && !/^[（(].*[）)]$/u.test(line))
    .map((line) => line.startsWith('[') && line.includes(']') ? line.slice(line.indexOf(']') + 1).trim() : line)
    .slice(0, 3)
  return { partOfSpeech, meaningZh: meanings.join('；') }
}

function parseExamples(sections) {
  const section = Array.isArray(sections) ? sections.find((item) => item?.title === '双语例句') : undefined
  if (!section?.text) return []
  const lines = String(section.text).split(/\r?\n/u).map(cleanText).filter(Boolean)
  const examples = []
  for (let index = 0; index < lines.length - 1 && examples.length < 3; index += 1) {
    const text = lines[index]
    const translationZh = lines[index + 1]
    const isUsageHeading = /^(用作|作为).*[（(].*[）)]$/u.test(text)
    if (!isUsageHeading && /[A-Za-z]/u.test(text) && /[\u3400-\u9fff]/u.test(translationZh)) {
      examples.push({ text, translationZh })
      index += 1
    }
  }
  return examples
}

function parseUsPronunciation(pronunciations) {
  if (!Array.isArray(pronunciations)) return undefined
  const source = pronunciations.find((item) => /^美/u.test(cleanText(item?.text)))
    ?? pronunciations.find((item) => item?.audio_url)
  if (!source) return undefined
  const pronunciationText = cleanText(source.text)
  const bracketStart = pronunciationText.indexOf('[')
  const bracketEnd = pronunciationText.lastIndexOf(']')
  const ipa = bracketStart >= 0 && bracketEnd > bracketStart
    ? pronunciationText.slice(bracketStart + 1, bracketEnd)
    : ''
  return {
    ipa: ipa ? `/${ipa}/` : '',
    accent: /^英/u.test(pronunciationText) ? 'uk' : 'us',
    ...(source.audio_url ? {
      audioPath: source.audio_url,
      audioKind: 'human',
      sourceUrl: source.audio_url,
    } : {}),
  }
}

export function normalizeEnglishRecord(record, index) {
  if (record?.schema_version !== 2) throw new Error(`Record ${index + 1} has invalid schema_version`)
  const term = cleanText(record.word).toLocaleLowerCase('en-US')
  if (!term) throw new Error(`Record ${index + 1} is missing word`)
  const primaryDefinition = parseDefinition(record.definition)
  const extractedDefinition = primaryDefinition.meaningZh
    ? primaryDefinition
    : parseBilingualDefinition(record.sections)
  const { partOfSpeech, meaningZh } = extractedDefinition.meaningZh
    ? extractedDefinition
    : (definitionOverrides.get(term) ?? extractedDefinition)
  if (!meaningZh) throw new Error(`Record ${index + 1} (${term}) is missing definition`)
  const sourceExamples = parseExamples(record.sections)
  return {
    id: `en:${term}`,
    language: 'en',
    term,
    partOfSpeech,
    meaningZh,
    category: '高考 3500',
    examples: sourceExamples.length ? sourceExamples : (exampleSupplements.has(term) ? [exampleSupplements.get(term)] : []),
    pronunciation: parseUsPronunciation(record.pronunciations),
    spellingVariants: spellingVariants.get(term) ?? [],
    source: {
      provider: '新东方在线词典',
      url: cleanText(record.url || record.source_page),
      ...(record.fetched_at ? { fetchedAt: record.fetched_at } : {}),
    },
  }
}

export function validateCorpus(records, expectedCount = EXPECTED_COUNT) {
  if (!Array.isArray(records)) throw new Error('Vocabulary corpus must be a JSON array')
  if (records.length !== expectedCount) throw new Error(`Expected ${expectedCount} records, received ${records.length}`)
  const normalized = records.map(normalizeEnglishRecord)
  const seen = new Set()
  for (const entry of normalized) {
    if (seen.has(entry.term)) throw new Error(`Vocabulary corpus contains duplicate term: ${entry.term}`)
    seen.add(entry.term)
  }
  return normalized
}

export function validateErrorReport(csv) {
  const rows = String(csv).split(/\r?\n/u).map((line) => line.trim()).filter(Boolean)
  if (rows.length > 1) throw new Error(`Crawler error report contains ${rows.length - 1} error report row(s)`)
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(value)}\n`, 'utf8')
}

export async function importEnglishVocabulary({
  input = DEFAULT_INPUT,
  errors = DEFAULT_ERRORS,
  output = DEFAULT_OUTPUT,
  manifest = DEFAULT_MANIFEST,
  report = DEFAULT_REPORT,
} = {}) {
  const [sourceJson, errorCsv] = await Promise.all([readFile(input, 'utf8'), readFile(errors, 'utf8')])
  validateErrorReport(errorCsv)
  const entries = validateCorpus(JSON.parse(sourceJson))
  const missingExamples = entries.filter((entry) => !entry.examples.length).map((entry) => entry.term)
  const missingPronunciations = entries.filter((entry) => !entry.pronunciation?.audioPath).map((entry) => entry.term)
  const audioFiles = entries.flatMap((entry) => entry.pronunciation?.audioPath ? [{
    id: entry.id,
    term: entry.term,
    url: entry.pronunciation.audioPath,
    kind: entry.pronunciation.audioKind,
  }] : [])

  await Promise.all([
    writeJson(output, entries),
    writeJson(manifest, { version: 1, language: 'en', count: audioFiles.length, files: audioFiles }),
    writeJson(report, {
      generatedAt: new Date().toISOString(),
      expectedCount: EXPECTED_COUNT,
      importedCount: entries.length,
      audioCount: audioFiles.length,
      missingExamples,
      missingPronunciations,
    }),
  ])
  return { entries, missingExamples, missingPronunciations, audioFiles }
}

const isCli = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href
if (isCli) {
  importEnglishVocabulary().then(({ entries, missingExamples, missingPronunciations, audioFiles }) => {
    console.log(`Imported ${entries.length} words; ${audioFiles.length} audio URLs; ${missingExamples.length} without examples; ${missingPronunciations.length} without audio.`)
    if (missingExamples.length) process.exitCode = 2
  }).catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
