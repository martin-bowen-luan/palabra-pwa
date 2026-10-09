import { afterEach, expect, it } from 'vitest'
import { englishWordbookBundle } from './englishVocabulary'
import previousBundle from './english-wordbooks.json'
import { projectWordbook } from '../wordbooks/catalog'
import { PalabraStorage, DEFAULT_SETTINGS } from './storage'
import type { EnglishWordbookBundle } from '../wordbooks/types'
import type { ActiveSession } from '../types'

const clients: PalabraStorage[] = []
afterEach(() => clients.splice(0).forEach(client => client.close()))

it('adds all 1152 CFA terms while reusing the 112 existing word identities', () => {
  const cfa = englishWordbookBundle.books.find(book => book.title === 'CFA 一级必备词汇')
  expect(cfa).toBeDefined()
  expect(cfa!.members).toHaveLength(1152)
  expect(englishWordbookBundle.words).toHaveLength(4747)
  expect(new Set(englishWordbookBundle.words.map(word => word.id)).size).toBe(4747)
  const oldIds = new Set(previousBundle.words.map(word => word.id))
  expect(cfa!.members.filter(member => oldIds.has(member.wordId))).toHaveLength(112)
  const words = projectWordbook(englishWordbookBundle.words, cfa!)
  for (const word of words) {
    expect(word.meaningZh, word.term).toMatch(/[\u3400-\u9fff]/u)
    expect(word.examples[0]?.text, word.term).toMatch(/[a-z]/iu)
    expect(word.examples[0]?.translationZh, word.term).toMatch(/[\u3400-\u9fff]/u)
  }
  expect(words.find(word => word.term === 'student loan')?.meaningZh).toContain('助学贷款')
  expect(words.find(word => word.term === 'student loan')?.examples[0].author).toBe('Palabra 编辑补充')
  expect(JSON.stringify(words)).not.toMatch(/raw_html|main_html|sidebar_html|<script|<aside/iu)
})

it('keeps the existing books’ projected meanings and example order unchanged', () => {
  for (const oldBook of previousBundle.books) {
    const oldProjection = projectWordbook((previousBundle as unknown as EnglishWordbookBundle).words, oldBook as EnglishWordbookBundle['books'][number])
    const current = projectWordbook(englishWordbookBundle.words, englishWordbookBundle.books.find(book => book.id === oldBook.id)!)
    expect(current.map(word => [word.id, word.term, word.partOfSpeech, word.meaningZh, word.examples, word.senses ?? []]))
      .toEqual(oldProjection.map(word => [word.id, word.term, word.partOfSpeech, word.meaningZh, word.examples, word.senses ?? []]))
  }
})

it('uses corrected financial meanings instead of known unrelated dictionary senses', () => {
  const book = englishWordbookBundle.books.find(book => book.id === 'en-cfa-level1')!
  const words = projectWordbook(englishWordbookBundle.words, book)
  for (const [id, meaning] of [['en:maintenance margin', '维持保证金'], ['en:repo', '回购'], ['en:gilt', '英国国债'], ['en:duration', '久期'], ['en:fund of funds', '基金中的基金']]) {
    const word = words.find(word => word.id === id)!
    expect(word.meaningZh, id).toContain(meaning)
    expect(word.senses?.[0].source?.provider, id).toBe('Palabra 编辑补充')
  }
})

it('upgrades the dictionary without resetting shared mastery, settings or an active group', async () => {
  const name = crypto.randomUUID()
  const old = new PalabraStorage(name, { wordbookBundle: previousBundle as unknown as EnglishWordbookBundle }); clients.push(old)
  await old.getWordbooks()
  await old.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', englishWordbook: 'en-oxford-primary' })
  const progress = { wordId: 'en:swap', language: 'en' as const, stage: 6, status: 'mastered' as const, skipReview: true, nextReviewAt: '2099-01-01', lastReviewedAt: '2026-10-09', reviewCount: 3, correctCount: 3 }
  await old.putProgress(progress)
  const active: ActiveSession = { id: 'active-session:en', language: 'en', sourceWordbook: 'en-oxford-primary', wordIds: ['en:apple'], newWordIds: ['en:apple'], reviewWordIds: [], currentIndex: 0, phase: 'quiz', memoryRound: 'spelling', correctCount: 1, answeredCount: 2, startedAt: '2026-10-09T06:00:00Z', revision: 4, spellingHint: { wordId: 'en:apple', promptNumber: 2, revealedCount: 1 } }
  await old.saveActiveSession(active)
  const history = { id: 'cfa-upgrade-history', language: 'en' as const, date: '2026-10-08', newCount: 5, reviewCount: 2, correctCount: 7, totalCount: 7, durationSeconds: 60, completed: true }
  await old.putSession(history)
  old.close()
  const next = new PalabraStorage(name); clients.push(next)
  const books = await next.getWordbooks()
  expect(books.map(book => book.title)).toContain('CFA 一级必备词汇')
  expect(await next.getAllProgress('en')).toEqual([progress])
  expect((await next.getSettings()).englishWordbook).toBe('en-oxford-primary')
  expect(await next.getActiveSession('en')).toEqual(active)
  expect(await next.getSessions('en')).toContainEqual(history)
  next.close()
  expect((await next.getVocabulary('en')).length).toBe(4747)
})
