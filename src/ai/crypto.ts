import type { EncryptedCredential } from './types'
import { normalizeBaseUrl } from './protocol'

const ITERATIONS = 600000
const MAX_KEY_BYTES = 4096
const DECRYPT_ERROR = '密码错误或凭据已损坏，请重试或重新设置 API 密钥。'

function validatePassword(password: string): void {
  if (typeof password !== 'string' || password.length < 8 || password.length > 1024) throw new Error('密码长度须为 8 至 1024 个字符。')
}

function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
}

function decode(value: string, minBytes: number, maxBytes: number): Uint8Array<ArrayBuffer> {
  if (typeof value !== 'string' || value.length > 4 * Math.ceil(maxBytes / 3) || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) throw new Error()
  const bytes = Uint8Array.from(atob(value), char => char.charCodeAt(0))
  if (bytes.length < minBytes || bytes.length > maxBytes || encode(bytes) !== value) throw new Error()
  return bytes
}

async function deriveKey(password: string, salt: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'])
}

function aad(baseUrl: string): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(JSON.stringify({ version: 1, baseUrl }))
}

export async function encryptCredential(apiKey: string, password: string, baseUrl: string): Promise<EncryptedCredential> {
  validatePassword(password)
  const endpoint = normalizeBaseUrl(baseUrl)
  if (typeof apiKey !== 'string' || !apiKey.trim() || apiKey.length > MAX_KEY_BYTES) throw new Error('API 密钥为空或过长。')
  const plaintext = new TextEncoder().encode(apiKey)
  if (plaintext.length > MAX_KEY_BYTES) throw new Error('API 密钥过长。')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  try {
    const key = await deriveKey(password, salt)
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(endpoint), tagLength: 128 }, key, plaintext)
    return { id: 'ai', version: 1, credentialId: crypto.randomUUID(), baseUrl: endpoint, iterations: ITERATIONS, salt: encode(salt), iv: encode(iv), ciphertext: encode(new Uint8Array(ciphertext)) }
  } finally {
    plaintext.fill(0)
  }
}

export async function decryptCredential(envelope: EncryptedCredential, password: string, baseUrl: string): Promise<string> {
  try {
    validatePassword(password)
    const endpoint = normalizeBaseUrl(baseUrl)
    // Validate before PBKDF2: untrusted disk data cannot choose its work factor.
    if (!envelope || envelope.id !== 'ai' || envelope.version !== 1 || envelope.iterations !== ITERATIONS || envelope.baseUrl !== endpoint || typeof envelope.credentialId !== 'string' || !envelope.credentialId || envelope.credentialId.length > 128) throw new Error()
    const salt = decode(envelope.salt, 16, 16)
    const iv = decode(envelope.iv, 12, 12)
    const ciphertext = decode(envelope.ciphertext, 17, MAX_KEY_BYTES + 16)
    const key = await deriveKey(password, salt)
    const plaintext = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(endpoint), tagLength: 128 }, key, ciphertext))
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(plaintext)
    } finally {
      plaintext.fill(0)
    }
  } catch {
    throw new Error(DECRYPT_ERROR)
  }
}
