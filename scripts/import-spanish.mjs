import { createReadStream } from 'node:fs'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const UPSTREAM_SHA256 = '1019e86ddfea8bb366db80bafcb20d22db7cf2bddd2337004a7a7b270fbab892'
const SELECTED_SHA256 = '0554f1b655862b49c8eb116ec97a400a4ba9fba7fddb1e03e85d5485497ce660'

export function selectVerbForms(record) {
  const seen = new Set()
  return (record.forms ?? []).flatMap(({ form, tags = [] }) => {
    const tense = ['present', 'preterite', 'imperfect', 'future'].find(t => tags.includes(t))
    const person = ['first-person', 'second-person', 'third-person'].findIndex(p => tags.includes(p)) + 1
    const number = tags.includes('plural') ? 'plural' : tags.includes('singular') ? 'singular' : undefined
    if (!tags.includes('indicative') || tags.includes('vos-form') || !tense || !person || !number) return []
    const key = `${tense}:${person}:${number}`
    if (seen.has(key)) return []
    seen.add(key)
    return [{ form, tense, person, number, pronoun: (number === 'singular' ? ['yo', 'tú', 'él/ella/usted'] : ['nosotros', 'vosotros', 'ellos/ellas/ustedes'])[person - 1] }]
  })
}

// Deliberately offline after download. Never silently refresh a pinned snapshot.
export async function extract(sourcePath, outputDir) {
  const root = fileURLToPath(new URL('../', import.meta.url))
  const legacy = await readFile(path.join(root, 'src/data/vocabulary.ts'), 'utf8')
  const wanted = new Set([...legacy.matchAll(/\['([^']+)', '[^']+', '(?:名词|动词|形容词|数词|副词|代词|短语|感叹词)'\]/g)].map(m => m[1]))
  const hash = createHash('sha256')
  const input = createReadStream(sourcePath)
  input.on('data', chunk => hash.update(chunk))
  const selected = []
  for await (const line of createInterface({ input, crlfDelay: Infinity })) {
    const record = JSON.parse(line)
    if (record.lang_code === 'es' && wanted.has(record.word)) selected.push(line)
  }
  const raw = selected.join('\n') + '\n'
  const snapshotHash = createHash('sha256').update(raw).digest('hex')
  const inputHash = hash.digest('hex')
  if (![UPSTREAM_SHA256, SELECTED_SHA256].includes(inputHash) || snapshotHash !== SELECTED_SHA256) {
    throw new Error('Unpinned Spanish source: review a new snapshot and its metadata explicitly before importing')
  }
  const wordLines = new Map([...wanted].map(word => [word, []]))
  for (const line of selected) wordLines.get(JSON.parse(line).word).push(line)
  const wordRevisions = Object.fromEntries([...wordLines].map(([word, lines]) => [word, `sha256:${createHash('sha256').update(lines.join('\n') + '\n').digest('hex')}`]))
  const records = selected.map(line => {
    const r = JSON.parse(line)
    return { word: r.word, pos: r.pos, tags: r.tags ?? [], senses: (r.senses ?? []).map(s => ({ tags: s.tags ?? [], form_of: s.form_of ?? [] })), forms: (r.forms ?? []).map(f => ({ form: f.form, tags: f.tags ?? [] })), verbs: r.pos === 'verb' ? selectVerbForms(r) : [] }
  })
  const missing = [...wanted].filter(word => !records.some(r => r.word === word))
  if (missing.length) throw new Error(`Source missing: ${missing.join(', ')}`)
  await mkdir(outputDir, { recursive: true })
  await writeFile(path.join(outputDir, 'kaikki-selected.jsonl'), raw)
  await writeFile(path.join(outputDir, 'grammar-source.json'), JSON.stringify({
    source: {
      url: 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl',
      indexUrl: 'https://kaikki.org/dictionary/Spanish/index.html',
      dumpDate: '2026-09-02', extractedAt: '2026-09-25', retrievedAt: '2026-09-27',
      wiktextract: ['1a05e46', 'e3d6d4e'], license: 'CC-BY-SA-4.0',
      upstreamSha256: UPSTREAM_SHA256, revision: `sha256:${snapshotHash}`,
      selectedRecords: records.length, selectedLemmas: wanted.size,
    }, wordRevisions, records,
  }, null, 2) + '\n')
  const courseRecords = records.filter(r => r.verbs.length || ['noun', 'adj', 'det', 'pron', 'adv', 'num', 'intj', 'phrase'].includes(r.pos)).map(r => ({
    word: r.word, pos: r.pos,
    tags: [...new Set([...r.tags, ...r.senses.flatMap(s => s.tags), ...r.forms.filter(f => f.tags.includes('canonical')).flatMap(f => f.tags)])].filter(t => ['feminine', 'masculine', 'by-personal-gender', 'uncountable', 'invariable'].includes(t)),
    forms: r.forms.filter(f => f.tags.some(t => ['plural', 'feminine', 'masculine'].includes(t)) && !f.tags.some(t => ['comparative', 'superlative', 'participle', 'canonical', 'alternative'].includes(t)) && !f.form.includes(' ')),
    verbs: r.verbs,
  })).map(r => r.verbs.length ? { ...r, forms: [] } : r)
  await writeFile(path.join(outputDir, 'course-source.json'), JSON.stringify({ source: { url: 'https://kaikki.org/dictionary/Spanish/kaikki.org-dictionary-Spanish.jsonl', license: 'CC-BY-SA-4.0' }, wordRevisions, records: courseRecords }) + '\n')
  console.log(`Pinned ${records.length} records for ${wanted.size} words; sha256:${snapshotHash}`)
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('Usage: node scripts/import-spanish.mjs /path/to/download.jsonl [output-dir]')
  await extract(process.argv[2], process.argv[3] ?? fileURLToPath(new URL('../src/spanish/data/source/', import.meta.url)))
}
