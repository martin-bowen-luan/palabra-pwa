// @vitest-environment node
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
const importer = await import('./import-spanish.mjs').catch(() => ({}))
test('selects standard indicative forms and preserves ambiguous spellings by analysis', () => {
  const result = importer.selectVerbForms?.({ forms: [
    { form: 'hablamos', tags: ['first-person', 'indicative', 'plural', 'present'] },
    { form: 'hablamos', tags: ['first-person', 'indicative', 'plural', 'preterite'] },
    { form: 'hablás', tags: ['second-person', 'indicative', 'singular', 'present', 'vos-form'] },
    { form: 'hables', tags: ['second-person', 'subjunctive', 'singular', 'present'] },
    { form: 'habláis', tags: ['second-person', 'indicative', 'plural', 'present'] },
  ] })
  assert.deepEqual(result, [
    { form: 'hablamos', tense: 'present', person: 1, number: 'plural', pronoun: 'nosotros' },
    { form: 'hablamos', tense: 'preterite', person: 1, number: 'plural', pronoun: 'nosotros' },
    { form: 'habláis', tense: 'present', person: 2, number: 'plural', pronoun: 'vosotros' },
  ])
})

test('reproduces source extracts and lean runtime facts inside the requested output directory', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'spanish-import-test-'))
  try {
    const input = new URL('../src/spanish/data/source/kaikki-selected.jsonl', import.meta.url)
    await importer.extract(input, output)
    const lean = JSON.parse(await readFile(path.join(output, 'course-source.json'), 'utf8'))
    const original = JSON.parse(await readFile(new URL('../src/spanish/data/source/course-source.json', import.meta.url), 'utf8'))
    assert.deepEqual(lean, original)
    assert.ok(Buffer.byteLength(JSON.stringify(lean)) < 200_000)
    const regenerated = JSON.parse(await readFile(path.join(output, 'grammar-source.json'), 'utf8'))
    const pinned = JSON.parse(await readFile(new URL('../src/spanish/data/source/grammar-source.json', import.meta.url), 'utf8'))
    assert.deepEqual(regenerated, pinned)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})

test('verifies every per-word revision against the exact retained source lines', async () => {
  const raw = await readFile(new URL('../src/spanish/data/source/kaikki-selected.jsonl', import.meta.url), 'utf8')
  const manifest = JSON.parse(await readFile(new URL('../src/spanish/data/source/grammar-source.json', import.meta.url), 'utf8'))
  const hash = value => `sha256:${createHash('sha256').update(value).digest('hex')}`
  assert.equal(hash(raw), manifest.source.revision)
  const words = new Map()
  for (const line of raw.trimEnd().split('\n')) {
    const word = JSON.parse(line).word
    words.set(word, (words.get(word) ?? '') + line + '\n')
  }
  assert.equal(words.size, 299)
  for (const [word, lines] of words) assert.equal(hash(lines), manifest.wordRevisions[word], word)
})

test('rejects an unpinned input instead of labeling arbitrary data as the dated Kaikki snapshot', async () => {
  const output = await mkdtemp(path.join(tmpdir(), 'spanish-unpinned-test-'))
  try {
    const raw = await readFile(new URL('../src/spanish/data/source/kaikki-selected.jsonl', import.meta.url), 'utf8')
    const input = path.join(output, 'untrusted.jsonl')
    await writeFile(input, raw + '{}\n')
    await assert.rejects(importer.extract(input, path.join(output, 'result')), /unpinned/i)
  } finally {
    await rm(output, { recursive: true, force: true })
  }
})
