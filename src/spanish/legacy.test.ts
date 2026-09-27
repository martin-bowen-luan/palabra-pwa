import { expect, it } from 'vitest'
import { reconcileLegacySpanish } from './legacy'
import { spanishFixture } from './fixtures'
import { createSpanishSession, scheduleSpanishReview } from './course'
import { toLocalDate } from '../domain/stats'

it('uses only known session IDs and dated practice, leaving unavailable history as an aggregate',()=>{
  const words=[spanishFixture('a'),spanishFixture('b'),spanishFixture('unrelated')]
  const start=new Date('2026-09-26T12:00:00Z'),at=new Date('2026-09-26T13:00:00Z')
  const active={...createSpanishSession({all:words.slice(0,2),newWords:words.slice(0,2),review:[]},start),spanish:undefined,assignedNewCount:3}
  const progress={a:scheduleSpanishReview(undefined,'a','remembered',new Date('2026-09-20T12:00:00Z')),b:scheduleSpanishReview(undefined,'b','remembered',at),unrelated:scheduleSpanishReview(undefined,'unrelated','remembered',at)}
  const result=reconcileLegacySpanish(active,words,progress)!
  expect(result.updates.map(update=>[update.wordId,update.date,update.entry.outcome])).toEqual([['b',toLocalDate(at),'legacy']])
  expect(result.untracked).toBe(2)
  expect(reconcileLegacySpanish({...active,language:'en'},words,progress)).toBeUndefined()
})

it('does not fabricate a date for an explicitly ledger-covered removed unit',()=>{
  const word=spanishFixture('a'),active={...createSpanishSession({all:[word],newWords:[word],review:[]}),spanish:undefined,wordIds:[],newWordIds:[],spanishDailyIds:['a'],assignedNewCount:1}
  const result=reconcileLegacySpanish(active,[word],{})!
  expect(result).toEqual({updates:[],untracked:0})
})
