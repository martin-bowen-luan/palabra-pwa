import { afterEach, describe, expect, it, vi } from 'vitest'
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

  it('marks a word fluent from the study header, skips its quiz, and keeps it out of future sessions', async () => {
    const user = userEvent.setup()
    const secondWord = { ...databaseWord, id: 'database-02', term: 'continuar', spanish: 'continuar' }
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
    const originalPut = storage.putProgress.bind(storage)
    let releaseWrite = () => {}
    const pendingWrite = new Promise<void>((resolve) => { releaseWrite = resolve })
    const putSpy = vi.spyOn(storage, 'putProgress').mockImplementation(async (record) => {
      if (record.skipReview) await pendingWrite
      await originalPut(record)
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
      putSpy.mockRestore()
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
