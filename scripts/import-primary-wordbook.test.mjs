import { it, expect } from 'vitest'
import { normalizePrimaryDataset, validatePrimaryBundle } from './import-primary-wordbook.mjs'
import { definitionSenses } from './lib/english-record-fields.mjs'
it('retains compound part-of-speech labels outside Chinese meanings',()=>{
  expect(definitionSenses('vt. & vi. 烹调； n. 厨师；')).toEqual([{partOfSpeech:'vt. & vi.',meaningZh:'烹调'},{partOfSpeech:'n.',meaningZh:'厨师'}])
})
const fixture=()=>({expected_words:1,downloaded_words:1,source_books:[{name:'小学牛津版二年级 下学期',url:'https://www.koolearn.com/dict/tag_395_1.html'}],entries:[{schema_version:3,word:'X-ray',definition:'n. X光照片；',books:['小学牛津版二年级 下学期'],detail_url:'https://www.koolearn.com/dict/wd_test.html',sections:[{title:'双语例句',text:'用作名词(n.)\nThe doctor looked at my X-ray.\n医生看了我的X光片。'}],raw_html:'<script>doNotImport()</script>'}]})
const normalize=d=>normalizePrimaryDataset(d,[],{}, {expectedCount:d.expected_words})
it('reuses existing IDs without losing initial Latin letters or shipping HTML',()=>{
  const old=[{id:'en:x-ray',language:'en',term:'x-ray',partOfSpeech:'n.',meaningZh:'X光照片',category:'高考 3500',examples:[]}]
  const {bundle}=normalizePrimaryDataset(fixture(),old,{}, {expectedCount:1})
  expect(bundle.words).toHaveLength(1)
  expect(bundle.books[1].members[0].wordId).toBe('en:x-ray')
  expect(bundle.words[0].senses.some(s=>s.meaningZh==='X光照片')).toBe(true)
  expect(JSON.stringify(bundle)).not.toMatch(/raw_html|doNotImport|<script/)
})
it.each(['schema','word','definition','books','unknown','examples','audio','duplicate'])('rejects invalid %s',kind=>{
  const d=fixture(),w=d.entries[0]
  if(kind==='schema')w.schema_version=2
  if(kind==='word')w.word=''
  if(kind==='definition')w.definition=''
  if(kind==='books')w.books=[]
  if(kind==='unknown')w.books=['不存在的册']
  if(kind==='examples')w.sections=[{title:'同近义词辨析',text:'hello\n你好'}]
  if(kind==='audio')w.pronunciations=[{text:'美 [a]',audio_url:'http://example.com/a.mp3'}]
  if(kind==='duplicate'){d.entries.push({...w,word:' x-RAY '});d.expected_words=d.downloaded_words=2}
  expect(()=>normalize(d)).toThrow()
})
it('rejects dangling catalog references and unreviewed editorial overrides',()=>{
  const {bundle}=normalize(fixture());bundle.books[1].members[0].wordId='missing'
  expect(()=>validatePrimaryBundle(bundle)).toThrow()
  expect(()=>normalizePrimaryDataset(fixture(),[],{'x-ray':{definition:'n. 医学'}},{expectedCount:1})).toThrow(/review/i)
})
