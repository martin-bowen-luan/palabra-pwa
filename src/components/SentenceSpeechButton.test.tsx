import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { pronunciationPlayer } from '../audio/pronunciation'
import { installSpeech, voice } from '../audio/speechTestUtils'
import { SentenceSpeechButton } from './SentenceSpeechButton'

describe('SentenceSpeechButton', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => {
    cleanup()
    pronunciationPlayer.stop()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    vi.useRealTimers()
  })

  it('reads only on click and exposes stop and replay according to real speech events', () => {
    const { utterances, synthesis } = installSpeech()
    render(<SentenceSpeechButton text="We can do this." />)
    expect(synthesis.speak).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    expect(utterances[0].text).toBe('We can do this.')
    expect(screen.getByRole('status')).toHaveTextContent('准备语音')
    expect(screen.getByRole('button', { name: '停止朗读' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '重新朗读' })).not.toBeInTheDocument()
    act(() => utterances[0].start())
    expect(screen.getByRole('status')).toHaveTextContent('正在朗读')
    fireEvent.click(screen.getByRole('button', { name: '重新朗读' }))
    expect(utterances).toHaveLength(2)
    expect(utterances[1].text).toBe('We can do this.')
    act(() => utterances[1].start())
    fireEvent.click(screen.getByRole('button', { name: '停止朗读' }))
    expect(screen.getByRole('button', { name: '朗读英文例句' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: '重新朗读' })).not.toBeInTheDocument()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('returns to read on end and displays actionable error messages', () => {
    const { utterances } = installSpeech()
    render(<SentenceSpeechButton text="Hello." />)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    act(() => { utterances[0].start(); utterances[0].end() })
    expect(screen.getByRole('button', { name: '朗读英文例句' })).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    act(() => utterances[1].error('not-allowed'))
    expect(screen.getByRole('status')).toHaveTextContent(/允许|权限|点击/)
    expect(screen.getByRole('button', { name: '朗读英文例句' })).toBeEnabled()
  })

  it('displays offline, unavailable voice, unsupported browser, and start timeout errors', () => {
    const { setVoices } = installSpeech([voice('en-US', false)])
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    render(<SentenceSpeechButton text="Hello." />)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    expect(screen.getByRole('status')).toHaveTextContent('离线')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    setVoices([voice('zh-CN')])
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    expect(screen.getByRole('status')).toHaveTextContent('英语语音')
    setVoices([voice('en-US')])
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    act(() => vi.runAllTimers())
    expect(screen.getByRole('status')).toHaveTextContent('未能开始')
    vi.stubGlobal('speechSynthesis', undefined)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    expect(screen.getByRole('status')).toHaveTextContent('浏览器不支持')
  })

  it('allows stopping pending voice loading and removes waits on unmount', () => {
    const { setVoices, synthesis } = installSpeech([])
    const view = render(<StrictMode><SentenceSpeechButton text="Hello." /></StrictMode>)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    fireEvent.click(screen.getByRole('button', { name: '停止朗读' }))
    act(() => setVoices([voice('en-US')]))
    expect(synthesis.speak).not.toHaveBeenCalled()
    setVoices([])
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    view.unmount()
    act(() => setVoices([voice('en-US')]))
    expect(synthesis.speak).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('unmounting an older component preserves the newer component playback', () => {
    const { synthesis, utterances } = installSpeech()
    const first = render(<SentenceSpeechButton text="First." />)
    const second = render(<SentenceSpeechButton text="Second." />)
    fireEvent.click(within(first.container).getByRole('button', { name: '朗读英文例句' }))
    act(() => utterances[0].start())
    fireEvent.click(within(second.container).getByRole('button', { name: '朗读英文例句' }))
    act(() => utterances[1].start())
    expect(within(first.container).getByRole('button', { name: '朗读英文例句' })).toBeEnabled()
    const cancellations = synthesis.cancel.mock.calls.length
    first.unmount()
    expect(synthesis.cancel).toHaveBeenCalledTimes(cancellations)
    expect(within(second.container).getByRole('button', { name: '停止朗读' })).toBeEnabled()
    second.unmount()
    expect(synthesis.cancel).toHaveBeenCalledTimes(cancellations + 1)
  })

  it('stops its previous sentence when text changes and reads the updated text', () => {
    const { utterances } = installSpeech()
    const view = render(<SentenceSpeechButton text="Old." />)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    view.rerender(<SentenceSpeechButton text="New." />)
    expect(screen.getByRole('button', { name: '朗读英文例句' })).toBeEnabled()
    expect(vi.getTimerCount()).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: '朗读英文例句' }))
    expect(utterances[1].text).toBe('New.')
  })
})
