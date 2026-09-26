export interface AiSettings {
  id: 'ai'
  enabled: boolean
  provider: 'deepseek' | 'qwen' | 'custom'
  baseUrl: string
  model: string
  consentVersion: number
  revision: number
}

export interface EncryptedCredential {
  id: 'ai'
  version: 1
  credentialId: string
  baseUrl: string
  iterations: number
  salt: string
  iv: string
  ciphertext: string
}

export interface AiResult {
  derived: Array<{ term: string; partOfSpeech: string; meaningZh: string; relationship: string }>
  roots: Array<{ part: string; kind: 'root' | 'prefix' | 'suffix' | 'base' | 'mnemonic'; meaningZh: string; explanation: string }>
  synonyms: Array<{ term: string; meaningZh: string; difference: string }>
  conflicts: Array<{ section: 'derived' | 'roots' | 'synonyms'; term: string; explanation: string }>
}

export interface WordAiAnalysis {
  key: string
  wordId: string
  language: 'en'
  baseUrl: string
  model: string
  inputHash: string
  promptVersion: number
  generatedAt: string
  result: AiResult
}

export const DEFAULT_AI_SETTINGS: AiSettings = {
  id: 'ai', enabled: false, provider: 'deepseek', baseUrl: 'https://api.deepseek.com',
  model: '', consentVersion: 0, revision: 0,
}
