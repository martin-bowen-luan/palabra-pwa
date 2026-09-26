import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { DEFAULT_SETTINGS, PalabraStorage } from './data/storage'
import type { VocabularyEntry, WordProgress } from './types'
import { pronunciationPlayer } from './audio/pronunciation'

const databaseWord: VocabularyEntry = {
  id: 'database-01',
  language: 'es',
  term: 'persistir',
  spanish: 'persistir',
  partOfSpeech: '动词',
  meaningZh: '持久保存',
  chinese: '持久保存',
  category: '数据库测试',
  examples: [{ text: 'Los datos pueden persistir.', translationZh: '数据可以持久保存。' }],
  example: 'Los datos pueden persistir.',
  exampleZh: '数据可以持久保存。',
}

const databaseNames: string[] = []
const storageClients: PalabraStorage[] = []

afterEach(async () => {
  cleanup()
  vi.restoreAllMocks()
  document.documentElement.removeAttribute('data-theme')
  storageClients.splice(0).forEach((client) => client.close())
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })))
})

async function renderApp(
  path = '/today',
  prepare?: (storage: PalabraStorage) => Promise<void>,
  options?: ConstructorParameters<typeof PalabraStorage>[1],
) {
  const name = `palabra-app-${crypto.randomUUID()}`
  databaseNames.push(name)
  const storage = new PalabraStorage(name, options)
  storageClients.push(storage)
  await storage.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 5 })
  await prepare?.(storage)
  render(
    <MemoryRouter initialEntries={[path]}>
      <App storageClient={storage} />
    </MemoryRouter>,
  )
  return storage
}

