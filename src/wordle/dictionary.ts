import { normalizeGuess } from './rules'
import type { WordleDictionaryEntry } from './types'

const unavailable = () => new Error('暂时无法验证这个词，请检查网络后手动重试。')
const missing = () => new Error('未找到有效英语词条，请换一个词。')
const parts = new Set(['Noun', 'Proper noun', 'Verb', 'Adjective', 'Adverb', 'Pronoun', 'Preposition', 'Conjunction', 'Interjection', 'Determiner', 'Article', 'Numeral', 'Particle', 'Contraction', 'Phrase'])

export function parseEnglishEntry(term: string, html: string, revisionId: number): WordleDictionaryEntry {
  // Template content is inert: never attach the fetched markup to the live document.
  const template = document.createElement('template')
  template.innerHTML = html
  const content = template.content
  content.querySelectorAll('script,style,iframe,object,embed,img,video,audio,link,meta').forEach(el => el.remove())
  let english = false, part = ''
  const definitions: WordleDictionaryEntry['definitions'] = []
  for (const element of content.querySelectorAll('h2,h3,h4,h5,h6,ol')) {
    if (element.tagName === 'H2') {
      if (english) break
      english = element.textContent?.trim() === 'English'
      continue
    }
    if (!english) continue
    if (element.tagName !== 'OL') {
      const title = element.textContent?.trim() ?? ''
      part = parts.has(title) ? title : ''
    } else if (part && !element.closest('li')) {
      for (const child of Array.from(element.children)) {
        if (child.tagName !== 'LI') continue
        const clone = child.cloneNode(true) as Element
        clone.querySelectorAll('dl,ul,ol,table,sup,.quotation,.citation,.reference,.mw-editsection').forEach(el => el.remove())
        const text = clone.textContent?.replace(/\s+/g, ' ').trim().slice(0, 600)
        if (text) definitions.push({ partOfSpeech: part, text })
        if (definitions.length === 3) break
      }
    }
    if (definitions.length === 3) break
  }
  if (!english || !definitions.length || !Number.isInteger(revisionId) || revisionId <= 0) throw unavailable()
  const ipa = content.querySelector('.IPA')?.textContent?.trim().slice(0, 150) || undefined
  return { term, definitions, ipa, source: 'wiktionary', sourceUrl: `https://en.wiktionary.org/w/index.php?title=${encodeURIComponent(term)}&oldid=${revisionId}`, revisionId, fetchedAt: new Date().toISOString() }
}

export class WiktionaryClient {
  private pending = new Map<string, Promise<WordleDictionaryEntry>>()
  constructor(private readonly fetcher: typeof fetch = fetch) {}

  lookup(term: string, signal?: AbortSignal): Promise<WordleDictionaryEntry> {
    if (!normalizeGuess(term) || normalizeGuess(term) !== term) return Promise.reject(new Error('请输入五个英文字母。'))
    if (signal?.aborted) return Promise.reject(new DOMException('Cancelled', 'AbortError'))
    const existing = this.pending.get(term)
    if (existing) return existing
    const task = this.request(term, signal).finally(() => { if (this.pending.get(term) === task) this.pending.delete(term) })
    this.pending.set(term, task)
    return task
  }

  private async request(term: string, parent?: AbortSignal): Promise<WordleDictionaryEntry> {
    const controller = new AbortController()
    const abort = () => controller.abort(new DOMException('Cancelled', 'AbortError'))
    parent?.addEventListener('abort', abort, { once: true })
    const timer = setTimeout(() => controller.abort(new Error('词典验证超时，请手动重试。')), 15000)
    const stopped = new Promise<never>((_, reject) => controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true }))
    const query = async (extra: Record<string, string>) => {
      const url = new URL('https://en.wiktionary.org/w/api.php')
      url.search = new URLSearchParams({ action: 'parse', page: term, format: 'json', formatversion: '2', redirects: '1', origin: '*', ...extra }).toString()
      const response = await this.fetcher(url.href, { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' })
      if (!response.ok) throw unavailable()
      const data = await response.json()
      if (data.error?.code === 'missingtitle') throw missing()
      if (data.error || !data.parse) throw unavailable()
      return data.parse
    }
    try {
      return await Promise.race([stopped, (async () => {
        const toc = await query({ prop: 'tocdata' })
        const sections: unknown = toc.tocdata?.sections
        if (!Array.isArray(sections)) throw unavailable()
        const english = sections.find(section => section?.hLevel === 2 && section.line === 'English')
        if (!english) throw missing()
        if (typeof english.index !== 'string' || !/^\d+$/.test(english.index)) throw unavailable()
        const parsed = await query({ prop: 'text|revid', section: english.index })
        if (typeof parsed.text !== 'string' || parsed.text.length > 2_000_000) throw unavailable()
        return parseEnglishEntry(term, parsed.text, parsed.revid)
      })()])
    } catch (error) {
      if (controller.signal.aborted) throw controller.signal.reason
      if (error instanceof Error && /未找到|暂时无法/.test(error.message)) throw error
      throw unavailable()
    } finally {
      clearTimeout(timer)
      parent?.removeEventListener('abort', abort)
    }
  }
}
