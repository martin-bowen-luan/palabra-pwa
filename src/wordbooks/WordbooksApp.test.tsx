import { afterEach,it,expect,vi } from 'vitest'
import { render,screen,cleanup,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppStateProvider,useAppState } from '../app/AppState'
import { PalabraStorage,DEFAULT_SETTINGS } from '../data/storage'
import { bookFixture } from './fixtures'
import type { WordbookCatalog } from './types'
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
