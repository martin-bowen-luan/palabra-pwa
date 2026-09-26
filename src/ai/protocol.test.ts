import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { VocabularyEntry } from '../types'
import { DEFAULT_AI_SETTINGS, type AiSettings } from './types'
import { buildAnalysisIdentity, normalizeBaseUrl, requestAnalysis } from './protocol'

const cryptoModule = 'node:crypto'
const { webcrypto } = await import(/* @vite-ignore */ cryptoModule) as { webcrypto: Crypto }

const settings: AiSettings = { ...DEFAULT_AI_SETTINGS, enabled: true, model: 'deepseek-chat' }
const word: VocabularyEntry = {
  id: 'en-act', language: 'en', term: 'act', meaningZh: '行动', partOfSpeech: 'verb', category: 'private-category',
  examples: [{ text: 'Act now.', translationZh: '现在行动。', sourceUrl: 'https://private.example/source', author: 'private-author' }],
  relatedTerms: ['action'], derivedTerms: ['active'], roots: [{ part: 'act', meaningZh: '做', sourceUrl: 'https://private.example/root' }],
  source: { provider: 'private-provider', url: 'https://private.example/word' },
}
const empty = { derived: [], roots: [], synonyms: [], conflicts: [] }
const complete = {
  derived: [{ term: 'action', partOfSpeech: 'noun', meaningZh: '行动', relationship: '名词形式' }],
  roots: [{ part: 'act', kind: 'base', meaningZh: '做', explanation: '词基' }],
  synonyms: [{ term: 'do', meaningZh: '做', difference: '更通用' }],
  conflicts: [{ section: 'roots', term: 'act', explanation: '不确定其历史词源' }],
}
function response(content: unknown = empty, finish_reason: unknown = 'stop', messageExtra = {}) {
  return new Response(JSON.stringify({ choices: [{ finish_reason, message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content), ...messageExtra } }] }))
}
function request(fetcher: typeof fetch, signal = new AbortController().signal, config = settings) {
  return requestAnalysis(word, config, 'private-api-key', signal, fetcher)
}
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => vi.unstubAllGlobals())

describe('endpoint normalization', () => {
  it.each([
    [' https://API.deepseek.com/// ', 'https://api.deepseek.com'],
    ['https://example.com/compatible-mode/v1/', 'https://example.com/compatible-mode/v1'],
  ])('normalizes %s without inventing a version path', (input, expected) => expect(normalizeBaseUrl(input)).toBe(expected))
  it.each(['http://example.com', 'file:///secret', 'https://user:secret@example.com', 'https://example.com?key=secret', 'https://example.com#secret', 'https://example.com?', 'https://example.com#', 'https://example.com/v1/chat/completions/', 'https://example.com/v1/chat%2fcompletions', 'not a URL'])('rejects unsafe/full request URL %s', input => {
    expect(() => normalizeBaseUrl(input)).toThrow()
  })
})

