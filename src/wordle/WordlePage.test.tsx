import { afterEach, expect, it } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { DEFAULT_SETTINGS, PalabraStorage } from '../data/storage'
import { acceptGuess, createGame } from './rules'
import type { WordleGame } from './types'
import type { VocabularyEntry } from '../types'
const word=(term:string):VocabularyEntry=>({id:`en:${term}`,language:'en',term,partOfSpeech:'n.',meaningZh:term==='apple'?'苹果':'葡萄',category:'测试',examples:[]})
const words=[word('apple'),word('grape'),word('wreck'),word('means'),word('build'),word('level'),word('there')]
const stores:PalabraStorage[]=[]
it('activates focused letter and delete buttons with Enter',async()=>{
  const user=userEvent.setup();await mount()
  const input=await screen.findByRole('textbox',{name:'输入五字母单词'})
  screen.getByRole('button',{name:'输入 A'}).focus()
  await user.keyboard('{Enter}')
  expect(input).toHaveValue('a')
  screen.getByRole('button',{name:'删除字母'}).focus()
  await user.keyboard('{Enter}')
  expect(input).toHaveValue('')
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
})
afterEach(()=>{cleanup();stores.splice(0).forEach(s=>s.close())})
async function mount(path='/wordle',language:'en'|'es'='en',saved?:WordleGame){
  const db=new PalabraStorage(`wordle-ui-${crypto.randomUUID()}`,{vocabularySeeds:{en:words}});stores.push(db)
  await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:language})
  await db.saveWordleGame({...saved??createGame([words[0]]),revision:0},undefined)
  render(<MemoryRouter initialEntries={[path]}><App storageClient={db}/></MemoryRouter>);return db
}
it('replaces old English definitions with ECDICT Chinese on restored guesses',async()=>{
  const saved=acceptGuess(createGame([words[0]]),{term:'quaff',source:'wiktionary',definitions:[{partOfSpeech:'Verb',text:'To drink deeply.'}]})
  await mount('/wordle','en',saved)
  const region=await screen.findByRole('region',{name:'猜测词释义'})
  expect(region).toHaveTextContent('狂饮')
  expect(region).not.toHaveTextContent('To drink deeply')
  expect(within(region).getByRole('link',{name:/ECDICT/})).toBeInTheDocument()
})
it('hides English fallback definitions for old guesses without a Chinese entry',async()=>{
  const saved=acceptGuess(createGame([words[0]]),{term:'xyzzz',source:'wiktionary',definitions:[{partOfSpeech:'Noun',text:'English placeholder definition.'}]})
  await mount('/wordle','en',saved)
  const region=await screen.findByRole('region',{name:'猜测词释义'})
  expect(region).toHaveTextContent('暂无中文释义')
  expect(region).not.toHaveTextContent('English placeholder')
})
it('opens Wordle from English home, hides normal navigation and never reveals the answer initially',async()=>{
  const user=userEvent.setup();await mount('/today')
  await user.click(await screen.findByRole('link',{name:/Wordle 猜词/}))
  expect(await screen.findByRole('heading',{name:'Wordle'})).toBeInTheDocument()
  await screen.findByRole('textbox',{name:'输入五字母单词'})
  expect(screen.queryByRole('navigation',{name:'主导航'})).not.toBeInTheDocument()
  expect(screen.queryByText('苹果')).not.toBeInTheDocument()
})
it('accepts screen keys and pasted input, shows word details and restores the game after reload',async()=>{
  const user=userEvent.setup();const db=await mount()
  await screen.findByRole('textbox',{name:'输入五字母单词'})
  for(const letter of ['G','R','A','P','E'])await user.click(screen.getByRole('button',{name:`输入 ${letter}`}))
  await user.click(screen.getByRole('button',{name:'提交猜测'}))
  expect(await screen.findByRole('heading',{name:'grape'})).toBeInTheDocument()
  expect(screen.getByText('葡萄')).toBeInTheDocument()
  const input=screen.getByRole('textbox',{name:'输入五字母单词'})
  fireEvent.paste(input,{clipboardData:{getData:()=> 'APPLE'}})
  await user.click(screen.getByRole('button',{name:'提交猜测'}))
  expect(await screen.findByText('猜对了！')).toBeInTheDocument()
  cleanup();render(<MemoryRouter initialEntries={['/wordle']}><App storageClient={db}/></MemoryRouter>)
  expect(await screen.findByText('猜对了！')).toBeInTheDocument()
  await user.click(screen.getByRole('button',{name:'再来一局'}))
  await waitFor(()=>expect(screen.queryByText('猜对了！')).not.toBeInTheDocument())
  expect((await db.getWordleGame())?.answer.term).not.toBe('apple')
})
it('handles physical keyboard, invalid/duplicate input and clicking previous rows',async()=>{
  const user=userEvent.setup();const db=await mount()
  await screen.findByRole('textbox',{name:'输入五字母单词'})
  await user.keyboard('gra{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('五个')
  await user.keyboard('pe{Enter}')
  await screen.findByRole('heading',{name:'grape'})
  await user.keyboard('grape{Enter}')
  expect(await screen.findByRole('alert')).toHaveTextContent('已经猜过')
  expect((await db.getWordleGame())?.guesses).toHaveLength(1)
  await user.click(screen.getByRole('button',{name:/查看第 1 次猜测/}))
  expect(screen.getByRole('heading',{name:'grape'})).toBeInTheDocument()
})
it('reveals the answer after six misses and leaves the selected learning language unchanged',async()=>{
  const user=userEvent.setup();const db=await mount('/wordle','es')
  await screen.findByRole('textbox',{name:'输入五字母单词'})
  for(const term of ['grape','wreck','means','build','level','there']){
    fireEvent.change(screen.getByRole('textbox',{name:'输入五字母单词'}),{target:{value:term}})
    await user.click(screen.getByRole('button',{name:'提交猜测'}))
    await screen.findByRole('heading',{name:term})
  }
  expect(await screen.findByText('这次的答案')).toBeInTheDocument()
  expect(screen.getByRole('region',{name:'游戏结果'})).toHaveTextContent('苹果')
  expect((await db.getSettings()).learningLanguage).toBe('es')
  expect(screen.getByRole('button',{name:'提交猜测'})).toBeDisabled()
})
