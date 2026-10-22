import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import App from '../App'
import { DEFAULT_SETTINGS, PalabraStorage } from '../data/storage'
import { buildSpanishGroup, createSpanishSession, scheduleSpanishReview } from './course'
import { spanishFixture } from './fixtures'
import type { SpanishDailyRecord } from './sessionTypes'

const now = new Date('2026-10-22T12:00:00')
const today = '2026-10-22'
const tomorrow = new Date('2026-10-23T12:00:00')
const day: SpanishDailyRecord = { id: today, entries: {} }
const review = { ...spanishFixture('es:review', 'hablo', 'hablar'), category: '动作' }
const fresh = { ...spanishFixture('es:fresh', 'pan', 'pan'), category: '饮食' }
const other = { ...spanishFixture('es:other', 'tren', 'tren'), category: '出行' }
const due = scheduleSpanishReview(undefined, review.id, 'skipped', new Date('2026-10-21T12:00:00'))
const clients: PalabraStorage[] = []

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(now) })
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.useRealTimers(); clients.forEach(db => db.close()); clients.length = 0 })

function mount(db: PalabraStorage, route = '/today') {
  return render(<MemoryRouter initialEntries={[route]}><App storageClient={db} /></MemoryRouter>)
}
async function setup(words = [review, fresh, other]) {
  const db = new PalabraStorage(`es-defer-${crypto.randomUUID()}`, { vocabularySeeds: { es: words, en: [] } })
  clients.push(db)
  await db.saveSettings({ ...DEFAULT_SETTINGS, spanishDailyGoal: 50, spanishNewCategory: '饮食' })
  await db.putProgress(due)
  mount(db)
  await screen.findByRole('heading', { name: '今天' })
  return { db, user: userEvent.setup() }
}
async function defer(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: '今天先学新词' }))
  await screen.findByRole('button', { name: '恢复复习优先' })
}

it('temporarily excludes due words only from learning, without changing progress or daily counts', () => {
  const progress = { [review.id]: due }, original = structuredClone(progress)
  const plan = buildSpanishGroup([review, fresh, other], progress, day, 50, now, false, 'learn', '饮食', today)
  expect(plan.all.map(w => w.id)).toEqual(['es:fresh'])
  expect(plan.review).toEqual([])
  expect(progress).toEqual(original)
  expect(day.entries).toEqual({})
  expect(buildSpanishGroup([review, fresh], progress, day, 50, now, false, 'review', '饮食', today).all.map(w => w.id)).toEqual(['es:review'])
  expect(buildSpanishGroup([review, fresh], progress, { id: '2026-10-23', entries: {} }, 50, tomorrow, false, 'learn', '饮食', today).all.map(w => w.id)).toEqual(['es:review', 'es:fresh'])
})

it('keeps the ten-unit group, daily cap and family limits while deferring, with no review fallback', () => {
  const words = [review, fresh, { ...fresh, id: 'es:fresh-plural' }, ...Array.from({ length: 12 }, (_, i) => spanishFixture(`es:n${i}`, `n${i}`, `family${i}`))]
  const progress = { [review.id]: due }
  const plan = buildSpanishGroup(words, progress, day, 50, now, false, 'learn', '', today)
  expect(plan.all.map(w => w.id)).toEqual(['es:fresh', ...Array.from({ length: 9 }, (_, i) => `es:n${i}`)])
  const almostFull = { id: today, entries: Object.fromEntries(Array.from({ length: 49 }, (_, i) => [`seen${i}`, { kind: 'review' as const, lemmaId: `seen${i}`, outcome: 'remembered' as const, at: now.toISOString() }])) }
  expect(buildSpanishGroup(words, progress, almostFull, 50, now, false, 'learn', '', today).all.map(w => w.id)).toEqual(['es:fresh'])
  expect(buildSpanishGroup([review], progress, day, 50, now, true, 'learn', '', today).all).toEqual([])
})

it('persists the daily choice across reopening and starts selected-category new words without touching due records', async () => {
  const { db, user } = await setup()
  await defer(user)
  expect((await db.getSettings()).spanishReviewDeferredOn).toBe(today)
  expect(await db.getAllProgress('es')).toEqual([due])
  expect((await db.getSpanishDay(today))?.entries ?? {}).toEqual({})
  expect(screen.getByText('1 个已到期')).toBeVisible()
  cleanup(); db.close(); mount(db)
  expect(await screen.findByRole('button', { name: '恢复复习优先' })).toHaveAttribute('aria-pressed', 'true')
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:fresh'])
  expect(await db.getAllProgress('es')).toEqual([due])
})

