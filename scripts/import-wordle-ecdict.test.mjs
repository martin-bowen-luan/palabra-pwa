import { expect, it } from 'vitest'
import { extractWordleDictionary, verifySource } from './import-wordle-ecdict.mjs'

it('keeps lowercase five-letter entries with Chinese definitions, not English or proper names', () => {
  const csv = 'word,translation,definition\r\nwreck,"n. 残骸, 破坏\\nvt. 拆毁",English text\r\napple,n. 苹果,fruit\r\nParis,巴黎,city\r\nlonger,更长,long\r\nx-ray,射线,ray\r\nempty,English only,English\r\nzzzzz,,nothing\r\n'
  expect(extractWordleDictionary(csv)).toEqual([['apple', ['n. 苹果']], ['wreck', ['n. 残骸, 破坏', 'vt. 拆毁']]])
})
it('handles quoted newlines, escaped quotes, deduplication, and limits definitions to three', () => {
  expect(extractWordleDictionary('word,translation\napple,"n. 苹果\n“苹果”公司"\napple,重复释义\nwreck,"一\\n二\\n三\\n四"')).toEqual([
    ['apple', ['n. 苹果', '“苹果”公司']], ['wreck', ['一', '二', '三']],
  ])
  expect(extractWordleDictionary('word,translation\nwreck,"n. ""残骸"""')).toEqual([['wreck', ['n. "残骸"']]])
})
it('rejects malformed files instead of silently producing incomplete data', () => {
  expect(() => extractWordleDictionary('word,definition\napple,苹果')).toThrow()
  expect(() => extractWordleDictionary('word,translation\napple,"苹果')).toThrow()
})
it('refuses to label an arbitrary download as the pinned ECDICT revision', () => {
  expect(() => verifySource('word,translation\napple,苹果')).toThrow('checksum')
})
