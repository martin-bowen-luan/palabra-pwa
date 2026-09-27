import type { ActiveSession, VocabularyEntry, WordProgress } from '../types'
import type { DailyPlan } from '../domain/dailyPlan'
import { advancePractice, createPracticeQueue, currentPracticeWord, removePracticeWord } from '../domain/practiceQueue'
import { isDue, markFluent } from '../domain/reviewScheduler'
import { reviewUrgency, scheduleEnglishReview } from '../domain/englishReview'
import type { SpanishDailyRecord, SpanishOutcome } from './sessionTypes'

export const normalizeSpanish = (text: string) => text.normalize('NFC').trim().toLocaleLowerCase('es')
export const eligibleSpanish = (word: VocabularyEntry) => word.language === 'es' && word.spanishData?.eligible === true && word.spanishData.cloze.reviewed

export function buildSpanishGroup(words: VocabularyEntry[], progress: Record<string, WordProgress>, day: SpanishDailyRecord, goal: number, now = new Date(), extra = false, mode: 'learn'|'review' = 'learn'): DailyPlan {
  const capacity = extra ? 10 : Math.min(10, Math.max(0, goal - Object.keys(day.entries).length))
  if (!capacity) return {all:[],review:[],newWords:[]}
  const eligible = words.filter(eligibleSpanish)
  const review = eligible.filter(word => progress[word.id] && isDue(progress[word.id], now))
    .sort((a,b) => reviewUrgency(progress[b.id],now)-reviewUrgency(progress[a.id],now) || a.id.localeCompare(b.id)).slice(0, capacity)
  const newWords: VocabularyEntry[] = []
  const familyCount = new Map<string,number>()
  for (const entry of Object.values(day.entries)) if (entry.kind === 'new') familyCount.set(entry.lemmaId,(familyCount.get(entry.lemmaId)??0)+1)
  const groupFamilies = new Set(review.map(word=>word.spanishData!.lemmaId))
  if (mode !== 'review') for (const word of eligible) {
    if (review.length+newWords.length >= capacity) break
    const family=word.spanishData!.lemmaId
    if (progress[word.id] || day.entries[word.id] || groupFamilies.has(family) || (familyCount.get(family)??0)>=5) continue
    newWords.push(word)
    groupFamilies.add(family)
  }
  return {all:[...review,...newWords],review,newWords}
}

export function createSpanishSession(plan: DailyPlan, now=new Date(), mode: 'learn'|'review'='learn'): ActiveSession {
  return {id:'active-session:es',language:'es',mode,phase:'quiz',wordIds:plan.all.map(w=>w.id),newWordIds:plan.newWords.map(w=>w.id),reviewWordIds:plan.review.map(w=>w.id),currentIndex:0,correctCount:0,answeredCount:0,startedAt:now.toISOString(),revision:0,practice:createPracticeQueue(plan.all.map(w=>w.id)),assignedNewCount:plan.newWords.length,assignedReviewCount:plan.review.length,
    spanish:{version:1,words:structuredClone(plan.all),draft:'',hintCount:0,failedIds:[],resolvedIds:[],skippedIds:[],fluentIds:[]}}
}
export function currentSpanishWord(session: ActiveSession): VocabularyEntry | undefined {
  return session.spanish?.words.find(word=>word.id===currentPracticeWord(session.practice!))
}
export function spanishHint(answer: string, count: number): {mask:string;limit:number} {
  const chars=Array.from(answer.normalize('NFC'))
  const limit=Math.floor(chars.filter(c=>/[a-záéíóúüñ]/i.test(c)).length/2)
  let letters=0
  return {limit,mask:chars.map(c=>/[a-záéíóúüñ]/i.test(c)? ++letters<=Math.min(count,limit)?c:'_':c).join('')}
}
export function submitSpanish(session: ActiveSession, input: string): ActiveSession {
  const state=session.spanish!, word=currentSpanishWord(session)
  if (!word || state.feedback || !input.trim()) return session
  const correct=normalizeSpanish(input)===normalizeSpanish(word.spanishData!.cloze.answer)
  const assisted=state.hintCount>0
  const failedIds=!correct||assisted ? [...new Set([...state.failedIds,word.id])] : state.failedIds
  return {...session,answeredCount:session.answeredCount+1,spanish:{...state,draft:input,failedIds,feedback:{correct,assisted,input,nextPractice:advancePractice(session.practice!,correct,assisted)}}}
}
export function advanceSpanish(session: ActiveSession): ActiveSession {
  const state=session.spanish!, feedback=state.feedback, word=currentSpanishWord(session)
  if (!feedback || !word) return session
  const queue=feedback.nextPractice
  const resolved=!queue.pendingIds.includes(word.id)&&!queue.delayed.some(item=>item.wordId===word.id)
  return {...session,practice:queue,spanish:{...state,feedback:undefined,draft:'',hintCount:0,resolvedIds:resolved?[...new Set([...state.resolvedIds,word.id])]:state.resolvedIds}}
}
export function removeSpanishWord(session: ActiveSession, outcome:'skipped'|'fluent'): ActiveSession {
  const word=currentSpanishWord(session), state=session.spanish!
  if (!word) return session
  const practice=removePracticeWord(session.practice!,word.id)
  // Resolving another unit by skip/fluent is also an intervening encounter.
  practice.delayed=practice.delayed.map(item=>({...item,remaining:item.remaining-1}))
  const due=practice.delayed.filter(item=>item.remaining<=0)
  practice.pendingIds=[...due.map(item=>item.wordId),...practice.pendingIds]
  practice.delayed=practice.delayed.filter(item=>item.remaining>0)
  practice.firstAnswers={...practice.firstAnswers,[word.id]:outcome==='fluent'}
  return {...session,practice,spanish:{...state,draft:'',hintCount:0,feedback:undefined,resolvedIds:[...new Set([...state.resolvedIds,word.id])],skippedIds:outcome==='skipped'?[...state.skippedIds,word.id]:state.skippedIds,fluentIds:outcome==='fluent'?[...state.fluentIds,word.id]:state.fluentIds}}
}
export function scheduleSpanishReview(current: WordProgress|undefined, wordId:string, outcome:SpanishOutcome, now=new Date()): WordProgress {
  if(outcome==='fluent') return markFluent(current,wordId,'es',now)
  const next={...scheduleEnglishReview(current,wordId,outcome,now),language:'es' as const}
  if(outcome==='forgotten'&&current?.reviewPriority==='skipped')next.reviewPriority='skipped'
  return next
}
