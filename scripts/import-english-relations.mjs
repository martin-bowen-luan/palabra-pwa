import { readFile, writeFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'
const run = promisify(execFile)
const affixes = { 'un-': '否定；相反', 're-': '再；重新', 'dis-': '否定；分离', 'in-': '不；向内（依词义）', 'im-': '不；向内（依词义）', 'inter-': '之间；相互', 'pre-': '之前', 'mis-': '错误地', 'over-': '过度；在上', 'under-': '不足；在下', '-ness': '性质；状态', '-ment': '行为；结果', '-ful': '具有；充满', '-less': '没有；缺乏', '-ly': '以某种方式；具有某种性质', '-er': '从事者；相关事物', '-or': '从事者；相关事物', '-able': '能够……的', '-ible': '能够……的', '-al': '与……有关的', '-ar': '与……有关的', '-y': '具有某种性质', '-ist': '从事者；信奉者', '-ism': '主义；行为或状态', '-ity': '性质；状态', '-ize': '使……化', '-ise': '使……化', '-ship': '身份；关系；状态', '-hood': '状态；时期', '-en': '使成为；由……制成' }

export function extractRelations(wikitext, vocabulary, sourceUrl) {
  const english = wikitext.split(/(?:^|\n)==English==\s*\n/u)[1]?.split(/\n==[^=]/u)[0] ?? ''
  const etymology = english.match(/===Etymology[^=]*===([\s\S]*?)(?=\n===[^=]|$)/u)?.[1] ?? ''
  const roots = []
  for (const match of etymology.matchAll(/\{\{(af|affix|suffix|prefix|compound)\|en\|([^{}]+)\}\}|\{\{ety\|en\|:af\|([^{}]+)\}\}/gu)) {
    const components = (match[2] ?? match[3]).split('|').filter(part => !part.includes('='))
    for (const [index, raw] of components.entries()) {
      // Legacy templates encode affix position without a hyphen. Never resolve
      // their affixes as standalone dictionary words (e.g. ant in accountant).
      const part = match[1] === 'suffix' && index > 0 ? `-${raw.replace(/^-/, '')}`
        : match[1] === 'prefix' && index < components.length - 1 ? `${raw.replace(/-$/, '')}-` : raw
      if (!/^-?[a-z]+-?$/u.test(part) || roots.some(r => r.part === part)) continue
      const meaningZh = affixes[part] ?? vocabulary.get(part)?.meaningZh
      if (meaningZh) roots.push({ part, meaningZh, sourceUrl })
    }
  }
  return roots
}

async function main() {
  const vocabulary = JSON.parse(await readFile('src/data/vocabulary-en.json', 'utf8'))
  const byTerm = new Map(vocabulary.map(w => [w.term, w]))
  const entries = {}
  const batches = []
  for (let i = 0; i < vocabulary.length; i += 40) batches.push(vocabulary.slice(i, i + 40).map(w => w.term))
  let completed = 0
  // Sequential batches respect the public API. Nothing fetched is retained except normalized relationships.
  for (const batch of batches) {
    const url = new URL('https://en.wiktionary.org/w/api.php')
    url.search = new URLSearchParams({ action: 'query', format: 'json', prop: 'revisions', rvprop: 'ids|content', rvslots: 'main', titles: batch.join('|'), redirects: '1' }).toString()
    const { stdout } = await run('curl', ['--fail', '--silent', '--show-error', '--retry', '2', '--max-time', '45', '-A', 'PalabraVocabulary/1.0 (public educational PWA; github.com/martin-bowen-luan/palabra-pwa)', url.href], { maxBuffer: 30 * 1024 * 1024 })
    const response = JSON.parse(stdout)
    if (response.error) throw new Error(JSON.stringify(response.error))
    for (const page of Object.values(response.query?.pages ?? {})) {
      if (!byTerm.has(page.title)) continue
      const revision = page.revisions?.[0]
      const sourceUrl = `https://en.wiktionary.org/w/index.php?title=${encodeURIComponent(page.title)}&oldid=${revision?.revid}`
      const roots = extractRelations(revision?.slots?.main?.['*'] ?? '', byTerm, sourceUrl)
      if (roots.length) entries[page.title] = { roots, relationSourceUrls: [sourceUrl] }
    }
    completed += batch.length
    if (completed % 400 === 0 || completed === vocabulary.length) console.log(`Read ${completed}/${vocabulary.length}; ${Object.keys(entries).length} words with source-backed components`)
  }
  for (const [term, entry] of Object.entries({ ...entries })) {
    for (const root of entry.roots ?? []) {
      if (root.part.startsWith('-') || root.part.endsWith('-') || root.part === term || !byTerm.has(root.part)) continue
      const base = entries[root.part] ??= { roots: [], relationSourceUrls: [] }
      base.derivedTerms = [...new Set([...(base.derivedTerms ?? []), term])]
      base.relationSourceUrls = [...new Set([...base.relationSourceUrls, root.sourceUrl])]
    }
  }
  const output = { provider: 'Wiktionary contributors', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', fetchedAt: new Date().toISOString(), entries }
  await writeFile('src/data/english-relations.json', JSON.stringify(output) + '\n')
  console.log(`Saved ${Object.keys(entries).length} enriched entries`)
}
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
