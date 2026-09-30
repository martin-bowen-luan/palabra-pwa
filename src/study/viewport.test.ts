import { describe, it, expect } from 'vitest'
import { measureStudyViewport } from './viewport'
describe('study viewport', () => {
  it('uses visible height and offset', () => {
    expect(measureStudyViewport({layoutHeight:844,visualHeight:440,offsetTop:72,scale:1})).toEqual({height:440,top:72,compact:true,mode:'bounded'})
  })
  it('keeps zoom and extremely short screens scrollable and rejects invalid dimensions', () => {
    expect(measureStudyViewport({layoutHeight:844,visualHeight:380,scale:2}).mode).toBe('flow')
    expect(measureStudyViewport({layoutHeight:320,visualHeight:240}).mode).toBe('flow')
    expect(measureStudyViewport({layoutHeight:844,visualHeight:0,offsetTop:-2})).toMatchObject({height:844,top:0})
    expect(measureStudyViewport({layoutHeight:844,visualHeight:NaN,offsetTop:NaN})).toMatchObject({height:844,top:0})
  })
})