it('restores review priority explicitly and automatically the next local day without reloading', async () => {
  const { db, user } = await setup()
  await defer(user)
  await user.click(screen.getByRole('button', { name: '恢复复习优先' }))
  await screen.findByRole('button', { name: '今天先学新词' })
  expect((await db.getSettings()).spanishReviewDeferredOn).toBeUndefined()
  await defer(user)
  vi.setSystemTime(tomorrow)
  act(() => { window.dispatchEvent(new Event('focus')) })
  await screen.findByRole('button', { name: '今天先学新词' })
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:review', 'es:fresh'])
  expect(await db.getAllProgress('es')).toEqual([due])
})

it('allows an explicit review session even while automatic review is deferred', async () => {
  const { db, user } = await setup()
  await defer(user)
  await user.click(screen.getByRole('button', { name: '只复习到期词' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:review'])
})

it('preserves a current group and its draft when deferring, applying only to later groups', async () => {
  const { db, user } = await setup()
  cleanup()
  const session = createSpanishSession({ all: [review], newWords: [], review: [review] }, now)
  session.spanish!.draft = 'ha'
  await db.createActiveSession(session)
  mount(db); await screen.findByRole('button', { name: '继续本组' })
  await defer(user)
  expect(await db.getActiveSession('es')).toEqual(session)
  await user.click(screen.getByRole('button', { name: '继续本组' }))
  expect(await screen.findByRole('textbox', { name: '填写缺少的西语词' })).toHaveValue('ha')
})

it('does not start a review-filled group when no selected new words remain, and supports restoration', async () => {
  const { db, user } = await setup([review])
  await defer(user)
  expect(screen.getByRole('button', { name: '开始今天的学习' })).toBeDisabled()
  expect(screen.getByText(/当前范围暂无可安排的新词/)).toBeVisible()
  await user.click(screen.getByRole('button', { name: '恢复复习优先' }))
  await waitFor(() => expect(screen.getByRole('button', { name: '开始今天的学习' })).toBeEnabled())
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:review'])
})

it('reports a failed preference save and keeps review priority unchanged', async () => {
  const { db, user } = await setup()
  vi.spyOn(db, 'saveSettings').mockRejectedValueOnce(new Error('quota'))
  await user.click(screen.getByRole('button', { name: '今天先学新词' }))
  expect(await screen.findByRole('alert')).toHaveTextContent('未保存')
  expect(screen.getByRole('button', { name: '今天先学新词' })).toHaveAttribute('aria-pressed', 'false')
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:review', 'es:fresh'])
})

it('waits for a pending deferral save across navigation before starting a new group', async () => {
  const { db, user } = await setup()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const save = db.saveSettings.bind(db)
  vi.spyOn(db, 'saveSettings').mockImplementationOnce(async settings => { await gate; await save(settings) })
  try {
    await user.click(screen.getByRole('button', { name: '今天先学新词' }))
    await user.click(screen.getByRole('link', { name: '词库' }))
    await user.click(screen.getByRole('link', { name: '今日' }))
    await user.click(await screen.findByRole('button', { name: '开始今天的学习' }))
  } finally { release() }
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:fresh'])
})

it.each(['es-cloze:completed', 'legacy-completed'])('does not offer a review-only next learning group on results: %s', async id => {
  const { db, user } = await setup()
  await defer(user)
  await db.putProgress(scheduleSpanishReview(undefined, fresh.id, 'fluent', now))
  await db.putSession({ id, language: 'es', mode: 'learn', date: today, newCount: 1, reviewCount: 0, correctCount: 1, totalCount: 1, durationSeconds: 30, completed: true })
  cleanup(); mount(db, '/result')
  await screen.findByRole('button', { name: '回到今日' })
  expect(screen.queryByRole('button', { name: '开始下一组' })).not.toBeInTheDocument()
  expect(await db.getAllProgress('es')).toContainEqual(due)
})

it('keeps later groups new-only after completing the current group', async () => {
  const plural = { ...spanishFixture('es:plural', 'panes', 'pan'), category: '饮食' }
  const { db, user } = await setup([review, fresh, plural])
  await defer(user)
  await user.click(screen.getByRole('button', { name: '开始今天的学习' }))
  await user.type(await screen.findByRole('textbox', { name: '填写缺少的西语词' }), 'pan')
  await user.click(screen.getByRole('button', { name: '检查答案' }))
  await user.click(await screen.findByRole('button', { name: '继续' }))
  await user.click(await screen.findByRole('button', { name: '开始下一组' }))
  await screen.findByRole('textbox', { name: '填写缺少的西语词' })
  expect((await db.getActiveSession('es'))?.wordIds).toEqual(['es:plural'])
  expect((await db.getSpanishDay(today)).entries).toMatchObject({ 'es:fresh': { kind: 'new', outcome: 'remembered' } })
  expect((await db.getSpanishDay(today)).entries['es:review']).toBeUndefined()
  expect(await db.getAllProgress('es')).toContainEqual(due)
})
