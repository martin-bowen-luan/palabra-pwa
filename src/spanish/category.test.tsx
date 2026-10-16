import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { PalabraStorage, DEFAULT_SETTINGS } from '../data/storage'
import { spanishFixture } from './fixtures'
import { buildSpanishGroup, createSpanishSession, scheduleSpanishReview } from './course'

const food = { ...spanishFixture('food', 'pan', 'pan'), category: '饮食' }
const travel = { ...spanishFixture('travel', 'tren', 'tren'), category: '地点与出行' }
const foodForm = { ...spanishFixture('food-form', 'panes', 'pan'), category: '饮食' }
const words = [travel, food, foodForm]
const now = new Date('2026-10-16T10:00:00Z')
const day = { id: '2026-10-16', entries: {} }
const clients: PalabraStorage[] = []
afterEach(() => { cleanup(); vi.restoreAllMocks(); clients.forEach(db => db.close()); clients.length = 0 })

it('limits new words to the selected existing category, without excluding overdue words', () => {
  const progress = { travel: scheduleSpanishReview(undefined, 'travel', 'skipped', new Date('2026-10-15')) }
  const plan = buildSpanishGroup(words, progress, day, 50, now, false, 'learn', '饮食')
  expect(plan.review.map(w => w.id)).toEqual(['travel'])
  expect(plan.newWords.map(w => w.id)).toEqual(['food'])
  const next = buildSpanishGroup(words, { ...progress, food: { ...progress.travel, wordId: 'food', nextReviewAt: '2026-10-20' } }, day, 50, now, false, 'learn', '饮食')
  expect(next.newWords.map(w => w.id)).toEqual(['food-form'])
  expect(buildSpanishGroup(words, {}, day, 50, now, false, 'learn', '饮食').all.map(w => w.id)).toEqual(['food'])
})

it('does not silently fill an exhausted or removed category with unrelated new words', () => {
  const progress = { food: scheduleSpanishReview(undefined, 'food', 'fluent', now), 'food-form': scheduleSpanishReview(undefined, 'food-form', 'fluent', now) }
  expect(buildSpanishGroup(words, progress, day, 50, now, true, 'learn', '饮食').all).toEqual([])
  expect(buildSpanishGroup(words, {}, day, 50, now, false, 'learn', '已移除类别').all).toEqual([])
  expect(buildSpanishGroup(words, progress, day, 50, now, false, 'learn', '').newWords.map(w => w.id)).toEqual(['travel'])
  expect(buildSpanishGroup(words, {}, day, 50, now, false, 'review', '饮食').all).toEqual([])
})

function mount(db: PalabraStorage, route = '/today') {
  return render(<MemoryRouter initialEntries={[route]}><App storageClient={db} /></MemoryRouter>)
}
async function database() {
  const db = new PalabraStorage(`es-category-${crypto.randomUUID()}`, { vocabularySeeds: { es: words, en: [] } })
  clients.push(db)
  await db.saveSettings({ ...DEFAULT_SETTINGS, spanishDailyGoal: 50 })
  return db
}

it('starts category learning from the library, persists it and keeps shared progress', async () => {
  const db = await database(), user = userEvent.setup()
  const mastered = scheduleSpanishReview(undefined, 'travel', 'fluent', now)
  await db.putProgress(mastered)
  mount(db, '/library')
  await user.click(await screen.findByRole('button', { name: '饮食' }))
  await user.click(screen.getByRole('button', { name: '学习此类别' }))
  expect(await screen.findByRole('combobox', { name: '新词学习类别' })).toHaveValue('饮食')
  expect(screen.getByText('2 个待学词形')).toBeVisible()
  cleanup(); mount(db)
  expect(await screen.findByRole('combobox', { name: '新词学习类别' })).toHaveValue('饮食')
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['food'])
  expect(await db.getAllProgress('es')).toEqual([mastered])
})

it('preserves an active group when the category changes and restores it on restart', async () => {
  const db = await database(), user = userEvent.setup()
  const session = createSpanishSession({ all: [travel], newWords: [travel], review: [] })
  session.spanish!.draft = 'tr'
  await db.createActiveSession(session)
  mount(db)
  await user.selectOptions(await screen.findByRole('combobox', { name: '新词学习类别' }), '饮食')
  await waitFor(async () => expect((await db.getSettings()).spanishNewCategory).toBe('饮食'))
  expect(await db.getActiveSession('es')).toEqual(session)
  cleanup(); mount(db)
  await user.click(await screen.findByRole('button', { name: '继续本组' }))
  expect(await screen.findByRole('textbox', { name: '填写缺少的西语词' })).toHaveValue('tr')
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['travel'])
})

it('settings and home share the same category and all restores the full new-word pool', async () => {
  const db = await database(), user = userEvent.setup()
  mount(db, '/settings')
  await user.selectOptions(await screen.findByRole('combobox', { name: '新词学习类别' }), '饮食')
  await user.click(screen.getByRole('link', { name: '今日' }))
  expect(await screen.findByRole('combobox', { name: '新词学习类别' })).toHaveValue('饮食')
  await user.selectOptions(screen.getByRole('combobox', { name: '新词学习类别' }), '')
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['travel', 'food'])
})

it('waits for an in-flight category save even after navigating from settings to today', async () => {
  const db = await database(), user = userEvent.setup()
  mount(db, '/settings')
  const select = await screen.findByRole('combobox', { name: '新词学习类别' })
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const save = db.saveSettings.bind(db)
  vi.spyOn(db, 'saveSettings').mockImplementationOnce(async settings => { await gate; await save(settings) })
  try {
    await user.selectOptions(select, '饮食')
    await user.click(screen.getByRole('link', { name: '今日' }))
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
  } finally { release() }
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['food'])
})
