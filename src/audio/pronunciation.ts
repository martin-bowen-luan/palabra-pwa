import type { VocabularyEntry } from '../types'
import { startSystemSentence } from './systemSentenceSpeech'

interface AudioHandle {
  currentTime: number
  pause(): void
  play(): Promise<void>
}

interface PronunciationDependencies {
  createAudio: (url: string) => AudioHandle
  cancelSpeech: () => void
  speak: (term: string, language: string) => void
}

function systemSpeak(term: string, language: string) {
  if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
    throw new Error('当前浏览器不支持系统语音')
  }
  const utterance = new SpeechSynthesisUtterance(term)
  utterance.lang = language
  const voice = window.speechSynthesis.getVoices().find((item) => item.lang.toLocaleLowerCase().startsWith('en-us'))
  if (voice) utterance.voice = voice
  window.speechSynthesis.speak(utterance)
}

const defaultDependencies: PronunciationDependencies = {
  createAudio: (url) => new Audio(url),
  cancelSpeech: () => { if (typeof window !== 'undefined') window.speechSynthesis?.cancel() },
  speak: systemSpeak,
}

export interface SentenceSpeechSnapshot {
  readonly owner: symbol | null
  readonly status: 'idle' | 'loading' | 'playing' | 'error'
  readonly error: string | null
}

const idleSnapshot: SentenceSpeechSnapshot = { owner: null, status: 'idle', error: null }

export class PronunciationPlayer {
  private currentAudio?: AudioHandle
  private sentenceCleanup?: () => void
  private generation = 0
  private snapshot: SentenceSpeechSnapshot = idleSnapshot
  private readonly listeners = new Set<() => void>()

  constructor(private readonly dependencies: PronunciationDependencies = defaultDependencies) {}

  getSnapshot = (): SentenceSpeechSnapshot => this.snapshot

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => { this.listeners.delete(listener) }
  }

  private publish(snapshot: SentenceSpeechSnapshot) {
    this.snapshot = snapshot
    this.listeners.forEach((listener) => listener())
  }

  stop() {
    this.generation += 1
    this.sentenceCleanup?.()
    this.sentenceCleanup = undefined
    this.dependencies.cancelSpeech()
    if (this.currentAudio) {
      this.currentAudio.pause()
      this.currentAudio.currentTime = 0
      this.currentAudio = undefined
    }
    this.publish(idleSnapshot)
  }

  stopSentence(owner: symbol) {
    if (this.snapshot.owner === owner) this.stop()
  }

  playSentence(text: string, owner: symbol = Symbol('sentence')): void {
    this.stop()
    const generation = this.generation
    this.publish({ owner, status: 'loading', error: null })
    this.sentenceCleanup = startSystemSentence(text, (status, error) => {
      if (generation !== this.generation) return
      this.publish(status === 'idle' ? idleSnapshot : { owner, status, error: error ?? null })
    })
  }

  async play(word: VocabularyEntry): Promise<void> {
    this.stop()
    const audioPath = word.pronunciation?.audioPath
    if (!audioPath) {
      this.dependencies.speak(word.term, 'en-US')
      return
    }
    const audio = this.dependencies.createAudio(audioPath)
    audio.currentTime = 0
    this.currentAudio = audio
    await audio.play()
  }
}

export const pronunciationPlayer = new PronunciationPlayer()
