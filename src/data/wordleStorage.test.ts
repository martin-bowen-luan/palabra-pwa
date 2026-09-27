import { afterEach, expect, it } from 'vitest'
import { PalabraStorage, DEFAULT_SETTINGS } from './storage'
import { createGame, localEntry } from '../wordle/rules'
import type { VocabularyEntry } from '../types'
const word: VocabularyEntry = {id:'en:apple',term:'apple',language:'en',partOfSpeech:'n.',meaningZh:'苹果',category:'测试',examples:[]}
const stores: PalabraStorage[] = []
afterEach(() => stores.splice(0).forEach(s => s.close()))
it('persists game/cache, rejects stale writes and leaves them intact when clearing learning', async () => {
  const db = new PalabraStorage(`wordle-${crypto.randomUUID()}`); stores.push(db)
  const game = createGame([word])
  expect(await db.saveWordleGame(game, undefined)).toBe(true)
  const edited = {...game, draft:'app', revision:1}
  expect(await db.saveWordleGame(edited, 0)).toBe(true)
  expect(await db.saveWordleGame({...game,draft:'wrong',revision:1}, 0)).toBe(false)
  const entry = {...localEntry('apple',[word])!,source:'wiktionary' as const, sourceUrl:'https://en.wiktionary.org/wiki/apple', revisionId:1, fetchedAt:new Date().toISOString()}
  await db.saveWordleDictionaryEntry(entry)
  await db.saveSettings(DEFAULT_SETTINGS)
  await db.clearLearningData('en')
  db.close()
  expect(await db.getWordleGame()).toEqual(edited)
  expect(await db.getWordleDictionaryEntry('apple')).toEqual(entry)
  expect(await db.getSettings()).toEqual(DEFAULT_SETTINGS)
})
it('upgrades a populated v4 database without changing old records', async () => {
  const name = `wordle-upgrade-${crypto.randomUUID()}`
  const prior = await new Promise<IDBDatabase>((resolve,reject) => {
    const q=indexedDB.open(name,4)
    q.onupgradeneeded=()=>{for(const [store,keyPath] of [['wordProgress','wordId'],['sessions','id'],['settings','id'],['activeSession','id'],['vocabulary','id'],['metadata','id'],['aiSettings','id'],['aiCredentials','id'],['aiAnalyses','key']])q.result.createObjectStore(store,{keyPath})}
    q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)
  })
  const tx=prior.transaction(Array.from(prior.objectStoreNames),'readwrite')
  for(const store of Array.from(prior.objectStoreNames)) tx.objectStore(store).put({id:'sentinel',wordId:'sentinel',key:'sentinel',value:store})
  await new Promise<void>((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)});prior.close()
  const db=new PalabraStorage(name);stores.push(db)
  await db.saveWordleGame(createGame([word]),undefined)
  const upgraded=await new Promise<IDBDatabase>(resolve=>{const q=indexedDB.open(name);q.onsuccess=()=>resolve(q.result)})
  expect(upgraded.version).toBe(6)
  for(const store of ['wordProgress','sessions','settings','activeSession','vocabulary','metadata','aiSettings','aiCredentials','aiAnalyses']) {
    const value=await new Promise(resolve=>{const q=upgraded.transaction(store).objectStore(store).get('sentinel');q.onsuccess=()=>resolve(q.result)})
    expect(value).toEqual({id:'sentinel',wordId:'sentinel',key:'sentinel',value:store})
  }
  upgraded.close()
})