describe('request privacy and generic compatibility', () => {
  it.each(['deepseek', 'qwen', 'custom'] as const)('sends only whitelisted input and portable chat parameters for %s', async provider => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response())
    await expect(request(fetcher, undefined, { ...settings, provider })).resolves.toEqual(empty)
    expect(fetcher).toHaveBeenCalledTimes(1)
    const [url, init] = fetcher.mock.calls[0]
    expect(url).toBe('https://api.deepseek.com/chat/completions')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', signal: expect.any(AbortSignal) })
    expect(new Headers(init?.headers).get('authorization')).toBe('Bearer private-api-key')
    const body = JSON.parse(init?.body as string)
    expect(Object.keys(body).sort()).toEqual(['max_tokens', 'messages', 'model', 'stream'])
    expect(body).toMatchObject({ model: 'deepseek-chat', max_tokens: 4096, stream: false })
    expect(body.messages[0]).toMatchObject({ role: 'system', content: expect.stringContaining('JSON') })
    expect(JSON.parse(body.messages[1].content)).toEqual({
      id: 'en-act', language: 'en', term: 'act', meaningZh: '行动', partOfSpeech: 'verb',
      examples: [{ text: 'Act now.', translationZh: '现在行动。' }], relatedTerms: ['action'], derivedTerms: ['active'], roots: [{ part: 'act', meaningZh: '做' }],
    })
    expect(init?.body).not.toContain('private')
  })
  it('requires a model before contacting a provider', async () => {
    const fetcher = vi.fn<typeof fetch>()
    await expect(request(fetcher, undefined, { ...settings, model: '  ' })).rejects.toThrow(/模型/)
    expect(fetcher).not.toHaveBeenCalled()
  })
  it.each([401, 403, 402, 429, 500])('returns safe Chinese error for HTTP %s without reading its body or retrying', async status => {
    const res = new Response('secret-provider-error-body', { status })
    const read = vi.spyOn(res, 'text')
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(res)
    const pattern = status === 401 || status === 403 ? /密钥|授权/ : status === 402 ? /余额/ : status === 429 ? /频繁|限流/ : /网络|连接/
    await expect(request(fetcher)).rejects.toThrow(pattern)
    expect(read).not.toHaveBeenCalled()
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
  it('does not expose transport error details', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('secret-url-and-key'))
    await expect(request(fetcher)).rejects.toThrow(/网络|连接/)
    await expect(request(fetcher)).rejects.not.toThrow(/secret/)
  })
  it('rejects an already aborted signal without sending, even for a custom abort reason', async () => {
    const controller = new AbortController()
    controller.abort('secret-reason')
    const fetcher = vi.fn<typeof fetch>()
    await expect(request(fetcher, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('maps cancellation during fetch to AbortError', async () => {
    const controller = new AbortController()
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => { controller.abort(); throw new TypeError('secret') })
    await expect(request(fetcher, controller.signal)).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('cancels a pending response-body read when its signal aborts', async () => {
    const controller = new AbortController()
    let startRead!: () => void
    const reading = new Promise<void>(resolve => { startRead = resolve })
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({ pull() { startRead() }, cancel() { cancelled = true } })
    const pending = request(vi.fn<typeof fetch>().mockResolvedValue(new Response(body)), controller.signal)
    const outcome = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await reading
    await new Promise(resolve => setTimeout(resolve, 0))
    controller.abort('private reason')
    await outcome
    expect(cancelled).toBe(true)
  }, 1000)
})

describe('bounded result validation', () => {
  it.each([empty, complete])('accepts complete JSON including empty cacheable results', async result => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(result)))).resolves.toEqual(result)
  })
  it('accepts a complete JSON code fence and drops extra fields recursively', async () => {
    const result = { ...complete, sourceUrl: 'https://untrusted', derived: [{ ...complete.derived[0], sourceUrl: 'https://untrusted', arbitrary: { secret: true } }] }
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response('```json\n' + JSON.stringify(result) + '\n```')))).resolves.toEqual(complete)
  })
  it.each(['length', 'content_filter', 'tool_calls', null])('rejects unfinished or refused completions (%s)', async reason => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(empty, reason)))).rejects.toThrow()
  })
  it('rejects an explicit refusal even with valid JSON', async () => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(empty, 'stop', { refusal: 'no' })))).rejects.toThrow(/拒绝/)
  })
  it('explains a truncated response distinctly from malformed JSON', async () => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(empty, 'length')))).rejects.toThrow(/截断/)
  })
  it.each([
    'not json', 'prefix ' + JSON.stringify(empty), '```json\n' + JSON.stringify(empty), 'null', '[]', '{}',
    { ...empty, derived: [{ term: 'x' }] }, { ...empty, roots: [{ ...complete.roots[0], kind: 'invented' }] },
    { ...empty, synonyms: [{ ...complete.synonyms[0], meaningZh: 42 }] },
    { ...empty, conflicts: [{ ...complete.conflicts[0], section: 'invented' }] },
    { ...empty, derived: Array(7).fill(complete.derived[0]) }, { ...empty, roots: Array(7).fill(complete.roots[0]) },
    { ...empty, synonyms: Array(6).fill(complete.synonyms[0]) }, { ...empty, conflicts: Array(7).fill(complete.conflicts[0]) },
    { ...empty, synonyms: [{ ...complete.synonyms[0], term: 'x'.repeat(121) }] },
    { ...empty, derived: [{ ...complete.derived[0], partOfSpeech: 'x'.repeat(81) }] },
    { ...empty, synonyms: [{ ...complete.synonyms[0], meaningZh: 'x'.repeat(501) }] },
    { ...empty, roots: [{ ...complete.roots[0], explanation: 'x'.repeat(1001) }] },
  ])('rejects malformed or excessive output %#', async result => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(result)))).rejects.toThrow()
  })
  it('bounds the response before parsing', async () => {
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(new Response(' '.repeat(131073))))).rejects.toThrow()
  })
  it('accepts every collection at its inclusive limit and each supported root kind', async () => {
    const result = {
      derived: Array(6).fill(complete.derived[0]),
      roots: ['root', 'prefix', 'suffix', 'base', 'mnemonic', 'base'].map(kind => ({ ...complete.roots[0], kind })),
      synonyms: Array(5).fill({ term: 'x'.repeat(120), meaningZh: '意'.repeat(500), difference: '文'.repeat(1000) }),
      conflicts: Array(6).fill(complete.conflicts[0]),
    }
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(response(result)))).resolves.toEqual(result)
  })
  it('cancels oversized streams without consuming their remaining chunks', async () => {
    let cancelled = false
    const body = new ReadableStream<Uint8Array>({
      pull(controller) { controller.enqueue(new Uint8Array(131073)) },
      cancel() { cancelled = true },
    })
    await expect(request(vi.fn<typeof fetch>().mockResolvedValue(new Response(body)))).rejects.toThrow(/无效|完整/)
    expect(cancelled).toBe(true)
  })
})

