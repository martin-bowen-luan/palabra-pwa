import { expect, it } from 'vitest'
import { loadEcdict } from './ecdict'

it('loads the bundled Chinese-only five-letter supplement with attribution', async () => {
  const entries = await loadEcdict()
  expect(entries.get('wreck')).toMatchObject({term:'wreck',source:'ecdict',definitions:[
    {partOfSpeech:'n.',text:'失事, 残骸, 破坏'},
    {partOfSpeech:'vt.',text:'使失事, 拆毁, 破坏'},
    {partOfSpeech:'vi.',text:'(船)失事, 营救失事船只'},
  ]})
  expect(entries.get('quaff')?.definitions[0].text).toContain('狂饮')
  expect(entries.has('Paris')).toBe(false)
  expect(entries.has('zzzzz')).toBe(false)
  for (const [term, entry] of entries) {
    expect(term).toMatch(/^[a-z]{5}$/)
    expect(entry.definitions.length).toBeGreaterThan(0)
    expect(entry.definitions.length).toBeLessThanOrEqual(3)
    expect(entry.definitions.every(d => /[\u3400-\u9fff]/.test(d.text))).toBe(true)
    expect(entry.sourceUrl).toContain('github.com/skywind3000/ECDICT')
  }
  expect(await loadEcdict()).toBe(entries)
})
