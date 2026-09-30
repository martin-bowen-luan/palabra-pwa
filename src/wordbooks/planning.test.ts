import { it,expect } from 'vitest'
import { buildWordbookGroup } from './planning'
import type { VocabularyEntry,WordProgress,StudySession } from '../types'
import type { WordbookCatalog } from './types'
import { toLocalDate } from '../domain/stats'
const words:VocabularyEntry[]=Array.from({length:24},(_,i)=>({id:`en:${i}`,language:'en',term:`word${i}`,partOfSpeech:'n.',meaningZh:`词${i}`,category:'测试',examples:[]}))
const book:WordbookCatalog={id:'en-oxford-primary',title:'小学',language:'en',revision:1,members:words.slice(0,20).map((w,i)=>({wordId:w.id,order:i,memberships:[{sourceBookId:`g${i%2+1}`,grade:i%2?2:1,semester:1}]}))}
const now=new Date('2026-09-30T12:00:00'),progress:Record<string,WordProgress>=Object.fromEntries([0,1,22].map(i=>[words[i].id,{wordId:words[i].id,language:'en',stage:1,status:'learning',reviewCount:1,correctCount:1,lastReviewedAt:'2026-09-01',nextReviewAt:'2026-09-02'}]))
const args={words,book,range:{grade:1 as const},progress,sessions:[] as StudySession[],goal:20,mode:'learn' as const,reviewScope:'book' as const,now}
it('shares learned exclusions, caps groups and filters only new words',()=>{
  const fresh=buildWordbookGroup(args)
  expect(fresh.all).toHaveLength(9);expect(fresh.all.some(w=>w.id==='en:0')).toBe(false)
  expect(buildWordbookGroup({...args,range:{}}).all).toHaveLength(10)
  expect(buildWordbookGroup({...args,mode:'review'}).all.map(w=>w.id)).toEqual(['en:0','en:1'])
  expect(buildWordbookGroup({...args,mode:'review',reviewScope:'all-english'}).all.map(w=>w.id)).toContain('en:22')
})
it('shares daily quota across books and permits an explicit five-word extension',()=>{
  const sessions=[{id:'today',date:toLocalDate(now),language:'en',newCount:20,reviewCount:0,completed:true,correctCount:20,totalCount:20,durationSeconds:100}] as StudySession[]
  expect(buildWordbookGroup({...args,sessions}).all).toEqual([])
  expect(buildWordbookGroup({...args,sessions,extra:5}).all).toHaveLength(5)
})
