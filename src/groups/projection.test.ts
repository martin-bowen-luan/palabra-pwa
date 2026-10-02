import { describe,it,expect } from 'vitest'
import { groupDate,recordCheckin,toSummary,completionRate,isShareableDate } from './projection'
import type { GroupBinding,CheckinEvent } from './types'
const binding:GroupBinding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:'2026-10-01T00:00:00Z',enabled:true}
const event:CheckinEvent={wordId:'en:apple',language:'en',kind:'new',outcome:'skipped',at:'2026-10-01T01:00:00Z',goal:10}
describe('group check-in accounting',()=>{
  it('uses Beijing midnight regardless of device timezone',()=>{
    expect(groupDate('2026-10-01T15:59:59Z')).toBe('2026-10-01')
    expect(groupDate('2026-10-01T16:00:00Z')).toBe('2026-10-02')
    expect(()=>groupDate('invalid')).toThrow()
  })
  it('deduplicates shared word IDs and freezes the first classification and goal',()=>{
    const first=recordCheckin(undefined,binding,event)!
    const next=recordCheckin(first,binding,{...event,kind:'review',outcome:'passed',goal:20,at:'2026-10-01T02:00:00Z'})!
    expect(toSummary(next,binding)).toMatchObject({newCount:1,reviewCount:0,skippedCount:0,goal:10,version:2})
    expect(first.entries['en:apple'].outcome).toBe('skipped')
    expect(Object.keys(toSummary(next,binding)).sort()).toEqual(['membershipId','membershipGeneration','deviceGeneration','date','language','version','goal','newCount','reviewCount','skippedCount','lastPracticedAt'].sort())
  })
  it('does not share before joining or while disabled',()=>{
    expect(recordCheckin(undefined,{...binding,enabled:false},event)).toBeUndefined()
    expect(recordCheckin(undefined,binding,{...event,at:'2026-09-30T01:00:00Z'})).toBeUndefined()
  })
  it('keeps skipped until independently passed and ignores stale/duplicate events',()=>{
    const a=recordCheckin(undefined,binding,event)!
    const b=recordCheckin(a,binding,{...event,outcome:'assisted',at:'2026-10-01T02:00:00Z'})!
    expect(toSummary(b,binding).skippedCount).toBe(1)
    expect(recordCheckin(b,binding,event)).toBe(b)
    const c=recordCheckin(b,binding,{...event,outcome:'passed',at:'2026-10-01T03:00:00Z'})!
    expect(toSummary(recordCheckin(c,binding,{...event,outcome:'wrong',at:'2026-10-01T04:00:00Z'})!,binding).skippedCount).toBe(0)
    expect(recordCheckin(a,binding,event)).toBe(a)
  })
  it('starts a separate ledger after midnight or changed device or membership',()=>{
    const old=recordCheckin(undefined,binding,event)!
    const tomorrow=recordCheckin(old,binding,{...event,wordId:'en:pear',at:'2026-10-01T16:00:00Z',goal:20})!
    expect(Object.keys(tomorrow.entries)).toEqual(['en:pear'])
    expect(tomorrow.goal).toBe(20)
    const restored=recordCheckin(old,{...binding,deviceGeneration:2},{...event,wordId:'en:pear'})!
    expect(Object.keys(restored.entries)).toEqual(['en:pear'])
    expect(restored.key).not.toBe(old.key)
    expect(()=>toSummary(old,{...binding,membershipId:'different'})).toThrow()
  })
  it('keeps language denominators separate and caps only the progress bar',()=>{
    const en=toSummary(recordCheckin(undefined,binding,{...event,kind:'review'})!,binding)
    expect(completionRate(en)).toBe(0)
    const es=toSummary(recordCheckin(undefined,binding,{...event,language:'es',wordId:'hola',kind:'review',goal:50})!,binding)
    expect(completionRate(es)).toBe(2)
    expect(completionRate({...en,newCount:25})).toBe(100)
  })
  it('limits uploads to today and the preceding 29 Beijing dates',()=>{
    expect(isShareableDate('2026-09-02','2026-10-01T03:00:00Z')).toBe(true)
    expect(isShareableDate('2026-09-01','2026-10-01T03:00:00Z')).toBe(false)
    expect(isShareableDate('2026-10-02','2026-10-01T03:00:00Z')).toBe(false)
    expect(isShareableDate('2026-02-30','2026-10-01T03:00:00Z')).toBe(false)
  })
})
