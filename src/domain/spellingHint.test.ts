import { expect, it } from 'vitest'
import { buildSpellingHint } from './spellingHint'

it('reveals letters from the beginning up to half, never the whole spelling',()=>{
  expect(buildSpellingHint('soluble',1)).toEqual({mask:'s______',limit:3})
  expect(buildSpellingHint('soluble',99)).toEqual({mask:'sol____',limit:3})
  expect(buildSpellingHint('go',1)).toEqual({mask:'g_',limit:1})
  expect(buildSpellingHint('a',1)).toEqual({mask:'_',limit:0})
  expect(buildSpellingHint('happy',0).mask).toBe('_____')
})
it('preserves word boundaries and punctuation without counting them as letters',()=>{
  expect(buildSpellingHint('ice-cream',2)).toEqual({mask:'ic_-_____',limit:4})
  expect(buildSpellingHint('a lot',1).mask).toBe('a ___')
})
