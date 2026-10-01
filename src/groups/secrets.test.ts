import { describe,it,expect,vi,afterEach } from 'vitest'
import { makeSecret,hashSecret } from './secrets'
const cryptoModule='node:crypto'
const {webcrypto}=await import(/* @vite-ignore */ cryptoModule) as {webcrypto:Crypto}
afterEach(()=>vi.unstubAllGlobals())
describe('group recovery secrets',()=>{
  it('generates full entropy hex for invites and recovery',()=>{
    vi.stubGlobal('crypto',webcrypto)
    expect(makeSecret(16)).toMatch(/^[a-f0-9]{32}$/)
    expect(makeSecret(32)).toMatch(/^[a-f0-9]{64}$/)
    expect(makeSecret(32)).not.toBe(makeSecret(32))
  })
  it('hashes normalized grouped hex without truncation',async()=>{
    vi.stubGlobal('crypto',webcrypto)
    const code='abcdef01'.repeat(8)
    expect(await hashSecret(code)).toBe(await hashSecret(' ABCDEF01 '.repeat(8)))
    expect(await hashSecret(code)).toHaveLength(64)
    await expect(hashSecret('short')).rejects.toThrow()
    await expect(hashSecret('z'.repeat(64))).rejects.toThrow()
  })
})
