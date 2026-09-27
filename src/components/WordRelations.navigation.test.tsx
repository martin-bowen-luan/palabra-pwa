import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { DEFAULT_SETTINGS, PalabraStorage } from '../data/storage'
import { createPracticeQueue } from '../domain/practiceQueue'
import type { VocabularyEntry } from '../types'

const happy: VocabularyEntry = {
  id: 'en:happy', language: 'en', term: 'happy', partOfSpeech: 'adj.',
  meaningZh: '快乐的', category: '测试', examples: [],
  relatedTerms: [' GLAD ', 'uncollected'], derivedTerms: ['happiness', 'color'],
  roots: [{ part: 'glad', meaningZh: '测试词基', sourceUrl: 'https://example.test' }],
}
const words: VocabularyEntry[] = [happy,
  { ...happy, id: 'en:glad', term: 'glad', meaningZh: '高兴的', relatedTerms: [], derivedTerms: [] },
  { ...happy, id: 'en:happiness', term: 'happiness', meaningZh: '幸福', relatedTerms: [], derivedTerms: [] },
  { ...happy, id: 'en:colour', term: 'colour', meaningZh: '颜色', spellingVariants: ['color'], relatedTerms: [], derivedTerms: [] },
]
const stores: PalabraStorage[] = []
afterEach(() => { cleanup(); stores.splice(0).forEach(store => store.close()) })

async function mount(path = '/library', study = false, feedback = true) {
  const db = new PalabraStorage(`relation-links-${crypto.randomUUID()}`, { vocabularySeeds: { en: words } })
  stores.push(db)
  await db.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en' })
  if (study) await db.saveActiveSession({
    id: 'active-session:en', language: 'en', mode: 'learn', memoryRound: 'recall',
    wordIds: [happy.id], newWordIds: [happy.id], reviewWordIds: [], currentIndex: 0,
    phase: 'quiz', practice: createPracticeQueue([happy.id]), correctCount: 0,
    answeredCount: 1, startedAt: new Date().toISOString(), revision: 1,
    quizFeedback: feedback ? { wordId: happy.id, correct: false, selected: '不认识', nextPractice: createPracticeQueue([happy.id]) } : undefined,
  })
  render(<MemoryRouter initialEntries={[path]}><App storageClient={db} /></MemoryRouter>)
  return db
}

describe('word relation navigation', () => {
  it('links collected synonyms to local details and returns to the original word', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(await screen.findByRole('button', { name: /^happy/ }))
    const link = screen.getByRole('link', { name: 'GLAD' })
    expect(link).toHaveAttribute('href', '/library?word=en%3Aglad')
    expect(screen.getByText('uncollected')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'uncollected' })).not.toBeInTheDocument()
    await user.click(link)
    expect(await screen.findByRole('heading', { name: 'glad' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'glad' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: '返回上一词' }))
    expect(await screen.findByRole('heading', { name: 'happy' })).toBeInTheDocument()
  })

  it('links derived words and known spelling variants but not roots', async () => {
    const user = userEvent.setup()
    await mount()
    await user.click(await screen.findByRole('button', { name: /^happy/ }))
    await user.click(screen.getByRole('tab', { name: '派生词' }))
    expect(screen.getByRole('link', { name: 'happiness' })).toHaveAttribute('href', '/library?word=en%3Ahappiness')
    await user.click(screen.getByRole('link', { name: 'color' }))
    expect(await screen.findByRole('heading', { name: 'colour' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回上一词' }))
    await user.click(screen.getByRole('tab', { name: '词根' }))
    expect(screen.queryByRole('link', { name: 'glad' })).not.toBeInTheDocument()
  })

  it('opens a detail URL directly, including under the deployed base path', async () => {
    const db = await mount('/library?word=en%3Ahappiness')
    expect(await screen.findByRole('heading', { name: 'happiness' })).toBeInTheDocument()
    cleanup()
    render(<MemoryRouter basename="/palabra-pwa" initialEntries={['/palabra-pwa/library?word=en%3Ahappy']}><App storageClient={db} /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: 'GLAD' })).toHaveAttribute('href', '/palabra-pwa/library?word=en%3Aglad')
  })

  it('returns from a study relation without advancing or changing the saved answer', async () => {
    const user = userEvent.setup()
    const db = await mount('/study', true)
    const before = await db.getActiveSession('en')
    await user.click(await screen.findByRole('link', { name: 'GLAD' }))
    expect(await screen.findByRole('heading', { name: 'glad' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回学习' }))
    expect(await screen.findByRole('heading', { name: 'happy' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '立即重做' })).toBeInTheDocument()
    expect(await db.getActiveSession('en')).toEqual(before)
    expect(await db.getAllProgress('en')).toEqual([])
  })

  it('shows a recoverable missing-word view for stale detail links', async () => {
    const user = userEvent.setup()
    await mount('/library?word=en%3Auncollected')
    expect(await screen.findByRole('heading', { name: '词库未收录这个词' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '返回词库' }))
    expect(await screen.findByRole('searchbox', { name: '搜索词库' })).toBeInTheDocument()
  })

  it.each(['认识', '提示一下'])('preserves the pending %s assessment across a relation round trip', async action => {
    const user = userEvent.setup()
    const db = await mount('/study', true, false)
    await user.click(await screen.findByRole('button', { name: action }))
    await user.click(screen.getByRole('link', { name: 'GLAD' }))
    await user.click(await screen.findByRole('button', { name: '返回学习' }))
    if (action === '提示一下') {
      expect(screen.queryByRole('button', { name: '记对了' })).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '继续练习' }))
      expect((await db.getActiveSession('en'))?.quizFeedback).toMatchObject({ correct: false, selected: '使用提示' })
    } else {
      expect(screen.getByRole('button', { name: '记对了' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: '记错了' })).toBeInTheDocument()
    }
  })
})
