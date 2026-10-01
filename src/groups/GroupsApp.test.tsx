import { afterEach,it,expect,vi } from 'vitest'
import { cleanup,render,screen,within,waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { GroupsProvider } from './GroupsProvider'
import { GroupsPage } from './GroupsPage'
import { PalabraStorage } from '../data/storage'
import type { GroupService, RpcName } from './client'
import type { GroupActivity,GroupData,GroupProfile,RpcResult } from './types'
import { groupDate } from './projection'
import { SecretCode } from './IdentityPanel'
const date=groupDate(new Date().toISOString()),at=new Date().toISOString()
const binding={profileId:'p',groupId:'g',membershipId:'m',membershipGeneration:1,deviceGeneration:1,joinedAt:at,enabled:true}
const profile:GroupProfile={profileId:'p',nickname:'我',deviceGeneration:1,receiveNudges:true,binding}
const group:GroupData={group:{id:'g',name:'一起记住',ownerId:'q'},binding,memberProfiles:[{id:'p',nickname:'我',receiveNudges:true,joinedAt:at},{id:'q',nickname:'<img src=x onerror=alert(1)>',receiveNudges:true,joinedAt:at}]}
const activity:GroupActivity={serverTime:at,notes:[{profileId:'q',date,text:'<script>加油</script>',version:1,deviceGeneration:1,syncedAt:at}],nudges:[],summaries:[
  {profileId:'q',date,language:'en',goal:10,newCount:5,reviewCount:20,skippedCount:1,conservative:true,lastPracticedAt:at,syncedAt:at},
  {profileId:'q',date,language:'es',goal:50,newCount:10,reviewCount:15,skippedCount:0,conservative:false,lastPracticedAt:at,syncedAt:at},
]}
const dbs:PalabraStorage[]=[]
afterEach(()=>{cleanup();dbs.splice(0).forEach(db=>db.close());vi.restoreAllMocks()})
async function mount(consent=true,offline=false){
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);let authCalls=0
  if(consent){await db.groups.write('groupState','consent',true);await db.saveGroupBinding(binding);await db.groups.write('groupCache','snapshot',{profile,group,activity,cachedAt:at})}
  if(offline)vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
  const remote:GroupService={uid:async()=>'uid',authenticate:async()=>{authCalls++;return'uid'},stop:()=>{},summary:async()=>({ok:true,data:{acceptedVersion:1}}),note:async()=>({ok:true,data:{acceptedVersion:1}}),
    rpc:async<T,>(name:RpcName)=>({ok:true,data:name==='self'?profile:name==='group'?group:activity} as RpcResult<T>),
  }
  const view=render(<MemoryRouter initialEntries={['/groups']}><GroupsProvider storageClient={db} remote={remote}><GroupsPage/></GroupsProvider></MemoryRouter>)
  await screen.findByRole('heading',{name:consent?'一起记住':'好友小组'})
  return{db,view,authCalls:()=>authCalls,user:userEvent.setup()}
}
it('shows privacy and requires explicit consent before creating an identity',async()=>{
  const {authCalls}=await mount(false)
  expect(screen.getByText(/不上传具体单词/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'建立身份'})).toBeDisabled()
  expect(authCalls()).toBe(0)
})
it('renders member text safely, separate language goals and honest empty state',async()=>{
  const {view}=await mount()
  expect(await screen.findByText('<script>加油</script>')).toBeInTheDocument()
  expect(view.container.querySelector('img,script')).toBeNull()
  expect(screen.getByText(/今天更换设备/)).toBeInTheDocument()
  expect(screen.getAllByText('50%')).toHaveLength(2)
  expect(screen.getAllByText('今日尚未同步')).toHaveLength(2)
  expect(screen.queryByRole('button',{name:'解散小组'})).not.toBeInTheDocument()
})
it('keeps offline drafts private until explicit publish and disables nudges',async()=>{
  const {db,user}=await mount(true,true)
  expect(screen.getByText(/离线显示/)).toBeInTheDocument()
  expect(screen.getByRole('button',{name:'提醒学习'})).toBeDisabled()
  await user.type(screen.getByRole('textbox',{name:'今天的一句话'}),'今天继续')
  await waitFor(async()=>expect(await db.groups.read('groupDrafts',date)).toBe('今天继续'))
  expect(await db.getGroupOutbox()).toEqual([])
  await user.click(screen.getByRole('button',{name:'发布'}))
  expect(await screen.findByText(/待同步 1 条/)).toBeInTheDocument()
  expect((await db.getGroupOutbox())[0]).toMatchObject({kind:'note',payload:{text:'今天继续'}})
})
it('requires explicit confirmation before leaving a group',async()=>{
  const {user}=await mount()
  await user.click(screen.getByText('小组管理'))
  await user.click(screen.getByRole('button',{name:'离开小组'}))
  expect(within(screen.getByRole('region',{name:'确认操作'})).getByRole('button',{name:'确认离开小组'})).toBeInTheDocument()
})
it('does not claim that a recovery code was copied when clipboard access fails',async()=>{
  const user=userEvent.setup()
  vi.spyOn(navigator.clipboard,'writeText').mockRejectedValue(new Error('denied'))
  render(<SecretCode value={'a'.repeat(64)} label="恢复码"/>)
  await user.click(screen.getByRole('button',{name:'复制恢复码'}))
  expect(await screen.findByText(/未能复制/)).toBeInTheDocument()
  expect(screen.queryByText(/已复制/)).not.toBeInTheDocument()
})
