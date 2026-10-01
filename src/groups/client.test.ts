import { describe,it,expect } from 'vitest'
import { validateGroupConfig,decodeRpc } from './client'
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
})
