import { describe, expect, it, vi } from 'vitest'
import { PronunciationPlayer } from './pronunciation'
import type { VocabularyEntry } from '../types'

function word(term: string, audioPath?: string): VocabularyEntry {
  return {
    id: `en:${term}`, language: 'en', term, partOfSpeech: 'n.', meaningZh: '测试', category: '高考 3500', examples: [],
    pronunciation: { ipa: '/test/', accent: 'us', audioPath, audioKind: audioPath ? 'human' : 'tts' },
  }
}

describe('pronunciation player', () => {
  it('stops and rewinds the previous recording before replaying', async () => {
    const audios: Array<{ currentTime: number; pause: ReturnType<typeof vi.fn>; play: ReturnType<typeof vi.fn> }> = []
    const player = new PronunciationPlayer({
      createAudio: () => {
        const audio = { currentTime: 8, pause: vi.fn(), play: vi.fn().mockResolvedValue(undefined) }
        audios.push(audio)
        return audio
      },
      cancelSpeech: vi.fn(),
      speak: vi.fn(),
    })

    await player.play(word('first', 'https://audio.test/first.mp3'))
    await player.play(word('second', 'https://audio.test/second.mp3'))

    expect(audios[0].pause).toHaveBeenCalledOnce()
    expect(audios[0].currentTime).toBe(0)
    expect(audios[1].play).toHaveBeenCalledOnce()
  })

  it('uses a US system voice when an imported recording is missing', async () => {
    const speak = vi.fn()
    const player = new PronunciationPlayer({ createAudio: vi.fn(), cancelSpeech: vi.fn(), speak })
    await player.play(word('hotdog'))
    expect(speak).toHaveBeenCalledWith('hotdog', 'en-US')
  })
})
