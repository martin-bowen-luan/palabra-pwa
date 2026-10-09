import type { VocabularyEntry } from '../types'
export type WordbookId='en-highschool'|'en-oxford-primary'|'en-cfa-level1'
export interface PrimaryRange { grade?:1|2|3|4|5|6; semester?:1|2 }
export interface BookMembership {sourceBookId:string;grade:1|2|3|4|5|6;semester:1|2}
export interface WordbookMember {wordId:string;order:number;sourceOrder?:number;memberships:BookMembership[];displayTerm?:string;displayMeaningZh?:string;displayPartOfSpeech?:string;senseIds?:string[];exampleKeys?:string[]}
export interface WordbookCatalog {id:WordbookId;language:'en';title:string;revision:number;members:WordbookMember[]}
export interface EnglishWordbookBundle {revision:number;words:VocabularyEntry[];books:WordbookCatalog[]}
