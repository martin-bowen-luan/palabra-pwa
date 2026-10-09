import { afterEach, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { PalabraStorage, DEFAULT_SETTINGS } from '../data/storage'
import { bookFixture } from './fixtures'
import { mergeWordbookBundles } from './merge'
import type { EnglishWordbookBundle } from './types'

const extra: EnglishWordbookBundle = { revision: 1, words: [
  { ...bookFixture.words[0], senses: [{ id: 'cfa:apple:0', partOfSpeech: 'n.', meaningZh: '苹果公司', source: { provider: 'Palabra 编辑补充', url: 'https://example.test/review' } }], examples: [{ text: 'Apple reported its earnings.', translationZh: '苹果公司公布了收益。', author: 'Palabra 编辑补充', sourceId: 'editorial:cfa:apple' }] },
  { id: 'en:equity', language: 'en', term: 'equity', partOfSpeech: 'n.', meaningZh: '股权', category: 'CFA 一级必备词汇', senses: [{ id: 'cfa:equity:0', partOfSpeech: 'n.', meaningZh: '股权', source: { provider: 'Palabra 编辑补充', url: 'https://example.test/review' } }], examples: [{ text: 'The fund invests in equity.', translationZh: '该基金投资股权。' }] },
], books: [{ id: 'en-cfa-level1', language: 'en', title: 'CFA 一级必备词汇', revision: 1, members: [{ wordId: 'en:apple', order: 0, memberships: [], senseIds: ['cfa:apple:0'], exampleKeys: ['Apple reported its earnings.\n苹果公司公布了收益。'] }, { wordId: 'en:equity', order: 1, memberships: [] }] }] }
const clients: PalabraStorage[] = []
afterEach(() => { cleanup(); clients.splice(0).forEach(client => client.close()) })
async function mount(path = '/today') {
  const db = new PalabraStorage(crypto.randomUUID(), { wordbookBundle: mergeWordbookBundles(bookFixture, extra) }); clients.push(db)
  await db.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en' })
  await db.putProgress({ wordId: 'en:apple', language: 'en', stage: 6, status: 'mastered', skipReview: true, nextReviewAt: '2099-01-01', lastReviewedAt: '2026-10-09', reviewCount: 1, correctCount: 1 })
  render(<MemoryRouter initialEntries={[path]}><App storageClient={db}/></MemoryRouter>)
  return db
}
it('switches to CFA, searches its meanings, labels supplements and shows shared mastery', async () => {
  const db = await mount('/library'), user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'CFA 一级必备词汇' }))
  await user.type(screen.getByRole('searchbox'), '苹果公司')
  await user.click(screen.getByRole('button', { name: /apple.*苹果公司/ }))
  expect(screen.getByText('已标为熟练 · 无需复习')).toBeInTheDocument()
  expect(screen.getByText('自编例句 · Palabra 编辑补充')).toBeInTheDocument()
  expect(screen.getByText('释义经编辑补充')).toBeInTheDocument()
  expect((await db.getSettings()).englishWordbook).toBe('en-cfa-level1')
})
it('starts a CFA group excluding words already fluent in another book', async () => {
  const db = await mount(), user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'CFA 一级必备词汇' }))
  expect(screen.queryByLabelText('新词年级')).not.toBeInTheDocument()
  await user.click(screen.getByRole('button', { name: '开始学习' }))
  await waitFor(async () => expect((await db.getActiveSession('en'))?.sourceWordbook).toBe('en-cfa-level1'))
  expect((await db.getActiveSession('en'))?.wordIds).toEqual(['en:equity'])
  expect(await screen.findByRole('heading', { name: 'equity' })).toBeInTheDocument()
})

it('labels an editorial meaning when it is the spelling prompt', async () => {
  const db = await mount(), user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: 'CFA 一级必备词汇' }))
  await user.click(screen.getByRole('button', { name: '开始学习' }))
  await screen.findByRole('heading', { name: 'equity' })
  const active = (await db.getActiveSession('en'))!
  cleanup()
  await db.saveActiveSession({ ...active, memoryRound: 'spelling' })
  render(<MemoryRouter initialEntries={['/study']}><App storageClient={db}/></MemoryRouter>)
  expect(await screen.findByRole('heading', { name: /股权/ })).toBeInTheDocument()
  expect(screen.getByText('释义经编辑补充')).toBeInTheDocument()
})

it('continues a real unfinished group after installing CFA, retaining the book and queue', async () => {
  const name = crypto.randomUUID(), old = new PalabraStorage(name, { wordbookBundle: bookFixture }); clients.push(old)
  await old.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', englishWordbook: 'en-oxford-primary' })
  render(<MemoryRouter initialEntries={['/today']}><App storageClient={old}/></MemoryRouter>)
  const user = userEvent.setup()
  await user.click(await screen.findByRole('button', { name: '开始学习' }))
  await screen.findByRole('heading', { name: 'apple' })
  await user.click(screen.getByRole('button', { name: /^不认识$/ }))
  const before = (await old.getActiveSession('en'))!
  expect(before.quizFeedback?.correct).toBe(false)
  expect(before.practice?.pendingIds).toContain('en:apple')
  cleanup(); old.close()
  const next = new PalabraStorage(name, { wordbookBundle: mergeWordbookBundles(bookFixture, extra) }); clients.push(next)
  render(<MemoryRouter initialEntries={['/study']}><App storageClient={next}/></MemoryRouter>)
  await user.click(await screen.findByRole('button', { name: '立即重做' }))
  await waitFor(async () => expect((await next.getActiveSession('en'))?.quizFeedback).toBeUndefined())
  expect((await next.getActiveSession('en'))?.sourceWordbook).toBe('en-oxford-primary')
  expect(screen.getByRole('heading', { name: 'apple' })).toBeInTheDocument()
  expect(await next.getWordbooks()).toHaveLength(3)
})
