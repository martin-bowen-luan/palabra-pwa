import { renderHook, act } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { useStudyViewport } from './useStudyViewport'
it('coalesces viewport events and releases listeners and pending frames', () => {
  const descriptor=Object.getOwnPropertyDescriptor(window,'visualViewport')
  const viewport=Object.assign(new EventTarget(),{height:844,offsetTop:0,scale:1})
  Object.defineProperty(window,'visualViewport',{configurable:true,value:viewport})
  let callback:FrameRequestCallback=()=>{}
  const raf=vi.spyOn(window,'requestAnimationFrame').mockImplementation(cb=>{callback=cb;return 9})
  const cancel=vi.spyOn(window,'cancelAnimationFrame').mockImplementation(()=>{})
  try {
    const {result,unmount}=renderHook(useStudyViewport)
    expect(result.current.height).toBe(844)
    viewport.height=440;viewport.offsetTop=72
    act(()=>{viewport.dispatchEvent(new Event('resize'));viewport.dispatchEvent(new Event('scroll'))})
    expect(raf).toHaveBeenCalledTimes(1)
    act(()=>callback(1))
    expect(result.current).toMatchObject({height:440,top:72,compact:true})
    act(()=>viewport.dispatchEvent(new Event('resize')))
    unmount()
    expect(cancel).toHaveBeenCalledWith(9)
    const calls=raf.mock.calls.length
    viewport.dispatchEvent(new Event('resize'))
    expect(raf).toHaveBeenCalledTimes(calls)
  } finally {
    if(descriptor)Object.defineProperty(window,'visualViewport',descriptor)
    else Reflect.deleteProperty(window,'visualViewport')
    vi.restoreAllMocks()
  }
})
