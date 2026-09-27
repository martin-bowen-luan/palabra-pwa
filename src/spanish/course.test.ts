import { describe, expect, it } from 'vitest'
import type { VocabularyEntry, WordProgress } from '../types'
import { buildSpanishGroup, createSpanishSession, spanishHint, submitSpanish, advanceSpanish, normalizeSpanish, scheduleSpanishReview, removeSpanishWord } from './course'
import type { SpanishDailyRecord } from './sessionTypes'

const now = new Date('2026-09-27T10:00:00Z')
function word(id: string, lemma = id, answer = id): VocabularyEntry {
  return { id, language: 'es', term: answer, partOfSpeech: '动词', meaningZh: '说话', category: '动作', examples: [],
    spanishData: { lemmaId: lemma, lemma, kind: 'form', grammar: { tense: 'present', mood: 'indicative', person: 1 }, grammarLabel: '现在时 · 我', eligible: true,
      source: { url: 'https://en.wiktionary.org/wiki/hablar', revision: 'fixture', license: 'CC BY-SA 4.0' },
      cloze: { id: `q:${id}`, before: 'Yo ', answer, after: ' español.', translationZh: '我说西班牙语。', cueZh: '说话', reviewed: true, provenance: 'original', reviewVersion: 1 } } }
}
function due(id: string): WordProgress { return { wordId: id, language: 'es', stage: 0, status: 'learning', nextReviewAt: '2026-09-26T00:00:00Z', lastReviewedAt: '2026-09-25T00:00:00Z', correctCount: 0, reviewCount: 1 } }
const day: SpanishDailyRecord = { id: '2026-09-27', entries: {} }

