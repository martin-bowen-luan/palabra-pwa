import { normalizeSpelling } from './reviewScheduler'
export interface SpellingPart { actual: string; expected: string; kind: 'equal' | 'missing' | 'extra' | 'changed' }

export function spellingDiff(input: string, target: string): SpellingPart[] {
  const a = Array.from(normalizeSpelling(input).normalize('NFC'))
  const b = Array.from(normalizeSpelling(target).normalize('NFC'))
  const costs = Array.from({ length: a.length + 1 }, (_, i) => Array.from({ length: b.length + 1 }, (_, j) => i ? j ? 0 : i : j))
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    costs[i][j] = Math.min(costs[i - 1][j] + 1, costs[i][j - 1] + 1, costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1]))
  }
  const parts: SpellingPart[] = []
  let i = a.length, j = b.length
  while (i || j) {
    if (i && j && costs[i][j] === costs[i - 1][j - 1] + Number(a[i - 1] !== b[j - 1])) {
      parts.push({ actual: a[--i], expected: b[--j], kind: a[i] === b[j] ? 'equal' : 'changed' })
    } else if (j && costs[i][j] === costs[i][j - 1] + 1) parts.push({ actual: '', expected: b[--j], kind: 'missing' })
    else parts.push({ actual: a[--i], expected: '', kind: 'extra' })
  }
  return parts.reverse()
}

export function closestSpelling(input: string, term: string, variants: string[] = []): string {
  return [term, ...variants].sort((a, b) => spellingDiff(input, a).filter(p => p.kind !== 'equal').length - spellingDiff(input, b).filter(p => p.kind !== 'equal').length)[0]
}
