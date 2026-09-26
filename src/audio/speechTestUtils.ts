import { vi } from 'vitest'

export function voice(lang: string, localService = true): SpeechSynthesisVoice {
  return { lang, localService, name: `${lang}-${localService}`, voiceURI: `${lang}-${localService}`, default: false }
}

export class FakeUtterance {
  text: string
  lang = ''
  rate = 1
  voice: SpeechSynthesisVoice | null = null
  onstart: SpeechSynthesisUtterance['onstart'] = null
  onend: SpeechSynthesisUtterance['onend'] = null
  onerror: SpeechSynthesisUtterance['onerror'] = null

  constructor(text: string) { this.text = text }

  start() { this.onstart?.call(this as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent) }
  end() { this.onend?.call(this as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent) }
  error(error = 'synthesis-failed') {
    this.onerror?.call(this as unknown as SpeechSynthesisUtterance, { error } as SpeechSynthesisErrorEvent)
  }
}

export function installSpeech(voices = [voice('en-US')]) {
  const events = new EventTarget()
  const utterances: FakeUtterance[] = []
  const synthesis = {
    getVoices: vi.fn(() => voices),
    addEventListener: vi.fn(events.addEventListener.bind(events)),
    removeEventListener: vi.fn(events.removeEventListener.bind(events)),
    speak: vi.fn((utterance: FakeUtterance) => { utterances.push(utterance) }),
    cancel: vi.fn(),
  }
  vi.stubGlobal('speechSynthesis', synthesis)
  vi.stubGlobal('SpeechSynthesisUtterance', FakeUtterance)
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  return {
    synthesis, utterances,
    setVoices(next: SpeechSynthesisVoice[]) {
      voices = next
      events.dispatchEvent(new Event('voiceschanged'))
    },
  }
}
