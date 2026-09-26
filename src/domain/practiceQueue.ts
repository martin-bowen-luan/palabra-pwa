import type { PracticeQueue } from '../types'

export function createPracticeQueue(ids: string[]): PracticeQueue {
  return { pendingIds: [...ids], delayed: [], stateById: {}, firstAnswers: {}, promptNumber: 0 }
}

export function currentPracticeWord(queue: PracticeQueue): string | undefined {
  return queue.pendingIds[0]
}

function promoteDue(
  pendingIds: string[],
  delayed: PracticeQueue['delayed'],
): Pick<PracticeQueue, 'pendingIds' | 'delayed'> {
  const due = delayed.filter((item) => item.remaining <= 0)
  const waiting = delayed.filter((item) => item.remaining > 0)
  if (due.length) return { pendingIds: [...due.map((item) => item.wordId), ...pendingIds], delayed: waiting }
  if (!pendingIds.length && waiting.length) {
    return { pendingIds: [waiting[0].wordId], delayed: waiting.slice(1) }
  }
  return { pendingIds, delayed: waiting }
}

export function advancePractice(queue: PracticeQueue, correct: boolean): PracticeQueue {
  const wordId = currentPracticeWord(queue)
  if (!wordId) return queue
  const firstAnswers = wordId in queue.firstAnswers
    ? queue.firstAnswers
    : { ...queue.firstAnswers, [wordId]: correct }

  if (!correct) {
    return {
      ...queue,
      firstAnswers,
      stateById: { ...queue.stateById, [wordId]: 'retry' },
      promptNumber: queue.promptNumber + 1,
    }
  }

  const state = queue.stateById[wordId] ?? 'fresh'
  const stateById = { ...queue.stateById }
  if (state === 'retry') stateById[wordId] = 'revisit'
  else delete stateById[wordId]

  const advanced = queue.delayed.map((item) => ({
    ...item,
    remaining: item.wordId === wordId ? item.remaining : item.remaining - 1,
  }))
  if (state === 'retry') advanced.push({ wordId, remaining: 3 })
  const next = promoteDue(queue.pendingIds.slice(1), advanced)
  return {
    ...queue,
    ...next,
    stateById,
    firstAnswers,
    promptNumber: queue.promptNumber + 1,
  }
}

export function removePracticeWord(queue: PracticeQueue, wordId: string): PracticeQueue {
  const stateById = { ...queue.stateById }
  const firstAnswers = { ...queue.firstAnswers }
  delete stateById[wordId]
  delete firstAnswers[wordId]
  const remaining = promoteDue(
    queue.pendingIds.filter((id) => id !== wordId),
    queue.delayed.filter((item) => item.wordId !== wordId),
  )
  return { ...queue, ...remaining, stateById, firstAnswers, promptNumber: queue.promptNumber + 1 }
}
