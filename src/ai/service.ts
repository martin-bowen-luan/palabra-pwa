import type { PalabraStorage } from '../data/storage'
import type { VocabularyEntry } from '../types'
import { DEFAULT_AI_SETTINGS, type AiSettings, type EncryptedCredential, type WordAiAnalysis } from './types'
import { decryptCredential, encryptCredential } from './crypto'
import { buildAnalysisIdentity, normalizeBaseUrl, requestAnalysis } from './protocol'

interface AiSnapshot {
  ready: boolean
  settings: AiSettings
  hasCredential: boolean
  unlocked: boolean
  busy: boolean
  cacheEpoch: number
  wordCacheEpochs: Record<string, number>
  error?: string
}
interface Task { key: string; wordId: string; controller: AbortController; promise: Promise<WordAiAnalysis>; consumers: number; settled: boolean }
function aborted(): DOMException { return new DOMException('操作已取消', 'AbortError') }
function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise
  if (signal.aborted) return Promise.reject(aborted())
  return new Promise((resolve, reject) => {
    const stop = () => reject(aborted())
    signal.addEventListener('abort', stop, { once: true })
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', stop))
  })
}

/** Owns in-memory secrets and request lifecycle; never puts secrets in a React snapshot. */
export class AiService {
  private snapshot: AiSnapshot = { ready: false, settings: { ...DEFAULT_AI_SETTINGS }, hasCredential: false, unlocked: false, busy: false, cacheEpoch: 0, wordCacheEpochs: {} }
  private listeners = new Set<() => void>()
  private credential?: EncryptedCredential
  private apiKey?: string
  private generation = 0
  private wordGenerations = new Map<string, number>()
  private task?: Task
  private channel?: BroadcastChannel
  constructor(private readonly storage: PalabraStorage, private readonly fetcher: typeof fetch = (...args) => fetch(...args)) {}
  getSnapshot = (): AiSnapshot => this.snapshot
  subscribe = (listener: () => void): (() => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener) }
  private emit(patch: Partial<AiSnapshot>) { this.snapshot = { ...this.snapshot, ...patch }; this.listeners.forEach(listener => listener()) }
  private notify(kind: 'configuration' | 'cache', wordId?: string) { this.channel?.postMessage({ kind, wordId }) }
  private cacheDeleted(wordId?: string) {
    if (wordId) this.emit({ wordCacheEpochs: { ...this.snapshot.wordCacheEpochs, [wordId]: (this.snapshot.wordCacheEpochs[wordId] ?? 0) + 1 } })
    else this.emit({ cacheEpoch: this.snapshot.cacheEpoch + 1, wordCacheEpochs: {} })
  }
  private invalidate() { this.generation++; this.task?.controller.abort(); this.apiKey = undefined; this.emit({ unlocked: false }) }

  async load(): Promise<void> {
    if (!this.channel && typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(this.storage.aiChannelName)
      this.channel.onmessage = event => {
        if (event.data?.kind === 'configuration') { this.invalidate(); void this.load() }
        if (event.data?.kind === 'cache') {
          const wordId = typeof event.data.wordId === 'string' ? event.data.wordId : undefined
          this.cancelAnalyses(wordId); this.cacheDeleted(wordId)
        }
      }
    }
    const generation = this.generation
    try {
      const config = await this.storage.getAiConfiguration()
      if (generation !== this.generation) return
      if (config.settings.revision !== this.snapshot.settings.revision) this.invalidate()
      this.credential = config.credential
      this.emit({ ready: true, settings: config.settings.revision === this.snapshot.settings.revision ? this.snapshot.settings : config.settings, hasCredential: Boolean(config.credential), error: undefined })
    } catch { this.emit({ ready: true, error: '无法读取 AI 本地设置；背词功能仍可使用。' }) }
  }

  async configure(draft: AiSettings, apiKey: string, password: string): Promise<void> {
    const baseUrl = normalizeBaseUrl(draft.baseUrl)
    if (!draft.model.trim() || draft.model.length > 120) throw new Error('请填写有效的模型名。')
    if (draft.consentVersion !== 1) throw new Error('请先阅读并同意数据与费用说明。')
    this.invalidate()
    const generation = this.generation
    const credential = await encryptCredential(apiKey.trim(), password, baseUrl)
    if (generation !== this.generation) throw aborted()
    const config = await this.storage.saveAiConfiguration({ ...draft, baseUrl, model: draft.model.trim(), revision: this.snapshot.settings.revision }, credential)
    if (generation !== this.generation) { await this.load(); throw aborted() }
    this.credential = credential
    this.apiKey = config.settings.enabled ? apiKey.trim() : undefined
    this.emit({ settings: config.settings, hasCredential: true, unlocked: Boolean(this.apiKey), error: undefined })
    this.notify('configuration')
  }

  async setEnabled(enabled: boolean, consent = false): Promise<void> {
    const settings = this.snapshot.settings
    if (enabled && !consent && settings.consentVersion !== 1) throw new Error('请先阅读并同意数据与费用说明。')
    this.invalidate()
    const saved = await this.storage.saveAiConfiguration({ ...settings, enabled, consentVersion: consent ? 1 : settings.consentVersion }, this.credential)
    this.emit({ settings: saved.settings }); this.notify('configuration')
  }

  async unlock(password: string): Promise<void> {
    if (!this.snapshot.settings.enabled) throw new Error('请先启用 AI 模式。')
    if (!this.credential) throw new Error('请先配置 API 密钥。')
    const generation = this.generation
    const credential = this.credential
    const settings = this.snapshot.settings
    const key = await decryptCredential(credential, password, settings.baseUrl)
    const current = await this.storage.getAiConfiguration()
    if (generation !== this.generation || current.settings.revision !== settings.revision || current.credential?.credentialId !== credential.credentialId) {
      throw new Error('配置已变化，请刷新设置后重新解锁。')
    }
    this.apiKey = key.trim(); this.emit({ unlocked: true })
  }
  lock(): void { this.invalidate() }
  cancelRequests(): void { this.generation++; this.task?.controller.abort() }
  private cancelAnalyses(wordId?: string): void {
    if (!wordId) { this.cancelRequests(); return }
    this.wordGenerations.set(wordId, (this.wordGenerations.get(wordId) ?? 0) + 1)
    if (this.task?.wordId === wordId) this.task.controller.abort()
  }
  async clearConfiguration(): Promise<void> {
    this.invalidate()
    const saved = await this.storage.saveAiConfiguration({ ...DEFAULT_AI_SETTINGS, revision: this.snapshot.settings.revision })
    this.credential = undefined
    this.emit({ settings: saved.settings, hasCredential: false }); this.notify('configuration')
  }
  async clearAnalyses(wordId?: string): Promise<void> {
    this.cancelAnalyses(wordId)
    await this.storage.clearAiAnalyses(wordId)
    this.cacheDeleted(wordId); this.notify('cache', wordId)
  }

  private join(task: Task, signal?: AbortSignal): Promise<WordAiAnalysis> {
    task.consumers++
    return abortable(task.promise, signal).finally(() => {
      task.consumers--
      queueMicrotask(() => { if (!task.settled && task.consumers === 0) task.controller.abort() })
    })
  }

  async analyze(word: VocabularyEntry, options: { force?: boolean; signal?: AbortSignal } = {}): Promise<WordAiAnalysis> {
    const settings = this.snapshot.settings
    if (!settings.enabled || word.language !== 'en') throw new Error('AI 分析仅在英语 AI 模式下可用。')
    if (!settings.model) throw new Error('请先在设置中配置模型。')
    const generation = this.generation
    const wordGeneration = this.wordGenerations.get(word.id) ?? 0
    const invalidated = () => generation !== this.generation || wordGeneration !== (this.wordGenerations.get(word.id) ?? 0)
    const cancelled = () => options.signal?.aborted || invalidated()
    const identity = await buildAnalysisIdentity(word, settings)
    if (cancelled()) throw aborted()
    if (!options.force) {
      const cached = await this.storage.getAiAnalysis(identity.key)
      if (cancelled()) throw aborted()
      if (cached) return cached
    }
    if (!navigator.onLine) throw new Error('当前离线，暂未缓存这个词的 AI 分析。')
    if (!this.apiKey || !this.credential) throw new Error('请在设置中解锁 API 密钥；已有分析仍可离线查看。')
    if (this.task) {
      if (this.task.key === identity.key && !this.task.controller.signal.aborted) return this.join(this.task, options.signal)
      await abortable(this.task.promise.catch(() => undefined), options.signal)
      if (cancelled()) throw aborted()
      return this.analyze(word, options)
    }
    const apiKey = this.apiKey
    const credentialId = this.credential.credentialId
    const controller = new AbortController()
    const owner = crypto.randomUUID()
    const task: Task = { key: identity.key, wordId: word.id, controller, promise: undefined!, consumers: 0, settled: false }
    this.task = task
    this.emit({ busy: true })
    const run = async (): Promise<WordAiAnalysis> => {
      let timedOut = false
      const timer = setTimeout(() => { timedOut = true; controller.abort() }, 60000)
      try {
        if (!await this.storage.acquireAiLease(owner, settings.revision, Date.now(), word.id)) throw new Error('另一页面正在分析，或配置已变化。请稍后重试。')
        if (!options.force) {
          const cached = await this.storage.getAiAnalysis(identity.key)
          if (controller.signal.aborted || invalidated()) throw aborted()
          if (cached) return cached
        }
        const current = await this.storage.getAiConfiguration()
        if (controller.signal.aborted || invalidated() || current.settings.revision !== settings.revision || current.credential?.credentialId !== credentialId) throw aborted()
        const result = await abortable(requestAnalysis(word, settings, apiKey, controller.signal, this.fetcher), controller.signal)
        if (controller.signal.aborted || invalidated()) throw aborted()
        const record: WordAiAnalysis = { ...identity, wordId: word.id, language: 'en', baseUrl: settings.baseUrl, model: settings.model, generatedAt: new Date().toISOString(), result }
        if (!await this.storage.saveAiAnalysis(record, owner, settings.revision)) throw new Error('配置或缓存已变化，本次结果未保存。')
        return record
      } catch (error) {
        if (timedOut) throw new Error('AI 分析超过 60 秒，请稍后手动重试。')
        throw error
      } finally {
        clearTimeout(timer)
        await this.storage.releaseAiLease(owner)
      }
    }
    task.promise = run().finally(() => { task.settled = true; if (this.task === task) { this.task = undefined; this.emit({ busy: false }) } })
    return this.join(task, options.signal)
  }

  dispose(): void { this.invalidate(); this.channel?.close(); this.channel = undefined; this.listeners.clear() }
}
