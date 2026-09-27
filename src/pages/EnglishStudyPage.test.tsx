import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { DEFAULT_SETTINGS, PalabraStorage } from '../data/storage'
import { advancePractice, createPracticeQueue } from '../domain/practiceQueue'
import type { MemoryRound, VocabularyEntry } from '../types'

const words:VocabularyEntry[]=[
  {id:'en:soluble',language:'en',term:'soluble',partOfSpeech:'adj.',meaningZh:'[化] 可溶的',category:'测试',examples:[]},
  {id:'en:table',language:'en',term:'table',partOfSpeech:'n.',meaningZh:'桌子',category:'测试',examples:[]},
]
const stores:PalabraStorage[]=[]
afterEach(()=>{cleanup();stores.splice(0).forEach(s=>s.close());vi.restoreAllMocks()})
const mount=(db:PalabraStorage)=>render(<MemoryRouter initialEntries={['/study']}><App storageClient={db}/></MemoryRouter>)
async function setup(round:MemoryRound='spelling'){
  const db=new PalabraStorage(`hints-${crypto.randomUUID()}`,{vocabularySeeds:{en:words}});stores.push(db)
  await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:'en'})
  await db.saveActiveSession({id:'active-session:en',language:'en',mode:'learn',memoryRound:round,wordIds:words.map(w=>w.id),newWordIds:words.map(w=>w.id),reviewWordIds:[],phase:'quiz',currentIndex:0,correctCount:0,answeredCount:0,startedAt:new Date().toISOString(),practice:createPracticeQueue(words.map(w=>w.id))})
  mount(db);await screen.findByRole('button',{name:'结束'});return db
}
it('shows the separated first part of speech in the spelling prompt and both choice comparisons',async()=>{
  const user=userEvent.setup();const db=await setup()
  expect(screen.getByRole('heading',{level:1})).toHaveTextContent('adj. [化] 可溶的')
  cleanup()
  const session=(await db.getActiveSession('en'))!
  await db.saveActiveSession({...session,memoryRound:'choice',quizFeedback:{wordId:words[0].id,correct:false,selected:'桌子',selectedWordId:words[1].id,nextPractice:createPracticeQueue(words.map(w=>w.id))}})
  mount(db)
  const comparison=await screen.findByRole('region',{name:'释义错误对比'})
  expect(comparison).toHaveTextContent('n. 桌子')
  expect(comparison).toHaveTextContent('adj. [化] 可溶的')
  await user.click(screen.getByRole('button',{name:'立即重做'}))
})
it('caps hints, keeps input untouched, restores hint use, and requires a later unassisted spelling',async()=>{
  const user=userEvent.setup();const db=await setup()
  const input=screen.getByRole('textbox',{name:'英语'})
  await user.type(input,'so')
  const hint=screen.getByRole('button',{name:'提示字母'})
  expect(screen.getByLabelText('字母提示')).toBeEmptyDOMElement()
  await user.click(hint)
  expect(screen.getByLabelText('字母提示')).toHaveTextContent('s______')
  await user.click(hint);await user.click(hint)
  expect(screen.getByLabelText('字母提示')).toHaveTextContent('sol____')
  expect(hint).toBeDisabled();expect(input).toHaveValue('so')
  cleanup();mount(db)
  expect(await screen.findByLabelText('字母提示')).toHaveTextContent('sol____')
  await user.type(screen.getByRole('textbox',{name:'英语'}),'soluble')
  await user.click(screen.getByRole('button',{name:'检查答案'}))
  expect(await screen.findByText(/用过提示，稍后再无提示拼写一次/)).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'继续'}))
  expect(await screen.findByRole('heading',{name:'n. 桌子'})).toBeInTheDocument()
  expect(screen.getByLabelText('字母提示')).toBeEmptyDOMElement()
  await user.type(screen.getByRole('textbox',{name:'英语'}),'table')
  await user.click(screen.getByRole('button',{name:'检查答案'}));await user.click(await screen.findByRole('button',{name:'继续'}))
  expect(await screen.findByRole('heading',{name:'adj. [化] 可溶的'})).toBeInTheDocument()
  expect(screen.getByLabelText('字母提示')).toBeEmptyDOMElement()
  await user.type(screen.getByRole('textbox',{name:'英语'}),'soluble')
  await user.click(screen.getByRole('button',{name:'检查答案'}));await user.click(await screen.findByRole('button',{name:'继续'}))
  expect(await db.getActiveSession('en')).toBeUndefined()
  expect((await db.getSessions('en'))[0]).toMatchObject({totalCount:2,correctCount:1})
})
it('hides hints on immediate retry and retains skip priority',async()=>{
  const user=userEvent.setup();const db=await setup()
  await user.click(screen.getByRole('button',{name:'提示字母'}))
  await user.type(screen.getByRole('textbox',{name:'英语'}),'solubl')
  await user.click(screen.getByRole('button',{name:'检查答案'}))
  await user.click(await screen.findByRole('button',{name:'立即重做'}))
  expect(screen.getByLabelText('字母提示')).toBeEmptyDOMElement()
  await user.click(screen.getByRole('button',{name:'跳过，稍后优先复习'}))
  expect(await screen.findByRole('heading',{name:'n. 桌子'})).toBeInTheDocument()
  expect((await db.getAllProgress('en')).find(p=>p.wordId===words[0].id)?.reviewPriority).toBe('skipped')
})
it('does not reveal a hint if saving its assisted state fails',async()=>{
  const user=userEvent.setup();const db=await setup()
  vi.spyOn(db,'commitStudyStep').mockRejectedValueOnce(new Error('quota'))
  await user.click(screen.getByRole('button',{name:'提示字母'}))
  expect(await screen.findByRole('alert')).toHaveTextContent('未能保存')
  expect(screen.getByLabelText('字母提示')).toBeEmptyDOMElement()
})
it('does not overwrite another tab answer with a stale hint request',async()=>{
  const user=userEvent.setup();const db=await setup()
  const session=(await db.getActiveSession('en'))!
  await db.commitStudyStep(undefined,{...session,revision:(session.revision??0)+1,quizFeedback:{wordId:words[0].id,correct:true,selected:'soluble',nextPractice:advancePractice(session.practice!,true)}})
  await user.click(screen.getByRole('button',{name:'提示字母'}))
  expect(await screen.findByRole('button',{name:'继续'})).toBeInTheDocument()
  expect((await db.getActiveSession('en'))?.spellingHint).toBeUndefined()
})
it('recovers another tab hint before accepting a stale unassisted answer',async()=>{
  const user=userEvent.setup();const db=await setup()
  const session=(await db.getActiveSession('en'))!
  await db.commitStudyStep(undefined,{...session,revision:(session.revision??0)+1,spellingHint:{wordId:words[0].id,promptNumber:0,revealedCount:1}})
  await user.type(screen.getByRole('textbox',{name:'英语'}),'soluble')
  await user.click(screen.getByRole('button',{name:'检查答案'}))
  expect(screen.getByLabelText('字母提示')).toHaveTextContent('s______')
  expect((await db.getActiveSession('en'))?.quizFeedback).toBeUndefined()
  await user.click(screen.getByRole('button',{name:'检查答案'}))
  expect(await screen.findByText(/用过提示，稍后再无提示拼写一次/)).toBeInTheDocument()
  expect((await db.getActiveSession('en'))?.quizFeedback?.nextPractice.delayed).toEqual([{wordId:words[0].id,remaining:3}])
})
it('does not recreate a session removed by another tab when revealing a hint',async()=>{
  const user=userEvent.setup();const db=await setup()
  await db.clearActiveSession('en')
  await user.click(screen.getByRole('button',{name:'提示字母'}))
  expect(await screen.findByRole('heading',{name:'没有进行中的学习'})).toBeInTheDocument()
  expect(await db.getActiveSession('en')).toBeUndefined()
})
