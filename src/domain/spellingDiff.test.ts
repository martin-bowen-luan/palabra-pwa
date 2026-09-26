import { describe, expect, it } from 'vitest'
import { spellingDiff } from './spellingDiff'
describe('spelling error comparison', () => {
  it('aligns a missing run without highlighting the correct suffix', () => {
    const diff = spellingDiff('entertament', 'entertainment')
    expect(diff.filter(p => p.kind === 'missing').map(p => p.expected).join('')).toBe('in')
    expect(diff.filter(p => p.kind === 'equal').map(p => p.expected).join('')).toBe('entertament')
  })
  it('reports extra and changed letters and respects case normalization', () => {
    expect(spellingDiff(' catt ', 'cat').filter(p => p.kind === 'extra')).toHaveLength(1)
    expect(spellingDiff('cot', 'cat').find(p => p.kind === 'changed')).toMatchObject({ actual: 'o', expected: 'a' })
    expect(spellingDiff('CAT', 'cat').every(p => p.kind === 'equal')).toBe(true)
  })
})
