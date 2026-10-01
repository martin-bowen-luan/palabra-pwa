import type { LearningLanguage } from '../types'
import type { CheckinDay,CheckinEvent,GroupBinding,SummaryPayload,PracticeOutcome } from './types'
const formatter=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'})
export function groupDate(at:string):string {
  const parts=formatter.formatToParts(new Date(at))
  const value=(name:string)=>parts.find(p=>p.type===name)!.value
  return `${value('year')}-${value('month')}-${value('day')}`
}
export function ledgerKey(binding:GroupBinding,date:string,language:LearningLanguage):string {
  return JSON.stringify([binding.profileId,binding.groupId,binding.membershipId,binding.membershipGeneration,binding.deviceGeneration,date,language])
}
export function isShareableDate(date:string,now=new Date().toISOString()):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/u.test(date))return false
  const stamp=Date.parse(`${date}T00:00:00Z`)
  if(!Number.isFinite(stamp)||new Date(stamp).toISOString().slice(0,10)!==date)return false
  const age=(Date.parse(`${groupDate(now)}T00:00:00Z`)-stamp)/86400000
  return age>=0&&age<30
}
function outcome(previous:PracticeOutcome|undefined,next:PracticeOutcome):PracticeOutcome {
  if(previous==='passed'||next==='passed')return 'passed'
  if(previous==='skipped'||next==='skipped')return 'skipped'
  return next
}
export function recordCheckin(day:CheckinDay|undefined,binding:GroupBinding,event:CheckinEvent):CheckinDay|undefined {
  const time=Date.parse(event.at)
  if(!binding.enabled||!Number.isFinite(time)||!Number.isFinite(Date.parse(binding.joinedAt))||time<Date.parse(binding.joinedAt))return day
  if(!event.wordId||!Number.isSafeInteger(event.goal)||event.goal<=0)throw new Error('Invalid check-in')
  const date=groupDate(event.at),key=ledgerKey(binding,date,event.language)
  const current=day?.key===key?day:undefined,previous=current?.entries[event.wordId]
  if(previous&&time<=Date.parse(previous.at))return current
  return {key,date,language:event.language,goal:current?.goal??event.goal,
    entries:{...current?.entries,[event.wordId]:{kind:previous?.kind??event.kind,outcome:outcome(previous?.outcome,event.outcome),at:event.at}},
    version:(current?.version??0)+1,lastPracticedAt:current&&Date.parse(current.lastPracticedAt)>time?current.lastPracticedAt:event.at}
}
export function toSummary(day:CheckinDay,binding:GroupBinding):SummaryPayload {
  if(day.key!==ledgerKey(binding,day.date,day.language))throw new Error('Mismatched check-in identity')
  const entries=Object.values(day.entries)
  return {membershipId:binding.membershipId,membershipGeneration:binding.membershipGeneration,deviceGeneration:binding.deviceGeneration,
    date:day.date,language:day.language,version:day.version,goal:day.goal,
    newCount:entries.filter(e=>e.kind==='new').length,reviewCount:entries.filter(e=>e.kind==='review').length,
    skippedCount:entries.filter(e=>e.outcome==='skipped').length,lastPracticedAt:day.lastPracticedAt}
}
export function completionRate(summary:Pick<SummaryPayload,'language'|'goal'|'newCount'|'reviewCount'>):number {
  return summary.goal>0?Math.min(100,Math.max(0,(summary.newCount+(summary.language==='es'?summary.reviewCount:0))*100/summary.goal)):0
}
