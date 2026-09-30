import { useRef,useState } from 'react'
import { useAppState } from '../app/AppState'
import type { WordbookId } from './types'
import styles from '../styles/App.module.css'
export function WordbookSwitch() {
  const {settings,wordbooks,selectedWordbook,setEnglishWordbook}=useAppState()
  const [error,setError]=useState(''),request=useRef(0)
  if(settings.learningLanguage!=='en')return null
  const select=async(id:WordbookId)=>{
    const version=++request.current;setError('')
    try{await setEnglishWordbook(id)}catch{if(version===request.current)setError('未能切换词书，请再次选择重试。')}
  }
  return <div className={styles.wordbookSection}><div className={styles.wordbookSwitch} role="group" aria-label="英语单词书">{wordbooks.map(book=><button key={book.id} aria-pressed={selectedWordbook?.id===book.id} onClick={()=>void select(book.id)}>{book.title}</button>)}</div>{error&&<p role="alert" className={styles.inlineNotice}>{error}</p>}</div>
}
