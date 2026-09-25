import { afterEach, describe, expect, it } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from './App'
import { DEFAULT_SETTINGS, PalabraStorage } from './data/storage'

const databaseNames: string[] = []
const storageClients: PalabraStorage[] = []

afterEach(async () => {
  document.documentElement.removeAttribute('data-theme')
  storageClients.splice(0).forEach((client) => client.close())
  await Promise.all(databaseNames.splice(0).map((name) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase(name)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })))
})

async function renderApp(path = '/today') {
  const name = `palabra-app-${crypto.randomUUID()}`
  databaseNames.push(name)
  const storage = new PalabraStorage(name)
  storageClients.push(storage)
  await storage.saveSettings({ ...DEFAULT_SETTINGS, dailyNewWords: 5 })
  render(
    <MemoryRouter initialEntries={[path]}>
      <App storageClient={storage} />
    </MemoryRouter>,
  )
  return storage
}

describe('Palabra app', () => {
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

  it('searches the library in Chinese and Spanish', async () => {
    const user = userEvent.setup()
    await renderApp('/library')

    const search = await screen.findByRole('searchbox', { name: '搜索词库' })
    await user.type(search, '家庭')
    expect(screen.getByText('familia')).toBeInTheDocument()
    expect(screen.queryByText('aeropuerto')).not.toBeInTheDocument()
  })

  it('applies and persists a manual dark theme', async () => {
    const user = userEvent.setup()
    const storage = await renderApp('/settings')

    await user.click(await screen.findByRole('radio', { name: '深色' }))
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe('dark'))
    await expect(storage.getSettings()).resolves.toMatchObject({ theme: 'dark' })
  })
})