describe('cache identity', () => {
  it('is stable and excludes sources and learning metadata at every level', async () => {
    const a = await buildAnalysisIdentity(word, settings)
    const b = await buildAnalysisIdentity({ ...word, source: undefined, category: 'different', examples: [{ ...word.examples[0], sourceUrl: 'changed', author: 'changed' }], roots: [{ ...word.roots![0], sourceUrl: 'changed' }], reviewCount: 200 } as VocabularyEntry, { ...settings, enabled: false, revision: 20, provider: 'custom', baseUrl: settings.baseUrl + '/' })
    expect(a).toEqual(b)
    expect(a.inputHash).toMatch(/^[a-f0-9]{64}$/)
    expect(a.promptVersion).toBeGreaterThan(0)
    expect(a.key).not.toContain(word.meaningZh)
  })
  it.each([
    { term: 'action' }, { id: 'other' }, { language: 'es' }, { meaningZh: '做' }, { partOfSpeech: 'noun' },
    { examples: [{ text: 'Act.', translationZh: '行动。' }] }, { relatedTerms: ['actor'] }, { derivedTerms: [] },
    { roots: [{ part: 'a', meaningZh: '不同', sourceUrl: '' }] },
  ])('invalidates changed whitelisted input %#', async change => {
    const a = await buildAnalysisIdentity(word, settings)
    const b = await buildAnalysisIdentity({ ...word, ...change } as VocabularyEntry, settings)
    expect(b.inputHash).not.toBe(a.inputHash)
    expect(b.key).not.toBe(a.key)
  })
  it.each([{ baseUrl: 'https://other.example/v1' }, { model: 'another-model' }])('invalidates destination/model %#', async change => {
    const a = await buildAnalysisIdentity(word, settings)
    const b = await buildAnalysisIdentity(word, { ...settings, ...change })
    expect(b.inputHash).toBe(a.inputHash)
    expect(b.key).not.toBe(a.key)
  })
})
