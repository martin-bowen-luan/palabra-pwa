import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { cleanText,termKey,exampleKey,definitionSenses,bilingualSenses,bilingualExamples,pronunciation } from './lib/english-record-fields.mjs'
import { parseSpecialForms,parseRelatedTerms } from './import-english-vocabulary.mjs'
const unique=(items,key)=>[...new Map(items.map(item=>[key(item),item])).values()]
export function normalizePrimaryDataset(dataset,highschoolWords,editorial,options={}) {
  const expected=options.expectedCount??1047
  if(!Array.isArray(dataset.entries)||dataset.entries.length!==expected||dataset.expected_words!==expected||dataset.downloaded_words!==expected)throw new Error(`Expected ${expected} primary entries`)
  const books=new Map((dataset.source_books??[]).map(book=>{
    const match=book.name.match(/^小学牛津版([一二三四五六])年级\s*([上下])学期$/u)
    if(!match)throw new Error(`Unknown book ${book.name}`)
    const grade='一二三四五六'.indexOf(match[1])+1,semester=match[2]==='上'?1:2
    return [book.name,{sourceBookId:`oxford-g${grade}-s${semester}`,grade,semester}]
  }))
  const words=structuredClone(highschoolWords),byTerm=new Map(words.map(w=>[termKey(w.term),w])),seen=new Set(),members=[],gaps=[],warnings=[]
  let overlap=0
  for(const [index,record] of dataset.entries.entries()) {
    const key=termKey(record.word),edit=editorial[key]
    if(record.schema_version!==3||!key)throw new Error(`Invalid schema or word at ${index}`)
    if(seen.has(key))throw new Error(`Duplicate term ${key}`)
    seen.add(key)
    if(edit&&edit.reviewed!==true)throw new Error(`Editorial review required: ${key}`)
    if(!record.books?.length)throw new Error(`Missing books: ${key}`)
    const memberships=record.books.map(name=>{if(!books.has(name))throw new Error(`Unknown book: ${name}`);return books.get(name)})
    const source={provider:'新东方在线词典',url:cleanText(record.detail_url),fetchedAt:record.fetched_at}
    if(!source.url.startsWith('https://'))throw new Error(`Missing HTTPS source: ${key}`)
    const definition=edit?.definition??record.definition
    let senses=definitionSenses(definition)
    if(!senses.length)senses=bilingualSenses(record.sections)
    senses=senses.map((s,i)=>({...s,id:`primary:${key}:${i}`,source:edit?.definition?{provider:'编辑核验',url:edit.definitionSource}:source}))
    let examples=edit?.example?[{text:edit.example[0],translationZh:edit.example[1],sourceId:`editorial:primary:${key}`,author:'Palabra 编辑补充'}]:bilingualExamples(record.sections).filter((_,i)=>!edit?.exampleIndices||edit.exampleIndices.includes(i)).map(e=>({...e,sourceUrl:source.url}))
    if(!senses.some(s=>/[\u3400-\u9fff]/u.test(s.meaningZh)))gaps.push({word:key,field:'definition'})
    if(!examples.length)gaps.push({word:key,field:'examples'})
    if(examples.some(e=>e.text.length<15||e.translationZh.length<5||!termKey(e.text).includes(key)))warnings.push({word:key,examples})
    const sound=pronunciation(record.pronunciations)
    const existing=byTerm.get(key)
    const fresh={id:existing?.id??`en:${key}`,language:'en',term:cleanText(record.word),partOfSpeech:senses[0]?.partOfSpeech??'',meaningZh:senses.slice(0,3).map(s=>s.meaningZh).join('；'),category:'小学必背单词（牛津版）',examples,pronunciation:sound,source,specialForms:parseSpecialForms(record.sections??[],key),relatedTerms:parseRelatedTerms(record.sections??[],key)}
    const word=existing??fresh
    if(existing)overlap++
    else {words.push(word);byTerm.set(key,word)}
    word.senses=unique([...(word.senses??[]),...senses],s=>`${s.partOfSpeech}:${s.meaningZh}`)
    // Canonical display stays stable; book projections select their own audited examples.
    word.examples=unique([...word.examples,...examples],exampleKey)
    word.sources=unique([...(word.sources??[]),...(word.source?[word.source]:[]),source],s=>s.url)
    if(!word.pronunciation)word.pronunciation=sound
    members.push({wordId:word.id,order:index,memberships,displayTerm:cleanText(record.word),senseIds:senses.map(s=>word.senses.find(x=>x.partOfSpeech===s.partOfSpeech&&x.meaningZh===s.meaningZh).id),exampleKeys:examples.map(exampleKey)})
  }
  if(gaps.length){const error=new Error(`Primary quality gaps: ${JSON.stringify(gaps)}`);error.gaps=gaps;throw error}
  const rank=m=>Math.min(...m.memberships.map(x=>x.grade*2+x.semester))
  members.sort((a,b)=>rank(a)-rank(b)||a.order-b.order).forEach((m,i)=>m.order=i)
  const bundle={revision:5,words,books:[{id:'en-highschool',language:'en',title:'高考 3500',revision:1,members:highschoolWords.map((w,order)=>({wordId:w.id,order,memberships:[]}))},{id:'en-oxford-primary',language:'en',title:'小学必背单词（牛津版）',revision:1,members}]}
  validatePrimaryBundle(bundle)
  return {bundle,report:{primaryCount:members.length,publicCount:words.length,overlap,newCount:members.length-overlap,membershipCount:members.reduce((n,m)=>n+m.memberships.length,0),sourceBookCount:books.size,editorialWords:Object.keys(editorial),warnings,gaps,reviewScope:'所有记录自动检查；补充及标记项逐项审核，各册抽查；未逐句人工审校全库。',sourceGeneratedAt:dataset.generated_at}}
}
export function validatePrimaryBundle(bundle) {
  const ids=new Set(bundle.words.map(w=>w.id))
  if(ids.size!==bundle.words.length)throw new Error('Duplicate dictionary IDs')
  for(const book of bundle.books) {
    if(new Set(book.members.map(m=>m.wordId)).size!==book.members.length)throw new Error('Duplicate membership')
    for(const member of book.members) {
      const word=bundle.words.find(w=>w.id===member.wordId)
      if(!word)throw new Error(`Dangling word ${member.wordId}`)
      if(member.senseIds?.some(id=>!word.senses?.some(s=>s.id===id)))throw new Error('Dangling sense')
      if(member.exampleKeys?.some(key=>!word.examples.some(e=>exampleKey(e)===key)))throw new Error('Dangling example')
    }
  }
  if(/raw_html|main_html|sidebar_html|<script|<aside/iu.test(JSON.stringify(bundle)))throw new Error('HTML leaked')
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  const args=process.argv.slice(2),option=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1]}
  try {
    const out=option('--out','src/data/english-wordbooks.json')
    if(args.includes('--check')) {
      const bundle=JSON.parse(await readFile(out,'utf8'));validatePrimaryBundle(bundle)
      const primary=bundle.books.find(b=>b.id==='en-oxford-primary')
      if(bundle.words.length!==3707||primary?.members.length!==1047)throw new Error('Production counts mismatch')
      console.log('Shared wordbook references and 3,707 / 1,047 counts verified')
    } else {
      const input=option('--source');if(!input)throw new Error('Provide --source PATH')
      const dataset=JSON.parse(await readFile(input,'utf8'))
      const old=JSON.parse(await readFile('src/data/vocabulary-en.json','utf8')),editorial=JSON.parse(await readFile('src/data/primary-editorial.json','utf8'))
      const {bundle,report}=normalizePrimaryDataset(dataset,old,editorial)
      await writeFile(out,JSON.stringify(bundle)+'\n');await writeFile(option('--report','docs/primary-vocabulary-report.json'),JSON.stringify(report,null,2)+'\n')
      console.log(JSON.stringify({...report,warnings:report.warnings.length}))
    }
  } catch(error) {console.error(error.message);process.exitCode=1}
}
