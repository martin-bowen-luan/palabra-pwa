import type { PalabraStorage } from '../data/storage'
import type { VocabularyEntry } from '../types'
import { WiktionaryClient } from './dictionary'
import { acceptGuess, createGame, localEntry, normalizeGuess, wordlePool } from './rules'
import type { WordleGame } from './types'

export interface WordleState {
  loading: boolean
  busy: boolean
  draft: string
  error: string
  game?: WordleGame
  candidateCount: number
}
export const initialWordleState: WordleState = { loading: true, busy: false, draft: '', error: '', candidateCount: 0 }
class Conflict extends Error {}

export class WordleController {
  private state: WordleState = initialWordleState
  private vocabulary: VocabularyEntry[] = []
  private listeners = new Set<() => void>()
  private jobs: Promise<void> = Promise.resolve()
  private request?: AbortController
  private disposed = false
  private generation = 0
  constructor(private readonly db: PalabraStorage, private readonly dictionary = new WiktionaryClient(), private readonly random = Math.random, private readonly online = () => navigator.onLine) {}
  getSnapshot = () => this.state
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener) } }
  private update(patch: Partial<WordleState>) {
    this.state = { ...this.state, ...patch }
    if (!this.disposed) this.listeners.forEach(listener => listener())
  }
  async initialize() {
    this.update({ loading: true, error: '' })
    try {
      const [vocabulary, saved] = await Promise.all([this.db.getVocabulary('en'), this.db.getWordleGame()])
      if (this.disposed) return
      this.vocabulary = vocabulary
      const pool = wordlePool(vocabulary)
      let game = saved
      if (!game) {
        game = createGame(pool, undefined, this.random)
        if (!await this.db.saveWordleGame(game, undefined)) game = await this.db.getWordleGame()
      }
      this.update({ game, draft: game?.draft ?? '', candidateCount: pool.length })
    } catch (error) { this.update({ error: error instanceof Error && error.message.includes('五字母') ? error.message : '无法读取或保存猜词游戏，请重试。' }) }
    finally { this.update({ loading: false }) }
  }
  private async commit(next: WordleGame) {
    try {
      if (!await this.db.saveWordleGame(next, this.state.game?.revision)) throw new Conflict()
    } catch (error) {
      if (error instanceof Conflict) throw error
      throw new Error('未能保存本次操作，输入已保留，请重试。')
    }
    this.update({ game: next })
  }
  private async recover(error: unknown) {
    if (error instanceof Conflict) {
      this.generation++
      try {
        const game = await this.db.getWordleGame()
        this.update({ game, draft: game?.draft ?? '', error: '另一页面已更新这局游戏，已载入最新进度，请重新输入。' })
      } catch { this.update({ error: '无法读取最新游戏，请刷新重试。' }) }
    } else if (!this.disposed) this.update({ error: error instanceof Error ? error.message : '操作未完成，请重试。' })
  }
  edit(value: string): Promise<void> {
    const draft = value.toLowerCase()
    if (this.state.busy || this.state.game?.status !== 'playing' || !/^[a-z]{0,5}$/.test(draft)) return Promise.resolve()
    this.update({ draft, error: '' })
    const generation = this.generation
    this.jobs = this.jobs.then(async () => {
      if (generation !== this.generation || !this.state.game) return
      await this.commit({ ...this.state.game, draft, revision: this.state.game.revision + 1 })
    }).catch(error => this.recover(error))
    return this.jobs
  }
  private async run(action: () => Promise<void>) {
    if (this.state.busy || this.disposed || !this.state.game) return
    this.update({ busy: true, error: '' })
    const generation = this.generation
    try {
      await this.jobs
      if (this.disposed || generation !== this.generation) return
      await action()
    } catch (error) { await this.recover(error) }
    finally { this.request = undefined; this.update({ busy: false }) }
  }
  submit(): Promise<void> {
    return this.run(async () => {
      const game = this.state.game!
      if (game.status !== 'playing') return
      const term = normalizeGuess(this.state.draft)
      if (!term) throw new Error('请输入五个英文字母。')
      if (game.guesses.some(guess => guess.term === term)) throw new Error('这个词已经猜过了，换一个试试。')
      let entry = localEntry(term, this.vocabulary) ?? await this.db.getWordleDictionaryEntry(term)
      if (!entry) {
        if (!this.online()) throw new Error('这个词尚未缓存，需要联网验证；本次不扣次数。')
        this.request = new AbortController()
        entry = await this.dictionary.lookup(term, this.request.signal)
        if (this.disposed) return
        try { await this.db.saveWordleDictionaryEntry(entry) }
        catch { throw new Error('未能保存词典缓存，输入已保留，请重试。') }
      }
      if (this.disposed) return
      await this.commit(acceptGuess(game, entry))
      this.update({ draft: '' })
    })
  }
  newGame(): Promise<void> {
    return this.run(async () => {
      if (this.state.game?.status === 'playing') return
      const next = createGame(wordlePool(this.vocabulary), this.state.game!.answer.term, this.random)
      next.revision = this.state.game!.revision + 1
      await this.commit(next)
      this.generation++
      this.update({ draft: '' })
    })
  }
  dispose() { this.disposed = true; this.request?.abort(); this.listeners.clear() }
}
