import type { VocabularyEntry,VocabularyExample } from '../types'
import type { PrimaryRange, WordbookCatalog, WordbookMember } from './types'
export const exampleKey=(e:VocabularyExample)=>`${e.text.normalize('NFC').replace(/\s+/gu,' ').trim()}\n${e.translationZh.normalize('NFC').replace(/\s+/gu,' ').trim()}`
export function matchesPrimaryRange(member:WordbookMember,range:PrimaryRange):boolean {
  return !range.grade&&!range.semester||member.memberships.some(m=>(range.grade===undefined||m.grade===range.grade)&&(range.semester===undefined||m.semester===range.semester))
}
export function projectWordbook(words:readonly VocabularyEntry[],book:WordbookCatalog,range:PrimaryRange={}):VocabularyEntry[] {
  const byId=new Map(words.map(w=>[w.id,w]))
  return [...book.members].sort((a,b)=>a.order-b.order).filter(m=>matchesPrimaryRange(m,range)).flatMap(member=>{
    const word=byId.get(member.wordId);if(!word)return []
    const senses=member.senseIds?.flatMap(id=>word.senses?.filter(s=>s.id===id)??[])??[]
    const examples=member.exampleKeys?.flatMap(key=>word.examples.filter(e=>exampleKey(e)===key))
    return [{...word,term:member.displayTerm??word.term,
      ...(senses.length?{partOfSpeech:senses[0].partOfSpeech,meaningZh:senses[0].meaningZh.split(/[；;]/u).filter(Boolean).slice(0,3).join('；')}:{}),
      ...(examples?.length?{examples}:{}),category:book.title}]
  })
}
