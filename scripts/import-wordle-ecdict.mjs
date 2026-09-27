import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

export const SOURCE_REVISION = 'bc015ed2e24a7abef49fc6dbbb7fe32c1dadaf8b'
const SOURCE_SHA256 = '1a6947e04785db63613a92e14903cdae7954f7e84860b10e68e5c7cbb3f9c3cf'

export function verifySource(csv) {
  const hash = createHash('sha256').update(csv).digest('hex')
  if (hash !== SOURCE_SHA256) throw new Error('ECDICT source checksum mismatch; download the pinned revision')
  return hash
}

// RFC 4180 fields, including quoted commas/newlines and doubled quotes.
function* rows(csv) {
  let row = [], field = '', quoted = false, closed = false
  for (let i = 0; i < csv.length; i++) {
    const c = csv[i]
    if (quoted) {
      if (c === '"' && csv[i + 1] === '"') { field += '"'; i++ }
      else if (c === '"') { quoted = false; closed = true }
      else field += c
    } else if (c === ',' || c === '\n' || c === '\r') {
      row.push(field); field = ''; closed = false
      if (c !== ',') { if (c === '\r' && csv[i + 1] === '\n') i++; yield row; row = [] }
    } else if (c === '"' && !field && !closed) quoted = true
    else { if (closed || c === '"') throw new Error('Malformed CSV'); field += c }
  }
  if (quoted) throw new Error('Unterminated CSV field')
  if (field || closed || row.length) { row.push(field); yield row }
}

export function extractWordleDictionary(csv) {
  const iterator = rows(csv.replace(/^\uFEFF/, ''))
  const header = iterator.next().value ?? []
  const wordIndex = header.indexOf('word'), translationIndex = header.indexOf('translation')
  if (wordIndex < 0 || translationIndex < 0) throw new Error('Missing word/translation columns')
  const entries = new Map()
  for (const row of iterator) {
    if (row.length === 1 && !row[0]) continue
    if (row.length !== header.length) throw new Error('Invalid CSV column count')
    const term = row[wordIndex]
    // Do not turn proper names/abbreviations into ordinary lowercase guesses.
    if (!/^[a-z]{5}$/.test(term) || entries.has(term)) continue
    const meanings = row[translationIndex].split(/\\n|\r?\n/).map(s => s.trim())
      .filter(s => /[\u3400-\u9fff]/.test(s) && !/<[^>]*>/.test(s)).slice(0, 3).map(s => s.slice(0, 500))
    if (meanings.length) entries.set(term, meanings)
  }
  return [...entries].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const input = process.argv[2]
  if (!input) throw new Error('Usage: node scripts/import-wordle-ecdict.mjs /path/to/ecdict.csv')
  const csv = readFileSync(input, 'utf8')
  const sourceSha256 = verifySource(csv)
  const entries = extractWordleDictionary(csv)
  if (entries.length < 1000) throw new Error('Unexpectedly small dictionary; refusing import')
  const result = { sourceRevision: SOURCE_REVISION, sourceSha256, entries }
  const output = new URL('../src/wordle/ecdict-five.json', import.meta.url)
  writeFileSync(output, JSON.stringify(result) + '\n')
  console.log(JSON.stringify({ words: entries.length, bytes: Buffer.byteLength(JSON.stringify(result)), output: fileURLToPath(output) }))
}
