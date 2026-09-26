type SpeechUpdate = (status: 'playing' | 'idle' | 'error', error?: string) => void

const VOICE_WAIT_MS = 2000
const START_WAIT_MS = 5000

function speechError(code: string) {
  if (code === 'not-allowed') return '浏览器未允许朗读，请点击重试或检查语音权限。'
  if (code === 'network') return '语音网络连接失败，请联网重试或安装本地英语语音。'
  if (code === 'language-unavailable' || code === 'voice-unavailable') {
    return '英语语音不可用，请在设备设置中安装英语语音后重试。'
  }
  return '系统语音播放失败，请重试或检查设备语音设置。'
}

/** Owns one utterance and its pending voice/start waits; disposal never cancels newer speech. */
export function startSystemSentence(text: string, update: SpeechUpdate): () => void {
  const synthesis = typeof window === 'undefined' ? undefined : window.speechSynthesis
  if (!synthesis || typeof SpeechSynthesisUtterance === 'undefined') {
    update('error', '当前浏览器不支持系统语音，请使用支持语音的浏览器。')
    return () => undefined
  }

  let disposed = false
  let utterance: SpeechSynthesisUtterance | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let waitingForVoices = false
  const clearWait = () => {
    clearTimeout(timer)
    timer = undefined
    if (waitingForVoices) {
      synthesis.removeEventListener('voiceschanged', trySpeak)
      waitingForVoices = false
    }
  }
  const dispose = () => {
    disposed = true
    clearWait()
    if (utterance) {
      utterance.onstart = null
      utterance.onend = null
      utterance.onerror = null
    }
  }
  const finish = (status: 'idle' | 'error', error?: string) => {
    if (disposed) return
    dispose()
    // Clear a stuck/failed utterance before announcing that the channel is available.
    if (status === 'error') synthesis.cancel()
    update(status, error)
  }
  function trySpeak() {
    if (disposed || utterance) return
    try {
      const voices = synthesis!.getVoices()
      if (!voices.length) return
      clearWait()
      const english = voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang))
      const local = english.filter((voice) => voice.localService)
      const voice = local.find((voice) => /^en[-_]us$/i.test(voice.lang))
        ?? local[0]
        ?? (navigator.onLine ? english[0] : undefined)
      if (!voice) {
        finish('error', !navigator.onLine
          ? '离线时没有可用的本地英语语音，请安装英语语音或联网后重试。'
          : '未找到英语语音，请在设备设置中安装英语语音后重试。')
        return
      }
      utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voice.lang
      utterance.voice = voice
      utterance.rate = 1
      utterance.onstart = () => {
        if (disposed) return
        clearWait()
        update('playing')
      }
      utterance.onend = () => finish('idle')
      utterance.onerror = (event) => finish('error', speechError(event.error))
      timer = setTimeout(() => finish('error', '系统语音未能开始播放，请点击重试或检查设备语音设置。'), START_WAIT_MS)
      synthesis!.speak(utterance)
    } catch {
      finish('error', '系统语音无法启动，请重试或检查浏览器语音设置。')
    }
  }

  waitingForVoices = true
  synthesis.addEventListener('voiceschanged', trySpeak)
  timer = setTimeout(() => {
    finish('error', navigator.onLine
      ? '英语语音加载超时，请安装英语语音或稍后重试。'
      : '离线时无法加载英语语音，请安装本地英语语音或联网后重试。')
  }, VOICE_WAIT_MS)
  trySpeak()
  return dispose
}
