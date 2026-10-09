import { it, expect } from 'vitest'
import { matchesPrimaryRange,projectWordbook } from './catalog'
import type { WordbookMember,WordbookCatalog } from './types'
import { exampleKey } from './catalog'
const member:WordbookMember={wordId:'en:apple',order:0,memberships:[{sourceBookId:'g1s1',grade:1,semester:1},{sourceBookId:'g2s2',grade:2,semester:2}]}
it('matches grade and semester on the same membership',()=>{
  expect(matchesPrimaryRange(member,{grade:1,semester:2})).toBe(false)
  expect(matchesPrimaryRange(member,{grade:2,semester:2})).toBe(true)
  expect(matchesPrimaryRange(member,{})).toBe(true)
})
it('projects book senses without changing IDs or canonical data',()=>{
  const word={id:'en:apple',language:'en' as const,term:'apple',partOfSpeech:'n.',meaningZh:'旧释义',category:'高考',examples:[],senses:[{id:'s1',partOfSpeech:'n.',meaningZh:'苹果'}]}
  const book:WordbookCatalog={id:'en-oxford-primary',language:'en',title:'小学',revision:1,members:[{...member,senseIds:['s1'],displayTerm:'Apple'}]}
  expect(projectWordbook([word],book)[0]).toMatchObject({id:'en:apple',term:'Apple',meaningZh:'苹果'})
  expect(word.meaningZh).toBe('旧释义')
})
it('orders the selected grade by its matching semesters rather than earlier memberships',()=>{
  const words=['wash','moon'].map(term=>({id:`en:${term}`,language:'en' as const,term,partOfSpeech:'n.',meaningZh:term,category:'小学',examples:[]}))
  const book:WordbookCatalog={id:'en-oxford-primary',language:'en',title:'小学',revision:1,members:[
    {wordId:'en:wash',order:0,memberships:[{sourceBookId:'g1s1',grade:1,semester:1},{sourceBookId:'g2s2',grade:2,semester:2}]},
    {wordId:'en:moon',order:1,memberships:[{sourceBookId:'g2s1',grade:2,semester:1}]},
  ]}
  expect(projectWordbook(words,book,{grade:2}).map(w=>w.term)).toEqual(['moon','wash'])
})
it('selects one example per key rather than multiplying repeated source examples', () => {
  const example = { text: 'The file is here.', translationZh: '文件在这里。' }
  const word = { id: 'en:file', language: 'en' as const, term: 'file', partOfSpeech: 'n.', meaningZh: '文件', category: '高考', examples: [example, example] }
  const book: WordbookCatalog = { id: 'en-highschool', language: 'en', title: '高考', revision: 1, members: [{ wordId: word.id, order: 0, memberships: [], exampleKeys: [exampleKey(example), exampleKey(example)] }] }
  expect(projectWordbook([word], book)[0].examples).toHaveLength(2)
})
