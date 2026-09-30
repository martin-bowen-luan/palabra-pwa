import { it,expect } from 'vitest'
import data from './english-wordbooks.json'
it('contains all primary memberships without duplicating shared dictionary IDs',()=>{
  expect(data.words).toHaveLength(3707)
  expect(new Set(data.words.map(w=>w.id)).size).toBe(3707)
  const [high,primary]=data.books
  expect(high.members).toHaveLength(3464);expect(primary.members).toHaveLength(1047)
  const highIds=new Set(high.members.map(m=>m.wordId))
  expect(primary.members.filter(m=>highIds.has(m.wordId))).toHaveLength(804)
  expect(primary.members.filter(m=>!highIds.has(m.wordId))).toHaveLength(243)
  expect(primary.members.flatMap(m=>m.memberships)).toHaveLength(1164)
  expect(new Set(primary.members.flatMap(m=>m.memberships.map(x=>x.sourceBookId))).size).toBe(12)
  for(const member of primary.members){
    const word=data.words.find(w=>w.id===member.wordId)!
    expect(word.meaningZh).toMatch(/[\u3400-\u9fff]/u)
    expect(word.examples.length).toBeGreaterThan(0)
  }
})