describe('Palabra app', () => {
  it('completes two English groups with immediate retry, delayed revisit, and resume', async () => {
    const user = userEvent.setup()
    const words = Array.from({ length: 20 }, (_, index): VocabularyEntry => ({
      id: `en:word${index}`, language: 'en', term: `word${index}`, meaningZh: `释义${index}`,
      partOfSpeech: 'n.', category: '高考 3500', examples: [],
    }))
    const storage = await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', dailyNewWords: 20, enableChoice: false })
    }, { vocabularySeeds: { en: words } })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect((await storage.getActiveSession('en'))?.wordIds).toHaveLength(10)
    expect(await screen.findByRole('heading', { name: 'word0' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '忘记' }))
    expect(await screen.findByRole('button', { name: '点击查看释义' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '认识' }))
    for (const term of ['word1', 'word2', 'word3']) {
      expect(await screen.findByRole('heading', { name: term })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '点击查看释义' }))
      await user.click(screen.getByRole('button', { name: '认识' }))
    }
    expect(await screen.findByRole('heading', { name: 'word0' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '结束' }))
    cleanup()
    render(<MemoryRouter initialEntries={['/today']}><App storageClient={storage} /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '继续今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'word0' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '标为熟练' }))
    for (let index = 4; index < 10; index += 1) {
      expect(await screen.findByRole('heading', { name: `word${index}` })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '标为熟练' }))
    }
    for (const term of ['word1', 'word2', 'word3']) {
      await user.type(await screen.findByLabelText('英语'), term)
      await user.click(screen.getByRole('button', { name: '检查答案' }))
      await user.click(screen.getByRole('button', { name: '继续' }))
    }
    expect(await screen.findByRole('heading', { name: '100%' })).toBeInTheDocument()
    expect(screen.getByText('本组完成了')).toBeInTheDocument()
    expect((await storage.getSessions('en'))[0].newCount).toBe(10)
    expect((await storage.getAllProgress('en')).find((item) => item.wordId === 'en:word0')?.skipReview).toBe(true)
    await user.click(screen.getByRole('button', { name: '开始下一组' }))
    expect((await storage.getActiveSession('en'))?.wordIds).toEqual(words.slice(10).map((word) => word.id))
    for (let index = 10; index < 20; index += 1) {
      expect(await screen.findByRole('heading', { name: `word${index}` })).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: '标为熟练' }))
    }
    expect(await screen.findByText('无需测试')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '回到今日' }))
    expect(await screen.findByRole('button', { name: '今日已完成' })).toBeDisabled()
    expect((await storage.getSessions('en')).map((session) => session.newCount)).toEqual([10, 10])
  })

  it('keeps the learned-word list separate across English and Spanish', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/library', async (client) => {
      await client.putProgress({
        wordId: 'en:altitude', language: 'en', stage: 1, status: 'learning',
        nextReviewAt: '2026-10-01T00:00:00.000Z', reviewCount: 1,
        correctCount: 1, lastReviewedAt: new Date().toISOString(),
      })
    })
    await user.click(await screen.findByRole('button', { name: '已背' }))
    expect(screen.getByText('还没有背过单词')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '英语' }))
    await user.click(screen.getByRole('button', { name: '已背' }))
    expect(await screen.findByText('altitude')).toBeInTheDocument()
    expect((await storage.getAllProgress('es'))).toHaveLength(0)
  })
  it('shows four stable English choices, autoplays once, and allows manual replay', async () => {
    const user = userEvent.setup()
    const play = vi.spyOn(pronunciationPlayer, 'play').mockResolvedValue(undefined)
    const words = ['form', 'from', 'farm', 'foam', 'storm', 'planet'].map((term, index): VocabularyEntry => ({
      id: `en:${term}`, language: 'en', term, meaningZh: `释义${index}`,
      partOfSpeech: 'n.', category: '高考 3500', examples: [],
    }))
    const storage = await renderApp('/study', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', enableSpelling: false })
      await client.putProgress({
        wordId: 'en:from', language: 'en', stage: 1, status: 'learning',
        nextReviewAt: '2026-10-01T00:00:00.000Z', reviewCount: 1,
        correctCount: 1, lastReviewedAt: new Date().toISOString(),
      })
      await client.saveActiveSession({
        id: 'active-session:en', language: 'en', wordIds: ['en:form'], newWordIds: [],
        reviewWordIds: ['en:form'], currentIndex: 0, phase: 'quiz', correctCount: 0,
        answeredCount: 0, startedAt: new Date().toISOString(),
      })
    }, { vocabularySeeds: { en: words } })
    const choices = await screen.findByRole('group', { name: '选择释义' })
    expect(within(choices).getAllByRole('button')).toHaveLength(4)
    expect(within(choices).queryByRole('button', { name: '释义1' })).not.toBeInTheDocument()
    const order = within(choices).getAllByRole('button').map((button) => button.textContent)
    await waitFor(() => expect(play).toHaveBeenCalledTimes(1))
    await user.click(screen.getByRole('button', { name: '播放 form 发音' }))
    await waitFor(() => expect(play).toHaveBeenCalledTimes(2))
    cleanup()
    render(<MemoryRouter initialEntries={['/study']}><App storageClient={storage} /></MemoryRouter>)
    const resumed = await screen.findByRole('group', { name: '选择释义' })
    expect(within(resumed).getAllByRole('button').map((button) => button.textContent)).toEqual(order)
  })

  it('uses spelling rather than an incomplete English choice list', async () => {
    const user = userEvent.setup()
    const go: VocabularyEntry = { id: 'en:go', language: 'en', term: 'go', meaningZh: '去', partOfSpeech: 'v.', category: '高考 3500', examples: [] }
    await renderApp('/study', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', enableSpelling: false })
      await client.saveActiveSession({
        id: 'active-session:en', language: 'en', wordIds: ['en:go'], newWordIds: [],
        reviewWordIds: ['en:go'], currentIndex: 0, phase: 'quiz', correctCount: 0,
        answeredCount: 0, startedAt: new Date().toISOString(),
      })
    }, { vocabularySeeds: { en: [go] } })
    await user.type(await screen.findByLabelText('英语'), 'go')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    expect(await screen.findByRole('status')).toHaveTextContent('正确')
  })

  it('keeps English choices operable when automatic audio is rejected', async () => {
    const user = userEvent.setup()
    const play = vi.spyOn(pronunciationPlayer, 'play').mockRejectedValue(new Error('autoplay blocked'))
    const words = ['form', 'from', 'farm', 'foam'].map((term, index): VocabularyEntry => ({
      id: `en:${term}`, language: 'en', term, meaningZh: `释义${index}`,
      partOfSpeech: 'n.', category: '高考 3500', examples: [],
    }))
    await renderApp('/study', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en', enableSpelling: false })
      await client.saveActiveSession({
        id: 'active-session:en', language: 'en', wordIds: ['en:form'], newWordIds: [],
        reviewWordIds: ['en:form'], currentIndex: 0, phase: 'quiz', correctCount: 0,
        answeredCount: 0, startedAt: new Date().toISOString(),
      })
    }, { vocabularySeeds: { en: words } })
    const choices = await screen.findByRole('group', { name: '选择释义' })
    await waitFor(() => expect(play).toHaveBeenCalledOnce())
    expect(within(choices).getAllByRole('button')).toHaveLength(4)
    await user.click(within(choices).getByRole('button', { name: '释义0' }))
    expect(await screen.findByRole('status')).toHaveTextContent('正确')
  })

  it('never autoplays a Spanish quiz prompt', async () => {
    const play = vi.spyOn(pronunciationPlayer, 'play').mockResolvedValue(undefined)
    await renderApp('/study', async (client) => {
      await client.saveActiveSession({
        id: 'active-session:es', language: 'es', wordIds: [databaseWord.id], newWordIds: [],
        reviewWordIds: [databaseWord.id], currentIndex: 0, phase: 'quiz', correctCount: 0,
        answeredCount: 0, startedAt: new Date().toISOString(),
      })
    }, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    expect(await screen.findByText('选择正确的中文意思')).toBeInTheDocument()
    expect(play).not.toHaveBeenCalled()
  })
  it('filters the learned vocabulary including fluent words and keeps search active', async () => {
    const user = userEvent.setup()
    const go: VocabularyEntry = {
      id: 'en:go', language: 'en', term: 'go', partOfSpeech: 'v.', meaningZh: '去',
      category: '高考 3500', examples: [], relatedTerms: ['move'],
      specialForms: [{ label: '过去式', form: 'went' }],
    }
    const stay = { ...go, id: 'en:stay', term: 'stay', meaningZh: '停留' }
    await renderApp('/library', async (client) => {
      await client.putProgress({
        wordId: 'en:go', language: 'en', stage: 4, status: 'mastered', skipReview: true,
        nextReviewAt: '2026-10-01T00:00:00.000Z', reviewCount: 1, correctCount: 1,
        lastReviewedAt: '2026-09-26T00:00:00.000Z',
      })
    }, { vocabularySeeds: { en: [go, stay] } })
    await user.click(await screen.findByRole('button', { name: '英语' }))
    await user.click(await screen.findByRole('button', { name: '已背' }))
    expect(screen.getByText('go')).toBeInTheDocument()
    expect(screen.queryByText('stay')).not.toBeInTheDocument()
    await user.type(screen.getByRole('searchbox', { name: '搜索词库' }), '停留')
    expect(screen.queryByText('go')).not.toBeInTheDocument()
    await user.clear(screen.getByRole('searchbox', { name: '搜索词库' }))
    await user.click(screen.getByText('go'))
    expect(screen.getByText('已标为熟练 · 无需复习')).toBeInTheDocument()
  })

  it('shows a learned-list empty state scoped to the current language', async () => {
    const user = userEvent.setup()
    await renderApp('/library')
    await user.click(await screen.findByRole('button', { name: '已背' }))
    expect(screen.getByText('还没有背过单词')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '英语' }))
    expect(screen.getByText('还没有背过单词')).toBeInTheDocument()
  })

  it('shows English related words and special forms after reveal but omits empty sections', async () => {
    const user = userEvent.setup()
    const go: VocabularyEntry = {
      id: 'en:go', language: 'en', term: 'go', partOfSpeech: 'v.', meaningZh: '去',
      category: '高考 3500', examples: [{ text: 'Go home.', translationZh: '回家。' }], relatedTerms: ['move'],
      specialForms: [{ label: '过去式', form: 'went' }],
      source: { provider: '词典', url: 'https://example.test/go' },
    }
    await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, learningLanguage: 'en' })
    }, { vocabularySeeds: { en: [go] } })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'go' })).toHaveAttribute('lang', 'en')
    expect(screen.queryByText(/近义词/)).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: '点击查看释义' }))
    expect(screen.getByText('近义词：move')).toBeInTheDocument()
    expect(screen.getByText('特殊变形：过去式 went')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '词形资料来源' })).toHaveAttribute('href', 'https://example.test/go')
    expect(screen.getByText('Go home.').compareDocumentPosition(screen.getByText('近义词：move')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
  it('splits a twenty-word target into two manually started groups', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 20 })
    })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect((await storage.getActiveSession('es'))?.wordIds).toHaveLength(10)
    for (let index = 0; index < 10; index += 1) {
      await user.click(await screen.findByRole('button', { name: '标为熟练' }))
    }
    expect(await screen.findByRole('button', { name: '开始下一组' })).toBeInTheDocument()
    expect((await storage.getSessions('es'))[0].newCount).toBe(10)
    await user.click(screen.getByRole('button', { name: '开始下一组' }))
    await waitFor(async () => expect((await storage.getActiveSession('es'))?.wordIds).toHaveLength(10))
  })

  it('repeats failed new words immediately and resumes a delayed revisit', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    await user.click(await screen.findByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '忘记' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '点击查看释义' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '认识' }))
    expect((await storage.getActiveSession('es'))?.phase).toBe('learn')
    await user.click(screen.getByRole('button', { name: '结束' }))
    cleanup()
    render(<MemoryRouter initialEntries={['/today']}><App storageClient={storage} /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '继续今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '认识' }))
    expect(await screen.findByText('选择正确的中文意思')).toBeInTheDocument()
  })

  it('resumes a legacy in-progress session without a practice queue', async () => {
    const user = userEvent.setup()
    const secondWord = { ...databaseWord, id: 'database-02', term: 'continuar', spanish: 'continuar', meaningZh: '继续', chinese: '继续' }
    const storage = await renderApp('/today', async (client) => {
      await client.saveActiveSession({
        id: 'active-session:es', language: 'es', wordIds: [databaseWord.id, secondWord.id],
        newWordIds: [databaseWord.id, secondWord.id], reviewWordIds: [], currentIndex: 1,
        phase: 'learn', correctCount: 0, answeredCount: 0, startedAt: new Date().toISOString(),
      })
    }, { vocabularySeed: [databaseWord, secondWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '继续今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'continuar' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '认识' }))
    expect((await storage.getActiveSession('es'))?.practice?.pendingIds).toEqual([databaseWord.id, secondWord.id])
  })

  it('does not promote a failed due review after later successful attempts', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 5, enableChoice: false })
      await client.putProgress({
        wordId: databaseWord.id, language: 'es', stage: 2, status: 'learning',
        nextReviewAt: '2020-01-01T00:00:00.000Z', reviewCount: 1,
        correctCount: 1, lastReviewedAt: '2020-01-01T00:00:00.000Z',
      })
    }, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    await user.type(await screen.findByLabelText('西班牙语'), 'incorrecto')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    await user.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByLabelText('西班牙语')).toHaveValue('')
    await user.type(screen.getByLabelText('西班牙语'), 'persistir')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    await user.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByLabelText('西班牙语')).toHaveValue('')
    await user.type(screen.getByLabelText('西班牙语'), 'persistir')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    await user.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByText('0%')).toBeInTheDocument()
    expect((await storage.getAllProgress('es'))[0].stage).toBe(0)
  })

  it('keeps a first wrong answer in accuracy when its word is later marked fluent', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, enableChoice: false })
      await client.putProgress({
        wordId: databaseWord.id, language: 'es', stage: 1, status: 'learning',
        nextReviewAt: '2020-01-01T00:00:00.000Z', reviewCount: 1,
        correctCount: 1, lastReviewedAt: '2020-01-01T00:00:00.000Z',
      })
    }, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    await user.type(await screen.findByLabelText('西班牙语'), 'wrong')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    await user.click(screen.getByRole('button', { name: '继续' }))
    await user.click(await screen.findByRole('button', { name: '标为熟练' }))
    expect(await screen.findByRole('heading', { name: '0%' })).toBeInTheDocument()
    expect((await storage.getSessions('es'))[0]).toMatchObject({ correctCount: 0, totalCount: 1 })
  })

  it('saves quiz feedback before Continue and restores it after a restart', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', async (client) => {
      await client.saveSettings({ ...DEFAULT_SETTINGS, enableChoice: false })
      await client.putProgress({
        wordId: databaseWord.id, language: 'es', stage: 2, status: 'learning',
        nextReviewAt: '2020-01-01T00:00:00.000Z', reviewCount: 1,
        correctCount: 1, lastReviewedAt: '2020-01-01T00:00:00.000Z',
      })
    }, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    await user.type(await screen.findByLabelText('西班牙语'), 'wrong')
    await user.click(screen.getByRole('button', { name: '检查答案' }))
    expect(await screen.findByRole('status')).toHaveTextContent('再记一次')
    await waitFor(async () => expect((await storage.getActiveSession('es'))?.quizFeedback).toMatchObject({ correct: false, selected: 'wrong' }))
    expect((await storage.getAllProgress('es'))[0].stage).toBe(0)
    cleanup()
    render(<MemoryRouter initialEntries={['/study']}><App storageClient={storage} /></MemoryRouter>)
    expect(await screen.findByRole('status')).toHaveTextContent('再记一次')
    expect(screen.getByLabelText('西班牙语')).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '继续' }))
    expect(await screen.findByLabelText('西班牙语')).toHaveValue('')
    expect((await storage.getActiveSession('es'))?.practice?.firstAnswers[databaseWord.id]).toBe(false)
  })

  it('reloads newer study state instead of overwriting a second tab', async () => {
    const user = userEvent.setup()
    const secondWord = { ...databaseWord, id: 'database-02', term: 'continuar', spanish: 'continuar', meaningZh: '继续', chinese: '继续' }
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord, secondWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    const active = (await storage.getActiveSession('es'))!
    await storage.saveActiveSession({
      ...active,
      revision: 1,
      practice: { ...active.practice!, pendingIds: [secondWord.id] },
    })
    await user.click(screen.getByRole('button', { name: '标为熟练' }))
    expect(await screen.findByRole('heading', { name: 'continuar' })).toBeInTheDocument()
    expect((await storage.getActiveSession('es'))?.practice?.pendingIds).toEqual([secondWord.id])
    expect((await storage.getAllProgress('es')).find((item) => item.wordId === databaseWord.id)).toBeUndefined()
  })
  it('shows a concrete recovery message when local data cannot be opened', async () => {
    class FailingStorage extends PalabraStorage {
      override async getAllProgress(): Promise<WordProgress[]> { throw new Error('IndexedDB unavailable') }
    }
    const client = new FailingStorage(`palabra-failing-${crypto.randomUUID()}`)
    storageClients.push(client)
    render(<MemoryRouter><App storageClient={client} /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: '无法读取学习数据' })).toBeInTheDocument()
    expect(screen.getByText('请刷新页面重试，或检查浏览器是否允许本地存储。')).toBeInTheDocument()
  })

  it('starts today’s session and reveals the first word meaning', async () => {
    const user = userEvent.setup()
    await renderApp()

    expect(await screen.findByRole('heading', { name: '今天' })).toBeInTheDocument()
    expect(screen.getByText('5 个新词')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '开始今天的学习' }))

    expect(await screen.findByRole('heading', { name: 'hola' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    expect(screen.getByText('你好')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '认识' })).toBeInTheDocument()
  })

  it('marks a word fluent from the study header, skips its quiz, and keeps it out of future sessions', async () => {
    const user = userEvent.setup()
    const secondWord = { ...databaseWord, id: 'database-02', term: 'continuar', spanish: 'continuar', meaningZh: '继续', chinese: '继续' }
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord, secondWord], vocabularyRevision: 42 })

    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '标为熟练' }))

    expect(await screen.findByRole('heading', { name: 'continuar' })).toBeInTheDocument()
    await waitFor(async () => expect((await storage.getAllProgress('es')).find((item) => item.wordId === 'database-01')?.skipReview).toBe(true))
    await user.click(screen.getByRole('button', { name: '结束' }))
    await waitFor(async () => expect(await storage.getActiveSession('es')).toMatchObject({ wordIds: ['database-02'] }))

    cleanup()
    render(<MemoryRouter initialEntries={['/today']}><App storageClient={storage} /></MemoryRouter>)
    await user.click(await screen.findByRole('button', { name: '继续今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'continuar' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'persistir' })).not.toBeInTheDocument()
  })

  it('finishes the session when its only word is marked fluent', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '标为熟练' }))

    expect(await screen.findByText('无需测试')).toBeInTheDocument()
    await expect(storage.getActiveSession('es')).resolves.toBeUndefined()
    expect((await storage.getAllProgress('es'))[0].skipReview).toBe(true)
  })

  it('does not count a word as unlearned when it is marked fluent during its quiz', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '认识' }))
    expect(await screen.findByText('选择正确的中文意思')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '标为熟练' }))

    expect(await screen.findByText('无需测试')).toBeInTheDocument()
    expect(screen.getByText('新学词').parentElement).toHaveTextContent('1')
    expect((await storage.getAllProgress('es'))[0].skipReview).toBe(true)
  })

  it('blocks competing study controls while the fluent mark is being saved', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })
    const originalComplete = storage.completeStudyGroup.bind(storage)
    let releaseWrite = () => {}
    const pendingWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
    const completeSpy = vi.spyOn(storage, 'completeStudyGroup').mockImplementation(async (completed, language, record) => {
      if (record?.skipReview) await pendingWrite
      await originalComplete(completed, language, record)
    })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '点击查看释义' }))
    await user.click(screen.getByRole('button', { name: '标为熟练' }))

    try {
      expect(screen.getByRole('button', { name: '认识' })).toBeDisabled()
      expect(screen.getByRole('button', { name: '结束' })).toBeDisabled()
    } finally {
      releaseWrite()
      completeSpy.mockRestore()
    }
    expect(await screen.findByText('无需测试')).toBeInTheDocument()
    expect((await storage.getAllProgress('es'))[0].skipReview).toBe(true)
  })

  it('keeps due reviews out of the new-word phase and reschedules them after a correct quiz', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today', async (client) => {
      await client.putProgress({
        wordId: 'basic-01',
        language: 'es',
        stage: 1,
        status: 'learning',
        nextReviewAt: '2020-01-01T00:00:00.000Z',
        reviewCount: 1,
        correctCount: 1,
        lastReviewedAt: '2020-01-01T00:00:00.000Z',
      })
    })
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))

    for (const word of ['adiós', 'gracias', 'por favor', 'sí', 'no']) {
      expect(await screen.findByRole('heading', { name: word })).toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: '点击查看释义' }))
      await user.click(screen.getByRole('button', { name: '认识' }))
    }

    expect(await screen.findByRole('heading', { name: 'hola' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '你好' }))
    await user.click(screen.getByRole('button', { name: '继续' }))
    await waitFor(async () => expect((await storage.getAllProgress()).find((item) => item.wordId === 'basic-01')?.stage).toBe(2))
  })

  it('searches the library in Chinese and Spanish', async () => {
    const user = userEvent.setup()
    await renderApp('/library')

    const search = await screen.findByRole('searchbox', { name: '搜索词库' })
    await user.type(search, '家庭')
    expect(screen.getByText('familia')).toBeInTheDocument()
    expect(screen.queryByText('aeropuerto')).not.toBeInTheDocument()
  })

  it('switches to the English database and keeps active sessions isolated by language', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/today')

    await user.click(await screen.findByRole('button', { name: '英语' }))
    expect(await screen.findByText('altitude')).toBeInTheDocument()
    await expect(storage.getSettings()).resolves.toMatchObject({ learningLanguage: 'en' })

    await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'altitude' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '结束' }))
    await user.click(await screen.findByRole('button', { name: '西班牙语' }))

    expect(await screen.findByText('hola')).toBeInTheDocument()
    await expect(storage.getActiveSession('en')).resolves.toMatchObject({ language: 'en' })
    await expect(storage.getActiveSession('es')).resolves.toBeUndefined()
  })

  it('searches English terms, meanings, and configured spelling variants', async () => {
    const user = userEvent.setup()
    await renderApp('/library')
    await user.click(await screen.findByRole('button', { name: '英语' }))

    const search = await screen.findByRole('searchbox', { name: '搜索词库' })
    await user.type(search, 'color')
    expect(await screen.findByText('colour')).toBeInTheDocument()
  })

  it('shows English IPA, pronunciation controls, and offline audio settings', async () => {
    const user = userEvent.setup()
    await renderApp('/today')
    await user.click(await screen.findByRole('button', { name: '英语' }))
    await user.click(screen.getByRole('button', { name: '开始今天的学习' }))

    expect(await screen.findByText('/ˈæltɪtud/')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '播放 altitude 发音' })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: '结束' }))
    await user.click(screen.getByRole('link', { name: '设置' }))
    expect(await screen.findByRole('heading', { name: '英语离线发音' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '下载离线发音包' })).toBeInTheDocument()
  })

  it('builds the library from vocabulary stored in IndexedDB', async () => {
    await renderApp('/library', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })

    expect(await screen.findByText('persistir')).toBeInTheDocument()
    expect(screen.getByText('1 个词')).toBeInTheDocument()
    expect(screen.queryByText('hola')).not.toBeInTheDocument()
  })

  it('builds today and study views from vocabulary stored in IndexedDB', async () => {
    const user = userEvent.setup()
    await renderApp('/today', undefined, { vocabularySeed: [databaseWord], vocabularyRevision: 42 })

    expect(await screen.findByText('persistir')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
    expect(await screen.findByRole('heading', { name: 'persistir' })).toBeInTheDocument()
  })

  it('applies and persists a manual dark theme', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/settings')

    await user.click(await screen.findByRole('radio', { name: '深色' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    await expect(storage.getSettings()).resolves.toMatchObject({ theme: 'dark' })
  })

  it('completes learning, choice and spelling steps through the result page', async () => {
    const user = userEvent.setup()
    const storage = await renderApp()
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))

    for (const word of ['hola', 'adiós', 'gracias', 'por favor', 'sí']) {
      expect(await screen.findByRole('heading', { name: word })).toBeInTheDocument()
      await user.click(await screen.findByRole('button', { name: '点击查看释义' }))
      await user.click(screen.getByRole('button', { name: '认识' }))
    }

    const answers = [
      { mode: 'choice', value: '你好' },
      { mode: 'spelling', value: 'adiós' },
      { mode: 'choice', value: '谢谢' },
      { mode: 'spelling', value: 'por favor' },
      { mode: 'choice', value: '是；对' },
    ]
    for (const [index, answer] of answers.entries()) {
      expect(await screen.findByText(`${index + 1} / ${answers.length}`)).toBeInTheDocument()
      if (answer.mode === 'choice') {
        await user.click(await screen.findByRole('button', { name: answer.value }))
      } else {
        await user.type(await screen.findByLabelText('西班牙语'), answer.value)
        await user.click(screen.getByRole('button', { name: '检查答案' }))
      }
      expect(await screen.findByRole('status')).toHaveTextContent('正确')
      await user.click(screen.getByRole('button', { name: '继续' }))
    }

    expect(await screen.findByRole('heading', { name: '100%' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '回到今日' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '回到今日' }))
    await user.click(await screen.findByRole('button', { name: '再学 5 个' }))
    await waitFor(async () => expect((await storage.getActiveSession())?.newWordIds).toHaveLength(5))
  })
})
