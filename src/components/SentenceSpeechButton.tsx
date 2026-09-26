import { useEffect, useId, useState, useSyncExternalStore } from 'react'
import { pronunciationPlayer } from '../audio/pronunciation'
import styles from './SentenceSpeechButton.module.css'

export function SentenceSpeechButton({ text }: { text: string }) {
  const [owner] = useState(() => Symbol('sentence-button'))
  const statusId = useId()
  const snapshot = useSyncExternalStore(pronunciationPlayer.subscribe, pronunciationPlayer.getSnapshot, pronunciationPlayer.getSnapshot)
  const owned = snapshot.owner === owner
  const playing = owned && snapshot.status === 'playing'
  const loading = owned && snapshot.status === 'loading'
  const active = playing || loading
  const error = owned ? snapshot.error : null

  useEffect(() => () => pronunciationPlayer.stopSentence(owner), [owner, text])

  const read = () => pronunciationPlayer.playSentence(text, owner)
  return <span className={styles.controls}>
    <button
      className={styles.button}
      type="button"
      aria-describedby={statusId}
      onClick={() => active ? pronunciationPlayer.stopSentence(owner) : read()}
    >{active ? '停止朗读' : '朗读英文例句'}</button>
    {playing && <button className={styles.button} type="button" onClick={read}>重新朗读</button>}
    <span id={statusId} className={error ? styles.error : styles.status} role="status">
      {error ?? (loading ? '准备语音…' : playing ? '正在朗读…' : '')}
    </span>
  </span>
}
