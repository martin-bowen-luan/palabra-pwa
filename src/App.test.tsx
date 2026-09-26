import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { DEFAULT_SETTINGS, PalabraStorage } from './data/storage'
import type { VocabularyEntry, WordProgress } from './types'

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
    for (const answer of answers) {
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
