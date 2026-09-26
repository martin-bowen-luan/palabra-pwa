import { describe, expect, it } from 'vitest'
import { mergeRelations } from './merge'
import type { AiResult } from './types'
import type { VocabularyEntry } from '../types'
const word: VocabularyEntry = { id:'en:happy',language:'en',term:'happy',partOfSpeech:'adj.',meaningZh:'快乐的',category:'测试',examples:[],derivedTerms:['happiness'],roots:[{part:'-y',meaningZh:'具有某种性质',sourceUrl:'https://dictionary.test'}],relatedTerms:['glad'] }
const ai: AiResult = { derived:[{term:'Happiness',partOfSpeech:'n.',meaningZh:'幸福',relationship:'happy + -ness'},{term:'happiness ',partOfSpeech:'n.',meaningZh:'幸福',relationship:'重复'},{term:'happily',partOfSpeech:'adv.',meaningZh:'快乐地',relationship:'副词形式'}], roots:[{part:'-y',kind:'suffix',meaningZh:'相反',explanation:'未经核实的不同说法'}],synonyms:[{term:'Glad',meaningZh:'高兴的',difference:'常用于具体事件'}],conflicts:[] }
describe('dictionary-first AI merging',()=>{
  it('deduplicates additions without overwriting the original dictionary or assigning AI citations',()=>{
    const before=JSON.stringify(word);const merged=mergeRelations(word,ai,'derived')
    expect(merged.map(item=>item.term)).toEqual(['happiness','happily'])
    expect(merged[0].dictionary).toBe(true);expect(merged[0].explanation).toBe('happy + -ness')
    expect(merged[1].dictionary).toBe(false);expect(JSON.stringify(word)).toBe(before)
    expect(merged[1].partOfSpeech).toBe('adv.')
  })
  it('keeps conflicting root explanations separate and preserves affix hyphens',()=>{
    const merged=mergeRelations(word,ai,'roots')
    expect(merged[0]).toMatchObject({term:'-y',dictionary:true,meaningZh:'具有某种性质',aiMeaning:'相反',conflict:true})
    expect(mergeRelations(word,{...ai,roots:[{part:'y',kind:'mnemonic',meaningZh:'联想',explanation:'仅为联想'}]},'roots')).toHaveLength(2)
  })
})
