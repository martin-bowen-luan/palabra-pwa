import { useEffect, useRef, useState } from 'react'
import { AudioPackManager, englishAudioFiles, type AudioPackStatus } from '../audio/audioPack'
import styles from '../styles/App.module.css'

const initialStatus: AudioPackStatus = {
  downloaded: 0,
  total: englishAudioFiles.length,
  complete: false,
  estimatedBytes: englishAudioFiles.length * 24_000,
}

export function AudioPackSettings() {
  const supported = 'caches' in globalThis
  const [status, setStatus] = useState(initialStatus)
  const [downloading, setDownloading] = useState(false)
  const [message, setMessage] = useState('')
  const abortController = useRef<AbortController | undefined>(undefined)

  useEffect(() => {
    if (!supported) return
    void new AudioPackManager().getStatus().then(setStatus).catch(() => setMessage('无法读取离线缓存'))
    return () => abortController.current?.abort()
  }, [supported])

  const download = async () => {
    setMessage('')
    setDownloading(true)
    abortController.current = new AbortController()
    try {
      setStatus(await new AudioPackManager().download(abortController.current.signal, setStatus))
    } catch (error) {
      setMessage(error instanceof DOMException && error.name === 'AbortError' ? '下载已暂停，可稍后继续' : '下载中断，请检查网络后继续')
    } finally {
      setDownloading(false)
    }
  }

  const remove = async () => {
    setMessage('')
    setStatus(await new AudioPackManager().remove())
  }

  const percent = status.total ? Math.round(status.downloaded / status.total * 100) : 100
  const sizeMb = Math.round(status.estimatedBytes / 1024 / 1024)

  return <section className={styles.settingsSection}>
    <div className={styles.settingTitle}><h2>英语离线发音</h2><span>约 {sizeMb} MB</span></div>
    <p className={styles.settingDescription}>3458 个真人录音；缺失的 6 个词使用设备内置美式语音。未下载时，播放过的录音也会自动缓存。</p>
    <div className={styles.audioPackProgress} aria-label={`离线发音 ${percent}%`}><span style={{ width: `${percent}%` }} /></div>
    <div className={styles.audioPackMeta}><span>{status.downloaded} / {status.total}</span><strong>{percent}%</strong></div>
    {!supported && <p className={styles.inlineNotice}>当前浏览器不支持完整离线包，可继续在线播放。</p>}
    {message && <p className={styles.inlineNotice} role="status">{message}</p>}
    <div className={styles.audioPackActions}>
      <button type="button" disabled={!supported || downloading || status.complete} onClick={() => void download()}>
        {downloading ? '正在下载…' : status.downloaded ? '继续下载' : '下载离线发音包'}
      </button>
      {downloading && <button type="button" onClick={() => abortController.current?.abort()}>暂停</button>}
      {status.downloaded > 0 && !downloading && <button type="button" onClick={() => void remove()}>删除离线包</button>}
    </div>
    <p className={styles.sourceNote}>词义与原始例句保留逐词来源；补充例句来自 Tatoeba（CC BY 2.0 FR）或项目审核稿。音频来源记录在离线清单中。</p>
  </section>
}
