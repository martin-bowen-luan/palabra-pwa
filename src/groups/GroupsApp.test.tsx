import { afterEach,it,expect,vi } from 'vitest'
import { cleanup,render,screen,within,waitFor,fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { GroupsProvider } from './GroupsProvider'
import { GroupsPage } from './GroupsPage'
import { PalabraStorage } from '../data/storage'
import type { GroupService, RpcName } from './client'
import type { GroupActivity,GroupData,GroupProfile,RpcResult } from './types'
import { groupDate } from './projection'
import { SecretCode } from './IdentityPanel'
import { StrictMode } from 'react'
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
async function mount(consent=true,offline=false,connectionFails=false){
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);let authCalls=0
  if(consent){await db.groups.write('groupState','consent',true);await db.saveGroupBinding(binding);await db.groups.write('groupCache','snapshot',{profile,group,activity,cachedAt:at})}
  if(offline)vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
  const remote:GroupService={uid:async()=>'uid',authenticate:async()=>{authCalls++;return'uid'},stop:()=>{},summary:async()=>({ok:true,data:{acceptedVersion:1}}),note:async()=>({ok:true,data:{acceptedVersion:1}}),
    rpc:async<T,>(name:RpcName)=>{if(connectionFails)throw new TypeError('fetch failed');return{ok:true,data:name==='self'?profile:name==='group'?group:activity} as RpcResult<T>},
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
it('shows the recovery code after consent and registration under StrictMode',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);let registered=false
  const remote:GroupService={uid:async()=>'uid',authenticate:async()=>'uid',stop:()=>{},summary:async()=>({ok:true,data:{acceptedVersion:1}}),note:async()=>({ok:true,data:{acceptedVersion:1}}),
    rpc:async<T,>(name:RpcName)=>{if(name==='register')registered=true;return registered?{ok:true,data:{...profile,binding:null}} as RpcResult<T>:{ok:false,code:'NOT_REGISTERED'}},
  }
  render(<StrictMode><MemoryRouter initialEntries={['/groups']}><GroupsProvider storageClient={db} remote={remote}><GroupsPage/></GroupsProvider></MemoryRouter></StrictMode>)
  const user=userEvent.setup();await user.type(await screen.findByLabelText('昵称'),'小林')
  await user.click(screen.getByRole('checkbox',{name:/我同意/}));await user.click(screen.getByRole('button',{name:'建立身份'}))
  expect(await screen.findByRole('button',{name:'我已安全保存'})).toBeInTheDocument()
  expect(screen.getByRole('textbox',{name:'恢复码'})).toBeInTheDocument()
})
it('offers a confirmed local identity reset after this device is replaced',async()=>{
  const db=new PalabraStorage(crypto.randomUUID());dbs.push(db);await db.groups.write('groupState','consent',true)
  const remote:GroupService={uid:async()=>'old-uid',authenticate:async()=>'old-uid',stop:()=>{},summary:async()=>({ok:false,code:'DEVICE_REPLACED'}),note:async()=>({ok:false,code:'DEVICE_REPLACED'}),rpc:async()=>({ok:false,code:'DEVICE_REPLACED'})}
  render(<MemoryRouter initialEntries={['/groups']}><GroupsProvider storageClient={db} remote={remote}><GroupsPage/></GroupsProvider></MemoryRouter>)
  await screen.findAllByText(/身份已在另一台设备恢复/)
  const user=userEvent.setup();await user.click(screen.getByText('身份与共享设置'))
  await user.click(screen.getByRole('button',{name:'退出本机身份'}))
  await user.click(screen.getByRole('button',{name:'确认退出本机身份'}))
  await waitFor(async()=>expect(await db.groups.read('groupState','consent')).toBeUndefined())
})
it('labels cached data honestly when network fails despite navigator reporting online',async()=>{
  await mount(true,false,true)
  expect(await screen.findByText(/同步未完成，显示本机缓存/)).toBeInTheDocument()
})
it('does not describe a selected historical date as today',async()=>{
  await mount()
  fireEvent.change(screen.getByLabelText('查看打卡日期'),{target:{value:'2026-09-30'}})
  expect(screen.getAllByText('当日尚未同步')).toHaveLength(4)
  expect(screen.queryByText('今日尚未同步')).not.toBeInTheDocument()
})
