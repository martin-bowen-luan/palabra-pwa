import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PronunciationPlayer } from './pronunciation'
import { installSpeech, voice } from './speechTestUtils'
import type { VocabularyEntry } from '../types'

const word = (audioPath?: string) => ({ term: 'hello', pronunciation: { audioPath } }) as VocabularyEntry

describe('coordinated sentence speech', () => {
  let player: PronunciationPlayer
  beforeEach(() => { vi.useFakeTimers(); player = new PronunciationPlayer() })
  afterEach(() => { player.stop(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers() })

  it('prefers local US English and only reports playing after onstart', () => {
    const remote = voice('en-US', false)
    const british = voice('en-GB')
    const american = voice('en-US')
    const { utterances } = installSpeech([remote, british, american])
    const owner = Symbol()
    player.playSentence('Hello world.', owner)
    expect(player.getSnapshot()).toMatchObject({ owner, status: 'loading' })
    expect(utterances[0]).toMatchObject({ text: 'Hello world.', voice: american, lang: 'en-US', rate: 1 })
    utterances[0].start()
    expect(player.getSnapshot().status).toBe('playing')
    utterances[0].end()
    expect(player.getSnapshot().status).toBe('idle')
    expect(vi.getTimerCount()).toBe(0)
  })

  it.each([
    { voices: [voice('en-US', false), voice('en-GB')], online: true, expected: 'en-GB' },
    { voices: [voice('en-AU', false)], online: true, expected: 'en-AU' },
    { voices: [voice('en-GB')], online: false, expected: 'en-GB' },
  ])('selects eligible English voices ($expected, online=$online)', ({ voices, online, expected }) => {
    const { utterances } = installSpeech(voices)
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online)
    player.playSentence('Hello.', Symbol())
    expect(utterances[0].voice?.lang).toBe(expected)
  })

  it('reports offline remote-only voices without speaking', () => {
    const { synthesis } = installSpeech([voice('en-US', false)])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    player.playSentence('Hello.', Symbol())
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(player.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringMatching(/离线/) })
  })

  it('reports missing English voices and unsupported browsers', () => {
    installSpeech([voice('zh-CN')])
    player.playSentence('Hello.', Symbol())
    expect(player.getSnapshot().error).toMatch(/英语/)
    vi.stubGlobal('speechSynthesis', undefined)
    player.playSentence('Hello.', Symbol())
    expect(player.getSnapshot().error).toMatch(/浏览器.*不支持/)
  })

  it('waits for voiceschanged, then removes the listener and speaks once', () => {
    const { synthesis, utterances, setVoices } = installSpeech([])
    player.playSentence('Hello.', Symbol())
    expect(synthesis.speak).not.toHaveBeenCalled()
    setVoices([voice('en-US')])
    setVoices([voice('en-US')])
    expect(utterances).toHaveLength(1)
    expect(synthesis.removeEventListener).toHaveBeenCalledWith('voiceschanged', expect.any(Function))
    utterances[0].start()
    utterances[0].end()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('times out empty voices and speech that never starts with useful errors', () => {
    const { setVoices, synthesis } = installSpeech([])
    player.playSentence('Hello.', Symbol())
    vi.runAllTimers()
    expect(player.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringMatching(/英语/) })
    expect(vi.getTimerCount()).toBe(0)
    setVoices([voice('en-US')])
    expect(synthesis.speak).not.toHaveBeenCalled()
    player.playSentence('Hello.', Symbol())
    vi.runAllTimers()
    expect(player.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringMatching(/启动|开始/) })
    expect(synthesis.cancel).toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports synthesis errors and thrown speak failures without fake success', () => {
    const { utterances, synthesis } = installSpeech()
    player.playSentence('Hello.', Symbol())
    utterances[0].start()
    utterances[0].error('not-allowed')
    expect(player.getSnapshot()).toMatchObject({ status: 'error', error: expect.stringMatching(/允许|权限|点击/) })
    expect(vi.getTimerCount()).toBe(0)
    synthesis.speak.mockImplementation(() => { throw new Error('broken') })
    player.playSentence('Again.', Symbol())
    expect(player.getSnapshot().status).toBe('error')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('invalidates pending voice loads on stop and rapid replacement', () => {
    const { utterances, setVoices } = installSpeech([])
    player.playSentence('Old.', Symbol())
    player.stop()
    setVoices([voice('en-US')])
    expect(utterances).toHaveLength(0)
    setVoices([])
    player.playSentence('Older.', Symbol())
    player.playSentence('Newest.', Symbol())
    setVoices([voice('en-US')])
    expect(utterances.map((utterance) => utterance.text)).toEqual(['Newest.'])
  })

  it('ignores stale callbacks and owner cleanup after another component starts', () => {
    const { utterances, synthesis } = installSpeech()
    const first = Symbol()
    const second = Symbol()
    player.playSentence('First.', first)
    const staleStart = utterances[0].onstart!
    const staleEnd = utterances[0].onend!
    player.playSentence('Second.', second)
    const cancellations = synthesis.cancel.mock.calls.length
    player.stopSentence(first)
    staleStart.call(utterances[0] as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent)
    staleEnd.call(utterances[0] as unknown as SpeechSynthesisUtterance, {} as SpeechSynthesisEvent)
    expect(player.getSnapshot()).toMatchObject({ owner: second, status: 'loading' })
    expect(synthesis.cancel).toHaveBeenCalledTimes(cancellations)
    utterances[1].start()
    expect(player.getSnapshot().status).toBe('playing')
    player.stopSentence(second)
    expect(player.getSnapshot().status).toBe('idle')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('stops word recordings and fallback speech when a sentence starts', async () => {
    const { utterances, synthesis } = installSpeech()
    const audio = { currentTime: 9, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) }
    vi.stubGlobal('Audio', class { constructor() { return audio } })
    await player.play(word('/word.mp3'))
    player.playSentence('Sentence.', Symbol())
    expect(audio.pause).toHaveBeenCalledOnce()
    expect(audio.currentTime).toBe(0)
    await player.play(word())
    const cancellationCount = synthesis.cancel.mock.calls.length
    player.playSentence('Next.', Symbol())
    expect(synthesis.cancel).toHaveBeenCalledTimes(cancellationCount + 1)
    expect(utterances.map((utterance) => utterance.text)).toEqual(['Sentence.', 'hello', 'Next.'])
  })

  it('word playback cancels pending sentences without letting owner cleanup stop the word', async () => {
    const { synthesis, setVoices } = installSpeech([])
    const owner = Symbol()
    player.playSentence('Sentence.', owner)
    await player.play(word())
    const cancellationCount = synthesis.cancel.mock.calls.length
    player.stopSentence(owner)
    setVoices([voice('en-US')])
    expect(synthesis.speak).toHaveBeenCalledOnce()
    expect(synthesis.cancel).toHaveBeenCalledTimes(cancellationCount)
    expect(player.getSnapshot().status).toBe('idle')
  })

  it('notifies subscribers of actual lifecycle changes and supports unsubscribe', () => {
    const { utterances } = installSpeech()
    const listener = vi.fn()
    const unsubscribe = player.subscribe(listener)
    player.playSentence('Hello.', Symbol())
    const beforeStart = listener.mock.calls.length
    utterances[0].start()
    expect(listener.mock.calls.length).toBeGreaterThan(beforeStart)
    unsubscribe()
    const afterUnsubscribe = listener.mock.calls.length
    utterances[0].end()
    expect(listener).toHaveBeenCalledTimes(afterUnsubscribe)
  })
})
