import { useLayoutEffect, type CSSProperties, type ReactNode } from 'react'
import { useStudyViewport } from './useStudyViewport'
import styles from './StudyFrame.module.css'
let boundedFrames=0
export interface StudyFrameProps {header:ReactNode;children:ReactNode;actions?:ReactNode;label:string}
export function StudyFrame({header,children,actions,label}:StudyFrameProps) {
  const viewport=useStudyViewport()
  useLayoutEffect(()=>{
    if(viewport.mode!=='bounded')return
    boundedFrames++
    document.documentElement.setAttribute('data-study-viewport','bounded')
    return ()=>{if(--boundedFrames===0)document.documentElement.removeAttribute('data-study-viewport')}
  },[viewport.mode])
  return <main className={`${styles.frame} ${styles[viewport.mode]}`} data-compact={viewport.compact || undefined} style={{'--study-height':`${viewport.height}px`,'--study-top':`${viewport.top}px`} as CSSProperties}>
    <div className={styles.header}>{header}</div>
    <section className={styles.content} aria-label={`${label}内容`}>{children}</section>
    {actions && <section className={styles.actions} aria-label="答题操作">{actions}</section>}
  </main>
}
