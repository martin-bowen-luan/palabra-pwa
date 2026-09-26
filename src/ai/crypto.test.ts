import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { decryptCredential, encryptCredential } from './crypto'

// Keep Node-only test injection independent of browser project's type packages.
const cryptoModule = 'node:crypto'
const { webcrypto } = await import(/* @vite-ignore */ cryptoModule) as { webcrypto: Crypto }

const endpoint = 'https://api.deepseek.com'
const password = 'a strong password'
beforeEach(() => vi.stubGlobal('crypto', webcrypto))
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals() })

describe('real WebCrypto credential encryption', () => {
  it('round trips UTF-8 credentials and normalizes the destination', async () => {
    const derive = vi.spyOn(webcrypto.subtle, 'deriveKey')
    const encrypt = vi.spyOn(webcrypto.subtle, 'encrypt')
    const envelope = await encryptCredential('sk-secret-中文', password, endpoint + '/')
    expect(derive).toHaveBeenCalledWith(expect.objectContaining({ name: 'PBKDF2', hash: 'SHA-256', iterations: 600000 }), expect.anything(), { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
    expect(encrypt).toHaveBeenCalledWith(expect.objectContaining({ name: 'AES-GCM', tagLength: 128, additionalData: expect.objectContaining({ byteLength: expect.any(Number) }) }), expect.anything(), expect.objectContaining({ byteLength: 16 }))
    expect(envelope).toMatchObject({ id: 'ai', version: 1, iterations: 600000, baseUrl: endpoint })
    expect(atob(envelope.salt)).toHaveLength(16)
    expect(atob(envelope.iv)).toHaveLength(12)
    expect(envelope.credentialId).toBeTruthy()
    expect(JSON.stringify(envelope)).not.toContain('sk-secret')
    expect(JSON.stringify(envelope)).not.toContain(password)
    await expect(decryptCredential(envelope, password, endpoint)).resolves.toBe('sk-secret-中文')
  })
  it('uses fresh salts, IVs and credential identities for repeated encryption', async () => {
    const a = await encryptCredential('secret', password, endpoint)
    const b = await encryptCredential('secret', password, endpoint)
    expect(a.salt).not.toBe(b.salt)
    expect(a.iv).not.toBe(b.iv)
    expect(a.ciphertext).not.toBe(b.ciphertext)
    expect(a.credentialId).not.toBe(b.credentialId)
  })
  it('uses one clean error for wrong passwords, changed destinations and corrupted ciphertext', async () => {
    const envelope = await encryptCredential('secret', password, endpoint)
    const corrupted = { ...envelope, ciphertext: (envelope.ciphertext[0] === 'A' ? 'B' : 'A') + envelope.ciphertext.slice(1) }
    const errors = await Promise.all([
      decryptCredential(envelope, 'wrong-password', endpoint).catch(e => e.message),
      decryptCredential(envelope, password, 'https://other.example').catch(e => e.message),
      decryptCredential(corrupted, password, endpoint).catch(e => e.message),
      decryptCredential({ ...envelope, baseUrl: 'https://other.example' }, password, 'https://other.example').catch(e => e.message),
    ])
    expect(new Set(errors).size).toBe(1)
    expect(errors[0]).toMatch(/密码|损坏/)
    expect(errors[0]).not.toMatch(/secret|OperationError/)
  })
  it('rejects short passwords before deriving a key', async () => {
    const derive = vi.spyOn(webcrypto.subtle, 'deriveKey')
    await expect(encryptCredential('secret', 'short', endpoint)).rejects.toThrow(/8/)
    expect(derive).not.toHaveBeenCalled()
  })
  it('validates malformed envelopes before any expensive derivation', async () => {
    const envelope = await encryptCredential('secret', password, endpoint)
    const derive = vi.spyOn(webcrypto.subtle, 'deriveKey')
    const changes = [
      { version: 2 }, { id: 'other' }, { iterations: 1 }, { iterations: 600001 }, { iterations: 1e12 },
      { salt: 'AA==' }, { iv: 'AA==' }, { salt: '!'.repeat(24) }, { ciphertext: 'AA==' },
      { ciphertext: 'A'.repeat(20000) }, { credentialId: '' }, { salt: 'A'.repeat(100000) },
    ]
    for (const change of changes) await expect(decryptCredential({ ...envelope, ...change } as typeof envelope, password, endpoint)).rejects.toThrow(/密码|损坏/)
    expect(derive).not.toHaveBeenCalled()
  })
  it('rejects oversized or empty keys and insecure destinations', async () => {
    await expect(encryptCredential('', password, endpoint)).rejects.toThrow()
    await expect(encryptCredential('x'.repeat(4097), password, endpoint)).rejects.toThrow()
    await expect(encryptCredential('secret', password, 'http://example.com')).rejects.toThrow()
  })
})
