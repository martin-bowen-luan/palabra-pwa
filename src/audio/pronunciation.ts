import type { VocabularyEntry } from '../types'

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
  cancelSpeech: () => window.speechSynthesis?.cancel(),
  speak: systemSpeak,
}

export class PronunciationPlayer {
  private currentAudio?: AudioHandle

  constructor(private readonly dependencies: PronunciationDependencies = defaultDependencies) {}

  stop() {
    this.dependencies.cancelSpeech()
    if (!this.currentAudio) return
    this.currentAudio.pause()
    this.currentAudio.currentTime = 0
    this.currentAudio = undefined
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
