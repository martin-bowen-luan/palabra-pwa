import type { VocabularyEntry } from '../types'
import type { EnglishWordbookBundle } from './types'
export const bookWords:VocabularyEntry[]=['apple','pear','peach'].map((term,i)=>({id:`en:${term}`,language:'en',term,meaningZh:['苹果','梨','桃子'][i],partOfSpeech:'n.',category:'测试',examples:[{text:`I ate a ${term}.`,translationZh:'我吃了水果。'}]}))
export const bookFixture:EnglishWordbookBundle={revision:99,words:bookWords,books:[
  {id:'en-highschool',language:'en',title:'高考 3500',revision:1,members:[{wordId:'en:apple',order:0,memberships:[]},{wordId:'en:peach',order:1,memberships:[]}]},
  {id:'en-oxford-primary',language:'en',title:'小学必背单词（牛津版）',revision:1,members:[{wordId:'en:apple',order:0,memberships:[{sourceBookId:'g1s1',grade:1,semester:1}]},{wordId:'en:pear',order:1,memberships:[{sourceBookId:'g2s2',grade:2,semester:2}]}]},
]}
