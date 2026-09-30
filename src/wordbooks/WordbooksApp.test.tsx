import { afterEach,it,expect,vi } from 'vitest'
import { render,screen,cleanup,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppStateProvider,useAppState } from '../app/AppState'
import { PalabraStorage,DEFAULT_SETTINGS } from '../data/storage'
import { bookFixture } from './fixtures'
import type { WordbookCatalog } from './types'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
const clients:PalabraStorage[]=[]
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.close());vi.restoreAllMocks()})
function Harness(){const s=useAppState();return s.ready?<>
  <p data-testid="selected">{s.selectedWordbook?.id}</p><p data-testid="study">{s.studyVocabulary.map(w=>w.term).join(',')}</p>
  <p data-testid="browse">{s.bookVocabulary.map(w=>w.term).join(',')}</p>
  <button onClick={()=>void s.setEnglishWordbook('en-oxford-primary')}>小学</button>
  <button onClick={()=>void s.setEnglishWordbook('en-highschool')}>高考</button>
  <button onClick={()=>void s.startSession()}>开始</button>
</>:null}
async function setup(){const db=new PalabraStorage(crypto.randomUUID(),{wordbookBundle:bookFixture});clients.push(db);await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:'en'});render(<AppStateProvider storageClient={db}><Harness/></AppStateProvider>);await screen.findByText('高考');return db}
it('allows browsing another book without replacing the active group or its study candidates',async()=>{
  const db=await setup(),user=userEvent.setup()
  await user.click(screen.getByText('开始'))
  const before=await db.getActiveSession('en')
  await user.click(screen.getByText('小学'));await waitFor(()=>expect(screen.getByTestId('selected')).toHaveTextContent('en-oxford-primary'))
  expect(screen.getByTestId('browse')).toHaveTextContent('apple,pear')
  expect(screen.getByTestId('study')).toHaveTextContent('apple,peach')
  await user.click(screen.getByText('开始'))
  expect(await db.getActiveSession('en')).toEqual(before)
  expect(before?.sourceWordbook).toBe('en-highschool')
})
it('keeps the last requested selection in UI and storage when loads finish out of order',async()=>{
  const db=await setup(),user=userEvent.setup()
  let first!:(books:WordbookCatalog[])=>void
  vi.spyOn(db,'getWordbooks').mockImplementationOnce(()=>new Promise(resolve=>{first=resolve})).mockResolvedValue(bookFixture.books)
  await user.click(screen.getByText('小学'));await user.click(screen.getByText('高考'))
  first(bookFixture.books)
  await waitFor(()=>expect(screen.getByTestId('selected')).toHaveTextContent('en-highschool'))
  expect((await db.getSettings()).englishWordbook).toBe('en-highschool')
})
async function mountApp(path='/today') {
  const db=new PalabraStorage(crypto.randomUUID(),{wordbookBundle:bookFixture});clients.push(db)
  await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:'en'})
  await db.putProgress({wordId:'en:apple',language:'en',stage:6,status:'mastered',skipReview:true,nextReviewAt:'2099-01-01',lastReviewedAt:'2026-09-30',reviewCount:1,correctCount:1})
  render(<MemoryRouter initialEntries={[path]}><App storageClient={db}/></MemoryRouter>)
  return db
}
it('shows shared mastery in primary details and filters grades without changing the new-word range',async()=>{
  const db=await mountApp(),user=userEvent.setup()
  await user.click(await screen.findByRole('button',{name:'小学必背单词（牛津版）'}))
  expect(screen.getByRole('button',{name:'小学必背单词（牛津版）'})).toHaveAttribute('aria-pressed','true')
  await user.click(screen.getByRole('link',{name:'词库'}))
  await user.selectOptions(await screen.findByLabelText('浏览年级'),'2')
  expect(screen.queryByRole('button',{name:/^apple/})).not.toBeInTheDocument()
  expect(screen.getByRole('button',{name:/^pear/})).toBeInTheDocument()
  expect((await db.getSettings()).primaryNewWordRange).toEqual({})
  await user.selectOptions(screen.getByLabelText('浏览年级'),'')
  await user.click(screen.getByRole('button',{name:/^apple/}))
  expect(await screen.findByText('已标为熟练 · 无需复习')).toBeInTheDocument()
})
it('warns that clearing English resets both books and preserves records on cancel',async()=>{
  const db=await mountApp('/settings'),user=userEvent.setup()
  await user.click(await screen.findByRole('button',{name:'清空全部英语学习记录'}))
  expect(screen.getByText(/高考与小学共用记忆/)).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'取消'}))
  expect(await db.getAllProgress('en')).toHaveLength(1)
  await user.click(screen.getByRole('button',{name:'清空全部英语学习记录'}))
  await user.click(screen.getByRole('button',{name:'确认清空'}))
  await waitFor(async()=>expect(await db.getAllProgress('en')).toEqual([]))
  expect(await db.getWordbooks()).toHaveLength(2)
})
