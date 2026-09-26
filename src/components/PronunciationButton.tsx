import { useState } from 'react'
import { pronunciationPlayer } from '../audio/pronunciation'
import type { VocabularyEntry } from '../types'
import { SpeakerIcon } from './Icons'
import styles from '../styles/App.module.css'

export function PronunciationButton({ word }: { word: VocabularyEntry }) {
  const [error, setError] = useState('')
  const play = async () => {
    setError('')
    try {
      await pronunciationPlayer.play(word)
    } catch {
      setError('暂时无法播放')
    }
  }
  return <>
    <button className={styles.pronunciationButton} type="button" aria-label={`播放 ${word.term} 发音`} onClick={() => void play()}>
      <SpeakerIcon />
    </button>
    {error && <span className={styles.audioError} role="status">{error}</span>}
  </>
}
