import { describe, expect, it } from 'vitest'
import { advancePractice, createPracticeQueue, currentPracticeWord, removePracticeWord } from './practiceQueue'

describe('practice queue', () => {
  it('repeats an incorrect word now and recalls it after three other words', () => {
    let queue = createPracticeQueue(['a', 'b', 'c', 'd', 'e'])
    queue = advancePractice(queue, false)
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBe('b')
    for (const word of ['b', 'c', 'd']) {
      expect(currentPracticeWord(queue)).toBe(word)
      queue = advancePractice(queue, true)
    }
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBe('e')
    expect(queue.firstAnswers.a).toBe(false)
  })

  it('retries a failed recall and requires another recall after it is answered', () => {
    let queue = createPracticeQueue(['a', 'b'])
    queue = advancePractice(queue, false)
    queue = advancePractice(queue, true)
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, false)
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBeUndefined()
  })

  it('finishes a single-word group without waiting for nonexistent intervening words', () => {
    let queue = createPracticeQueue(['a'])
    queue = advancePractice(queue, false)
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBe('a')
    queue = advancePractice(queue, true)
    expect(currentPracticeWord(queue)).toBeUndefined()
  })

  it('removes a fluent word from both current and delayed positions', () => {
    let queue = createPracticeQueue(['a', 'b'])
    queue = advancePractice(queue, false)
    queue = advancePractice(queue, true)
    queue = removePracticeWord(queue, 'a')
    expect(queue.delayed).toEqual([])
    expect(currentPracticeWord(queue)).toBe('b')
    expect(queue.firstAnswers.a).toBeUndefined()
    expect(currentPracticeWord(removePracticeWord(queue, 'b'))).toBeUndefined()
  })

  it('keeps a pending recall and prompt identity after JSON persistence', () => {
    let queue = createPracticeQueue(['a', 'b', 'c'])
    queue = advancePractice(queue, false)
    queue = advancePractice(queue, true)
    const restored = JSON.parse(JSON.stringify(queue))
    expect(currentPracticeWord(restored)).toBe('b')
    expect(restored.delayed).toEqual([{ wordId: 'a', remaining: 3 }])
    expect(restored.promptNumber).toBe(2)
  })
})
