import { describe,it,expect,vi } from 'vitest'
import { validateGroupConfig,decodeRpc,getGroupClient,groupConfig,releaseGroupClient } from './client'
import { PalabraStorage } from '../data/storage'
vi.mock('@supabase/supabase-js',()=>({createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'local-test-token',user:{id:'test'}}}}),stopAutoRefresh:()=>{}}})}))
describe('group client boundary',()=>{
  it('requires explicit configuration and TLS except local development',()=>{
    expect(validateGroupConfig({enabled:false,url:'',key:''})).toBeUndefined()
    expect(validateGroupConfig({enabled:true,url:'https://test.supabase.co',key:'public'})).toMatchObject({url:'https://test.supabase.co'})
    for(const url of ['http://test.supabase.co','https://user:pass@test.supabase.co','https://test.supabase.co/?key=secret'])expect(()=>validateGroupConfig({enabled:true,url,key:'public'})).toThrow()
    expect(validateGroupConfig({enabled:true,url:'http://127.0.0.1:55421',key:'test'},true)?.url).toBe('http://127.0.0.1:55421')
    expect(()=>validateGroupConfig({enabled:true,url:'http://127.0.0.1:55421',key:'test'},false)).toThrow()
  })
  it('rejects malformed responses without displaying arbitrary server text',()=>{
    expect(decodeRpc({ok:true,data:{nickname:'昵称'}})).toEqual({ok:true,data:{nickname:'昵称'}})
    expect(decodeRpc({ok:false,code:'DEVICE_REPLACED'})).toEqual({ok:false,code:'DEVICE_REPLACED'})
    expect(()=>decodeRpc({ok:false,message:'token secret'})).toThrow('INVALID_RESPONSE')
  })
  it('calls the PostgREST RPC endpoint, never the table endpoint',async()=>{
    const previous={...groupConfig},db=new PalabraStorage(crypto.randomUUID())
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({ok:true,data:{}})))
    vi.stubGlobal('fetch',fetcher)
    Object.assign(groupConfig,{enabled:true,url:'http://127.0.0.1:55421',key:'public-test-key'})
    try{
      const client=await getGroupClient(db);await client!.rpc('self')
      expect(fetcher).toHaveBeenCalledWith('http://127.0.0.1:55421/rest/v1/rpc/palabra_self',expect.objectContaining({method:'POST',cache:'no-store'}))
    }finally{releaseGroupClient(db);db.close();Object.assign(groupConfig,previous);vi.unstubAllGlobals()}
  })
})
