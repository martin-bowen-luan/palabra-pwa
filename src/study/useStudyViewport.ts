import { useEffect, useState } from 'react'
import { measureStudyViewport } from './viewport'
const read = () => measureStudyViewport({layoutHeight:window.innerHeight,visualHeight:window.visualViewport?.height,offsetTop:window.visualViewport?.offsetTop,scale:window.visualViewport?.scale})
export function useStudyViewport() {
  const [viewport,setViewport] = useState(read)
  useEffect(() => {
    let frame: number | undefined
    const update = () => {
      if(frame !== undefined) return
      frame = requestAnimationFrame(() => {frame=undefined;setViewport(previous => {
        const next=read()
        return Object.keys(next).every(key=>next[key as keyof typeof next]===previous[key as keyof typeof next]) ? previous : next
      })})
    }
    const visual=window.visualViewport
    visual?.addEventListener('resize',update);visual?.addEventListener('scroll',update)
    window.addEventListener('resize',update);window.addEventListener('orientationchange',update)
    return () => {
      visual?.removeEventListener('resize',update);visual?.removeEventListener('scroll',update)
      window.removeEventListener('resize',update);window.removeEventListener('orientationchange',update)
      if(frame!==undefined) cancelAnimationFrame(frame)
    }
  },[])
  return viewport
}