describe('Spanish course', () => {
  it('keeps outstanding skip priority through unsuccessful or assisted attempts',()=>{
    const skipped=scheduleSpanishReview(undefined,'a','skipped',now)
    const retry=scheduleSpanishReview(skipped,'a','forgotten',now)
    expect(retry.reviewPriority).toBe('skipped')
    expect(scheduleSpanishReview(retry,'a','remembered',now).reviewPriority).toBe('normal')
    expect(scheduleSpanishReview(retry,'a','fluent',now).skipReview).toBe(true)
  })
  it('leaves excess due units available after the soft target and starts fresh counts tomorrow',()=>{
    const words=Array.from({length:60},(_,i)=>word(`due${i}`))
    const progress=Object.fromEntries(words.map(w=>[w.id,due(w.id)]))
    const entries=Object.fromEntries(words.slice(0,50).map(w=>[w.id,{kind:'review' as const,lemmaId:w.id,outcome:'remembered' as const,at:now.toISOString()}]))
    for(const w of words.slice(0,50))progress[w.id]={...progress[w.id],nextReviewAt:'2026-09-28T10:00:00Z'}
    expect(buildSpanishGroup(words,progress,{...day,entries},50,now).all).toHaveLength(0)
    expect(buildSpanishGroup(words,progress,{...day,entries},50,now,true).review).toHaveLength(10)
    const tomorrow=new Date('2026-09-28T11:00:00Z')
    expect(buildSpanishGroup(words,progress,{id:'2026-09-28',entries:{}},50,tomorrow).review).toHaveLength(10)
  })
  it('does not count an assigned but unstarted unit as learned or overdue',()=>{
    const words=[word('a'),word('b')]
    const assigned=createSpanishSession(buildSpanishGroup(words,{},day,50,now),now)
    expect(assigned.spanish!.resolvedIds).toEqual([])
    const tomorrow=buildSpanishGroup(words,{}, {id:'2026-09-28',entries:{}},50,new Date('2026-09-28T11:00:00Z'))
    expect(tomorrow.review).toEqual([])
    expect(tomorrow.newWords.map(w=>w.id)).toEqual(['a','b'])
  })
  it('counts skipped and fluent intervening units toward the three-unit revisit gap',()=>{
    let session=createSpanishSession({all:['a','b','c','d','e','f','g'].map(id=>word(id)),newWords:[],review:[]},now)
    session=advanceSpanish(submitSpanish(session,'wrong'))
    session=advanceSpanish(submitSpanish(session,'a'))
    session=removeSpanishWord(session,'skipped')
    session=removeSpanishWord(session,'fluent')
    session=removeSpanishWord(session,'skipped')
    expect(session.practice!.pendingIds[0]).toBe('a')
  })
  it('counts reviews toward the 50 target and places them before new units', () => {
    const entries = Object.fromEntries(Array.from({length: 48}, (_, i) => [`seen${i}`, { kind: 'review' as const, lemmaId: `seen${i}`, outcome: 'remembered' as const, at: now.toISOString() }]))
    const result = buildSpanishGroup([word('new'), word('due'), word('other')], { due: due('due') }, { ...day, entries }, 50, now)
    expect(result.all.map(w => w.id)).toEqual(['due', 'new'])
  })
  it('caps groups at ten and spreads new members of a family across groups', () => {
    const words = [word('a1','a'), word('a2','a'), ...Array.from({length: 12}, (_,i) => word(`b${i}`))]
    expect(buildSpanishGroup(words, {}, day, 50, now).all.map(w => w.id)).toEqual(['a1', ...Array.from({length:9}, (_,i)=>`b${i}`)])
  })
  it('limits five new forms per family per day but never postpones an overdue sibling', () => {
    const entries = Object.fromEntries(Array.from({length:5}, (_,i)=>[`a${i}`, {kind:'new' as const, lemmaId:'a',outcome:'remembered' as const,at:now.toISOString()}]))
    const result = buildSpanishGroup([word('a6','a'),word('a7','a'),word('b')], {a7:due('a7')}, {...day,entries},50,now)
    expect(result.all.map(w=>w.id)).toEqual(['a7','b'])
  })
  it('allows extra groups after the soft goal and does not admit unreviewed material', () => {
    const bad = word('bad'); bad.spanishData!.cloze.reviewed = false
    const full = {...day,entries:{done:{kind:'new' as const,lemmaId:'done',outcome:'remembered' as const,at:now.toISOString()}}}
    expect(buildSpanishGroup([word('a'),bad],{},full,1,now).all).toHaveLength(0)
    expect(buildSpanishGroup([word('a'),bad],{},full,1,now,true).all.map(w=>w.id)).toEqual(['a'])
  })
  it('normalizes composed accents but does not forgive wrong accent or ñ', () => {
    expect(normalizeSpanish('  HABLe\u0301 ')).toBe('hablé')
    expect(normalizeSpanish('hablo')).not.toBe(normalizeSpanish('habló'))
    expect(normalizeSpanish('ano')).not.toBe(normalizeSpanish('año'))
    expect(spanishHint('mañana',1)).toEqual({ mask:'m_____',limit:3 })
    expect(spanishHint('sí',5).mask).toBe('s_')
  })
  it('retries a wrong form immediately then revisits it after three different units', () => {
    const plan = {all:[word('a','a','hablo'),word('b'),word('c'),word('d'),word('e')],newWords:[],review:[]}
    let session = createSpanishSession(plan,now)
    session = submitSpanish(session,'hablas')
    expect(session.spanish!.feedback?.correct).toBe(false)
    session = advanceSpanish(session)
    expect(session.practice!.pendingIds[0]).toBe('a')
    session = advanceSpanish(submitSpanish(session,'hablo'))
    for(const answer of ['b','c','d']) session=advanceSpanish(submitSpanish(session,answer))
    expect(session.practice!.pendingIds[0]).toBe('a')
    expect(session.spanish!.failedIds).toContain('a')
  })
  it('assisted success is not mastery and hints cannot leak to the next prompt', () => {
    let session=createSpanishSession({all:[word('a','a','mañana'),word('b')],newWords:[word('a')],review:[]},now)
    session.spanish!.hintCount=1
    session=submitSpanish(session,'mañana')
    expect(session.spanish!.feedback?.assisted).toBe(true)
    session=advanceSpanish(session)
    expect(session.spanish!.hintCount).toBe(0)
    expect(session.practice!.delayed[0].wordId).toBe('a')
  })
  it('schedules skipped separately, then lengthens only genuinely remembered results', () => {
    const skip=scheduleSpanishReview(undefined,'a','skipped',now)
    expect(skip.language).toBe('es')
    expect(skip.nextReviewAt).toBe('2026-09-27T10:10:00.000Z')
    expect(skip.reviewPriority).toBe('skipped')
    const remembered=scheduleSpanishReview(skip,'a','remembered',now)
    expect(remembered.nextReviewAt).toBe('2026-09-28T10:00:00.000Z')
  })
})
