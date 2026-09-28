import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useAppState } from '../app/AppState'
import { storage as defaultStorage, StaleStudySessionError, type PalabraStorage } from '../data/storage'
import { toLocalDate } from '../domain/stats'
import { advanceSpanish, buildSpanishGroup, createSpanishSession, currentSpanishWord, eligibleSpanish, removeSpanishWord, scheduleSpanishReview, spanishHint, submitSpanish } from './course'
import type { ActiveSession, StudySession, WordProgress } from '../types'
import type { SpanishDailyRecord, SpanishDailyUpdate, SpanishOutcome } from './sessionTypes'

interface SpanishContextValue {
  enabled: boolean
  days: SpanishDailyRecord[]
  day: SpanishDailyRecord
  busy: boolean
  error: string
  start: (mode?:'learn'|'review',extra?:boolean)=>Promise<boolean>
  draft: (value:string)=>void
  hint: ()=>Promise<void>
  submit: (value:string)=>Promise<void>
  reveal: (value:string)=>Promise<void>
  next: ()=>Promise<boolean>
  skip: ()=>Promise<boolean>
  fluent: ()=>Promise<boolean>
  flush: ()=>Promise<boolean>
}
const Context=createContext<SpanishContextValue|null>(null)

/** All writes from one tab are serialized; IDB CAS arbitrates between tabs. */
export function SpanishProvider({children,storageClient=defaultStorage}:{children:ReactNode;storageClient?:PalabraStorage}) {
  const app=useAppState()
  const [days,setDays]=useState<SpanishDailyRecord[]>([])
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [today,setToday]=useState(()=>toLocalDate(new Date()))
  const chain=useRef<Promise<unknown>>(Promise.resolve())
  const epoch=useRef(0)
  const saveFailed=useRef(false)
  const dirtyDraft=useRef<{prompt:string;value:string}|undefined>(undefined)
  const [recoveryRequired,setRecoveryRequired]=useState(false)
  const ended=useRef<string|undefined>(undefined)
  const active=useRef(app.activeSession)
  const previousProp=useRef(app.activeSession)
  const appRef=useRef(app); appRef.current=app
  if(previousProp.current!==app.activeSession) {
    const incoming=app.activeSession,current=active.current
    if(!incoming || incoming.startedAt!==ended.current && (!current || incoming.startedAt!==current.startedAt || (incoming.revision??0)>=(current.revision??0)))active.current=incoming
    previousProp.current=incoming
  }
  const enabled=app.settings.learningLanguage==='es'&&app.vocabulary.some(eligibleSpanish)
  const day=days.find(item=>item.id===today)??{id:today,entries:{}}
  const legacyActive=app.activeSession?.spanish?undefined:app.activeSession

  const refresh=async()=> {
    const records=await storageClient.getSpanishDays()
    setDays(records);setToday(toLocalDate(new Date()))
    await appRef.current.refreshLearningData()
  }
  useEffect(()=>{
    if(!app.ready) return
    let mounted=true
    const reload=()=>{ void storageClient.getSpanishDays().then(records=>{if(mounted){setDays(records);setToday(toLocalDate(new Date()))}}).catch(()=>{if(mounted)setError('无法读取今日练习记录，请刷新重试。')}) }
    reload()
    const interval=window.setInterval(reload,60000)
    window.addEventListener('focus',reload)
    return ()=>{mounted=false;window.clearInterval(interval);window.removeEventListener('focus',reload)}
  },[app.ready,app.settings.learningLanguage,app.progress,legacyActive,storageClient])

  function enqueue<T>(work:()=>Promise<T>,fallback:T,transition=true):Promise<T> {
    const generation=epoch.current
    if(transition)setBusy(true)
    const result=chain.current.then(async()=>{
      if(generation!==epoch.current){if(transition)setBusy(false);return fallback}
      try {setError('');const result=await work();saveFailed.current=false;return result}
      catch(cause) {
        saveFailed.current=true
        epoch.current++
        if(cause instanceof StaleStudySessionError) {
          dirtyDraft.current=undefined
          try {
            active.current=await storageClient.getActiveSession('es')
            await refresh()
            setError('本组已在其他页面更新，已恢复最新进度，请重新操作。')
          } catch {
            setRecoveryRequired(true)
            setError('本组已在其他页面更新，但无法读取最新状态。请刷新页面后继续。')
          }
        } else setError('保存失败，进度尚未更新。请检查本地存储后重试。')
        return fallback
      } finally {if(transition)setBusy(false)}
    })
    chain.current=result.catch(()=>undefined)
    return result
  }
  const identity=()=>active.current?.spanish?`${active.current.startedAt}:${active.current.practice?.promptNumber}`:undefined
  const displayedIdentity=()=>appRef.current.activeSession?.spanish?`${appRef.current.activeSession.startedAt}:${appRef.current.activeSession.practice?.promptNumber}`:undefined
  async function persist(next:ActiveSession,progress?:WordProgress,daily?:SpanishDailyUpdate):Promise<boolean> {
    const finished=!next.practice?.pendingIds.length&&!next.practice?.delayed.length
    const now=new Date()
    const state=next.spanish!
    const tested=next.wordIds.filter(id=>!state.fluentIds.includes(id))
    const completed:StudySession|undefined=finished?{
      id:`es-cloze:${next.startedAt}`,language:'es',mode:next.mode,date:toLocalDate(now),
      newCount:next.newWordIds.length,reviewCount:next.reviewWordIds.length,
      correctCount:tested.filter(id=>next.practice?.firstAnswers[id]===true).length,
      totalCount:tested.length,durationSeconds:Math.max(0,Math.round((now.getTime()-Date.parse(next.startedAt))/1000)),completed:true,skippedCount:state.skippedIds.length,
    }:undefined
    const revised={...next,revision:(active.current?.revision??0)+1}
    await storageClient.commitSpanishStep(revised,progress,daily,completed)
    if(finished)ended.current=revised.startedAt
    active.current=finished?undefined:revised
    // Apply the acknowledged transaction directly. A subsequent read failure must not
    // leave an old question on screen while actions operate on the new queue head.
    appRef.current.acceptSpanishCommit(active.current,progress,completed)
    if(daily)setDays(records=>{
      const day=records.find(record=>record.id===daily.date)??{id:daily.date,entries:{}}
      const prior=day.entries[daily.wordId]
      return [...records.filter(record=>record.id!==daily.date),{...day,entries:{...day.entries,[daily.wordId]:{...daily.entry,kind:prior?.kind??daily.entry.kind}}}]
    })
    setToday(toLocalDate(now))
    if(dirtyDraft.current?.prompt!==identity()||dirtyDraft.current?.value===revised.spanish?.draft)dirtyDraft.current=undefined
    return finished
  }
  function dailyUpdate(session:ActiveSession,outcome:SpanishOutcome):SpanishDailyUpdate {
    const word=currentSpanishWord(session)!
    return {date:toLocalDate(new Date()),wordId:word.id,entry:{kind:session.newWordIds.includes(word.id)&&!appRef.current.progress[word.id]?'new':'review',lemmaId:word.spanishData!.lemmaId,outcome,at:new Date().toISOString()}}
  }
  const start=(mode:'learn'|'review'='learn',extra=false)=>enqueue(async()=>{
    const saved=await storageClient.getActiveSession('es')
    if(saved){active.current=saved;await refresh();return true}
    const currentApp=appRef.current
    const now=new Date()
    const [records,todayRecord]=await Promise.all([storageClient.getAllProgress('es'),storageClient.getSpanishDay(toLocalDate(now))])
    const plan=buildSpanishGroup(currentApp.vocabulary,Object.fromEntries(records.map(p=>[p.wordId,p])),todayRecord,currentApp.settings.spanishDailyGoal??50,now,extra,mode)
    if(!plan.all.length){await refresh();return false}
    active.current=await storageClient.createActiveSession(createSpanishSession(plan,now,mode))
    await refresh();return true
  },false)
  const draft=(value:string)=>{
    const prompt=displayedIdentity()
    if(prompt)dirtyDraft.current={prompt,value}
    void enqueue(async()=>{
      const session=active.current
      if(!prompt||prompt!==identity()||!session?.spanish||session.spanish.feedback)return
      await persist({...session,spanish:{...session.spanish,draft:value}})
    },undefined,false)
  }
  const hint=()=>{
    const prompt=displayedIdentity()
    return enqueue(async()=>{
      const session=active.current
      if(!session?.spanish||prompt!==identity()||session.spanish.feedback)return
      const word=currentSpanishWord(session)!,limit=spanishHint(word.spanishData!.cloze.answer,0).limit
      const pendingDraft=dirtyDraft.current
      const draft=pendingDraft && pendingDraft.prompt===prompt?pendingDraft.value:session.spanish.draft
      await persist({...session,spanish:{...session.spanish,draft,hintCount:Math.min(limit,session.spanish.hintCount+1)}})
    },undefined)
  }
  const submit=(value:string,answerRevealed=false)=>{
    const prompt=displayedIdentity()
    return enqueue(async()=>{
      const session=active.current
      if(!session?.spanish||prompt!==identity()||session.spanish.feedback||!answerRevealed&&!value.trim())return
      const next=submitSpanish(session,value,answerRevealed)
      const feedback=next.spanish!.feedback!
      const outcome=!feedback.correct||feedback.assisted?'forgotten':'remembered'
      const update=dailyUpdate(session,outcome)
      // On a wrong attempt persist the shortened interval immediately, even if the user leaves.
      const previous=appRef.current.progress[update.wordId]
      const progress=outcome==='forgotten'&&!session.spanish.failedIds.includes(update.wordId)?scheduleSpanishReview(previous,update.wordId,outcome):undefined
      await persist(next,progress,update)
    },undefined)
  }
  const next=()=>{
    const prompt=displayedIdentity()
    return enqueue(async()=>{
      const session=active.current
      if(!session?.spanish?.feedback||prompt!==identity())return false
      const word=currentSpanishWord(session)!,nextSession=advanceSpanish(session)
      const resolved=nextSession.spanish!.resolvedIds.includes(word.id)
      const outcome=session.spanish.failedIds.includes(word.id)?'forgotten':'remembered'
      // Independent recall clears the skip boost, but prior errors still keep
      // the next review at the short interval.
      const progress=resolved?{...scheduleSpanishReview(appRef.current.progress[word.id],word.id,outcome),reviewPriority:'normal' as const}:undefined
      return persist(nextSession,progress,resolved?dailyUpdate(session,outcome):undefined)
    },false)
  }
  const remove=(outcome:'skipped'|'fluent')=>{
    const prompt=displayedIdentity()
    return enqueue(async()=>{
      const session=active.current
      if(!session?.spanish||prompt!==identity())return false
      const word=currentSpanishWord(session)!
      return persist(removeSpanishWord(session,outcome),scheduleSpanishReview(appRef.current.progress[word.id],word.id,outcome),dailyUpdate(session,outcome))
    },false)
  }
  const flush=async()=>{
    await chain.current
    const dirty=dirtyDraft.current
    if(dirty&&dirty.prompt===identity())await enqueue(async()=>{
      const session=active.current
      if(session?.spanish&&!session.spanish.feedback&&dirty.prompt===identity())await persist({...session,spanish:{...session.spanish,draft:dirty.value}})
    },undefined)
    return !saveFailed.current&&!recoveryRequired
  }
  return <Context.Provider value={{enabled,days,day,busy:busy||recoveryRequired,error,start,draft,hint,submit,reveal:value=>submit(value,true),next,skip:()=>remove('skipped'),fluent:()=>remove('fluent'),flush}}>{children}</Context.Provider>
}
export function useSpanish() {const value=useContext(Context);if(!value)throw new Error('SpanishProvider required');return value}
