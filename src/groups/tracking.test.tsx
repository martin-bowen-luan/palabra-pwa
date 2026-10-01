import { afterEach,describe,it,expect } from 'vitest'
import { act,cleanup,render,waitFor } from '@testing-library/react'
import { AppStateProvider,useAppState } from '../app/AppState'
import { SpanishProvider,useSpanish } from '../spanish/SpanishProvider'
import { spanishFixture } from '../spanish/fixtures'
import { DEFAULT_SETTINGS,PalabraStorage } from '../data/storage'
import { createPracticeQueue } from '../domain/practiceQueue'
import type { ActiveSession,VocabularyEntry } from '../types'
let app:ReturnType<typeof useAppState>,spanish:ReturnType<typeof useSpanish>
function Probe(){app=useAppState();spanish=useSpanish();return null}
const words:VocabularyEntry[]=['apple','pear'].map(term=>({id:`en:${term}`,language:'en',term,partOfSpeech:'n.',meaningZh:term==='apple'?'苹果':'梨',category:'test',examples:[]}))
const clients:PalabraStorage[]=[]
afterEach(()=>{cleanup();clients.splice(0).forEach(db=>db.close())})
async function mount(language:'en'|'es'='en',round:ActiveSession['memoryRound']='spelling',ids=words.map(w=>w.id),legacy=false){
  const db=new PalabraStorage(crypto.randomUUID(),{vocabularySeeds:{en:words,es:[spanishFixture()]}});clients.push(db)
  await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:language})
  await db.saveGroupBinding({profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:new Date(Date.now()-10000).toISOString(),enabled:true})
  if(language==='en'||legacy)await db.saveActiveSession({id:`active-session:${language}`,language,mode:'learn',memoryRound:legacy?undefined:round,wordIds:ids,newWordIds:ids,reviewWordIds:[],phase:'quiz',currentIndex:0,correctCount:0,answeredCount:0,startedAt:new Date().toISOString(),practice:createPracticeQueue(ids)})
  render(<AppStateProvider storageClient={db}><SpanishProvider storageClient={db}><Probe/></SpanishProvider></AppStateProvider>)
  await waitFor(()=>expect(app.ready).toBe(true));return db
}
async function answer(){await act(()=>app.submitQuizAnswer(true,'answer'));await act(()=>app.completeQuizItem().then(()=>undefined))}
describe('real study commits drive group summaries',()=>{
  it('tracks actual legacy Spanish answers without uploading preexisting history',async()=>{
    const db=await mount('es',undefined,[spanishFixture().id],true)
    expect(await db.getGroupOutbox()).toEqual([])
    await act(()=>app.submitQuizAnswer(true,'hablo'))
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({language:'es',newCount:1})
  })
  it('counts only the fourth completed English round, including the final word',async()=>{
    const db=await mount('en','choice',['en:apple'])
    for(let i=0;i<3;i++){await answer();expect(await db.getGroupOutbox()).toEqual([])}
    expect(app.activeSession?.memoryRound).toBe('spelling')
    await answer();expect(app.activeSession).toBeUndefined()
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({language:'en',newCount:1,reviewCount:0})
  })
  it('saves a half-group immediately, while fluent adds nothing',async()=>{
    const db=await mount();await answer()
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({newCount:1})
    await act(()=>app.markCurrentWordFluent().then(()=>undefined))
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({newCount:1})
  })
  it('tracks explicit skips but not hinted answers still awaiting recall',async()=>{
    const db=await mount()
    await act(()=>app.revealSpellingLetter());await answer()
    expect(await db.getGroupOutbox()).toEqual([])
    await act(()=>app.skipSpellingWord().then(()=>undefined))
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({newCount:1,skippedCount:1})
  })
  it('Spanish draft and hint do not count; reveal counts once and later correct recall updates',async()=>{
    const db=await mount('es');await act(()=>spanish.start().then(()=>undefined))
    await act(async()=>{spanish.draft('hab');await spanish.flush()});await act(()=>spanish.hint())
    expect(await db.getGroupOutbox()).toEqual([])
    await act(()=>spanish.reveal('hab'))
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({language:'es',newCount:1,goal:50})
    await act(()=>spanish.next().then(()=>undefined));await act(()=>spanish.submit('hablo'))
    expect((await db.getGroupOutbox())[0]?.payload).toMatchObject({newCount:1,reviewCount:0})
  })
  it('Spanish fluent does not count actual practice',async()=>{
    const db=await mount('es');await act(()=>spanish.start().then(()=>undefined));await act(()=>spanish.fluent().then(()=>undefined))
    expect(await db.getGroupOutbox()).toEqual([])
  })
})
