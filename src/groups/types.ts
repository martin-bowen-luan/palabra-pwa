import type { LearningLanguage } from '../types'
export type PracticeKind = 'new' | 'review'
export type PracticeOutcome = 'passed' | 'assisted' | 'wrong' | 'skipped'
export interface GroupBinding {
  profileId:string;groupId:string;membershipId:string
  membershipGeneration:number;deviceGeneration:number;joinedAt:string;enabled:boolean
}
export interface CheckinEvent {
  wordId:string;language:LearningLanguage;kind:PracticeKind;outcome:PracticeOutcome;at:string;goal:number
}
export interface CheckinDay {
  key:string;date:string;language:LearningLanguage;goal:number
  entries:Record<string,{kind:PracticeKind;outcome:PracticeOutcome;at:string}>
  version:number;lastPracticedAt:string
}
export interface SummaryPayload {
  membershipId:string;membershipGeneration:number;deviceGeneration:number
  date:string;language:LearningLanguage;version:number;goal:number
  newCount:number;reviewCount:number;skippedCount:number;lastPracticedAt:string
}
export type RpcResult<T>={ok:true;data:T}|{ok:false;code:string}
export interface NotePayload {
  membershipId:string;membershipGeneration:number;deviceGeneration:number;date:string;text:string
}
export type GroupOutboxItem =
  | {kind:'summary';key:string;version:number;payload:SummaryPayload}
  | {kind:'note';key:string;version:number;payload:NotePayload}
