import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { PalabraStorage, DEFAULT_SETTINGS } from '../data/storage'
import { AiService } from './service'
import { DEFAULT_AI_SETTINGS } from './types'
import type { ActiveSession, VocabularyEntry } from '../types'
import { createPracticeQueue } from '../domain/practiceQueue'
const cryptoModule = 'node:crypto'
const { webcrypto } = await import(/* @vite-ignore */ cryptoModule) as { webcrypto: Crypto }
const word: VocabularyEntry = {id:'en:happy',language:'en',term:'happy',meaningZh:'快乐的',partOfSpeech:'adj.',category:'测试',examples:[{text:'I am happy.',translationZh:'我很快乐。'}],derivedTerms:['happiness']}
const payload={derived:[{term:'happiness',partOfSpeech:'n.',meaningZh:'幸福',relationship:'由 happy 派生'},{term:'happily',partOfSpeech:'adv.',meaningZh:'快乐地',relationship:'副词形式'}],roots:[],synonyms:[],conflicts:[]}
const response=()=>new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{role:'assistant',content:JSON.stringify(payload)}}]}),{status:200})
const stores:PalabraStorage[]=[]
beforeEach(()=>vi.stubGlobal('crypto',webcrypto))
afterEach(()=>{cleanup();stores.splice(0).forEach(db=>db.close());vi.restoreAllMocks();vi.unstubAllGlobals()})
async function mount(path='/library', cached=false, round?: ActiveSession['memoryRound']) {
  const db=new PalabraStorage(`ai-ui-${crypto.randomUUID()}`,{vocabularySeeds:{en:[word]}});stores.push(db)
  await db.saveSettings({...DEFAULT_SETTINGS,learningLanguage:'en'})
  if(cached){const service=new AiService(db,async()=>response());await service.load();await service.configure({...DEFAULT_AI_SETTINGS,enabled:true,consentVersion:1,baseUrl:'https://example.test/v1',model:'test'},'fake-key','password123');await service.analyze(word);service.dispose()}
  if(round) await db.saveActiveSession({id:'active-session:en',language:'en',mode:'learn',memoryRound:round,wordIds:[word.id],newWordIds:[word.id],reviewWordIds:[],currentIndex:0,phase:'quiz',practice:createPracticeQueue([word.id]),correctCount:0,answeredCount:0,startedAt:new Date().toISOString(),revision:0})
  render(<MemoryRouter initialEntries={[path]}><App storageClient={db}/></MemoryRouter>);return db
}
describe('optional AI integration',()=>{
  it('configures encrypted credentials, locks and unlocks entirely through the settings UI',async()=>{
    const user=userEvent.setup(); const db=await mount('/settings')
    await user.click(await screen.findByRole('checkbox',{name:/我已了解/}))
    await user.click(screen.getByRole('checkbox',{name:'启用 AI 词汇分析'}))
    await user.selectOptions(await screen.findByLabelText('服务商'),'custom')
    await user.type(screen.getByLabelText('API 地址（Base URL）'),'https://example.test/v1')
    await user.type(screen.getByLabelText('模型名'),'test-model')
    await user.type(screen.getByLabelText('API 密钥'),'fake-ui-key')
    await user.type(screen.getByLabelText('本地加密密码'),'password123')
    await user.click(screen.getByRole('checkbox',{name:/确认仅向此地址/}))
    await user.click(screen.getByRole('button',{name:'加密保存并解锁'}))
    await user.click(await screen.findByRole('button',{name:'锁定密钥'}))
    expect(JSON.stringify(await db.getAiConfiguration())).not.toMatch(/fake-ui-key|password123/)
    await user.type(screen.getByLabelText('解锁密码'),'password123')
    await user.click(screen.getByRole('button',{name:'解锁密钥'}))
    expect(await screen.findByRole('button',{name:'锁定密钥'})).toBeInTheDocument()
  })
  it.each(['choice','context','recall','spelling'] as const)('does not reveal cached AI before answering the %s round',async round=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response());vi.stubGlobal('fetch',fetcher)
    const user=userEvent.setup(); await mount('/study',true,round)
    await screen.findByText(/第 \d 关/)
    expect(screen.queryByText('happily',{exact:true})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'删除此词 AI 分析'})).not.toBeInTheDocument()
    if(round==='context') expect(screen.getByRole('button',{name:'朗读英文例句'})).toBeInTheDocument()
    else expect(screen.queryByRole('button',{name:'朗读英文例句'})).not.toBeInTheDocument()
    if(round==='context'||round==='recall') {
      await user.click(screen.getByRole('button',{name:'认识'}))
      expect(await screen.findByText('happily',{exact:true})).toBeInTheDocument()
    }
    expect(fetcher).not.toHaveBeenCalled()
  })
  it('defaults off and requires consent before enabling, without affecting original word data',async()=>{
    const user=userEvent.setup();await mount('/settings')
    const toggle=await screen.findByRole('checkbox',{name:'启用 AI 词汇分析'});expect(toggle).not.toBeChecked()
    await user.click(toggle);expect(await screen.findByRole('alert')).toHaveTextContent('同意')
    await user.click(screen.getByRole('checkbox',{name:/我已了解/}));await user.click(toggle)
    await waitFor(()=>expect(toggle).toBeChecked())
    await user.click(screen.getByRole('link',{name:'词库'}));await user.click(await screen.findByRole('button',{name:/happy/}))
    expect(await screen.findByText('happiness',{exact:true})).toBeInTheDocument()
    expect(await screen.findByText(/请先在设置中配置模型/)).toBeInTheDocument()
  })
  it('preserves the unfinished model form when returning from another browser window',async()=>{
    const user=userEvent.setup(); await mount('/settings',true)
    await user.click(await screen.findByText('修改模型配置'))
    const model=screen.getByLabelText('模型名')
    await user.clear(model); await user.type(model,'unsaved-model')
    window.dispatchEvent(new Event('focus'))
    await new Promise(resolve=>setTimeout(resolve,30))
    expect(model).toHaveValue('unsaved-model')
  })
  it('keeps this cached word visible when another tab deletes a different word',async()=>{
    const user=userEvent.setup(); const db=await mount('/library',true)
    await user.click(await screen.findByRole('button',{name:/happy/}))
    expect(await screen.findByText('happily',{exact:true})).toBeInTheDocument()
    const other=new AiService(db); await other.load()
    await other.clearAnalyses('en:other-word')
    await new Promise(resolve=>setTimeout(resolve,30))
    expect(screen.getByText('happily',{exact:true})).toBeInTheDocument()
    other.dispose()
  })
  it('merges cached AI data while locked and lets deletion suppress immediate regeneration',async()=>{
    const fetcher=vi.fn<typeof fetch>().mockResolvedValue(response());vi.stubGlobal('fetch',fetcher)
    const user=userEvent.setup();const db=await mount('/library',true)
    await user.click(await screen.findByRole('button',{name:/happy/}))
    expect(await screen.findByText('happily',{exact:true})).toBeInTheDocument()
    expect(screen.getAllByText('happiness',{exact:true})).toHaveLength(1)
    expect(screen.getByRole('button',{name:'朗读英文例句'})).toBeInTheDocument()
    await user.click(screen.getByRole('button',{name:'删除此词 AI 分析'}))
    await waitFor(()=>expect(screen.queryByText('happily',{exact:true})).not.toBeInTheDocument())
    expect(screen.getByText('happiness',{exact:true})).toBeInTheDocument();expect(fetcher).not.toHaveBeenCalled()
    expect((await db.getVocabulary('en'))[0].derivedTerms).toEqual(['happiness'])
  })
  it('hides cached AI and sentence controls when the mode is turned off',async()=>{
    const user=userEvent.setup();await mount('/settings',true)
    await user.click(await screen.findByRole('checkbox',{name:'启用 AI 词汇分析'}))
    await user.click(screen.getByRole('link',{name:'词库'}));await user.click(await screen.findByRole('button',{name:/happy/}))
    expect(screen.queryByText('happily',{exact:true})).not.toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'朗读英文例句'})).not.toBeInTheDocument()
    expect(screen.getByText('happiness',{exact:true})).toBeInTheDocument()
  })
})
