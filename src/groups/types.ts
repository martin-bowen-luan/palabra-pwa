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
export interface GroupProfile {profileId:string;nickname:string;deviceGeneration:number;receiveNudges:boolean;binding:GroupBinding|null}
export interface GroupData {group:{id:string;name:string;ownerId:string};binding:GroupBinding;memberProfiles:{id:string;nickname:string;receiveNudges:boolean;joinedAt:string}[]}
export interface GroupSummary {profileId:string;date:string;language:LearningLanguage;goal:number;newCount:number;reviewCount:number;skippedCount:number;conservative:boolean;lastPracticedAt:string;syncedAt:string}
export interface GroupNote {profileId:string;date:string;text:string;version:number;deviceGeneration:number;syncedAt:string}
export interface GroupNudge {id:string;senderId:string;receiverId:string;kind:'cheer'|'remind';date:string;createdAt:string;readAt:string|null}
export interface GroupActivity {summaries:GroupSummary[];notes:GroupNote[];nudges:GroupNudge[];serverTime:string}
export interface NotePayload {
  membershipId:string;membershipGeneration:number;deviceGeneration:number;date:string;text:string
}
export type GroupOutboxItem =
  | {kind:'summary';key:string;version:number;payload:SummaryPayload}
  | {kind:'note';key:string;version:number;payload:NotePayload}
