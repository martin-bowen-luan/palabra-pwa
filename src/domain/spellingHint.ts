export function buildSpellingHint(term: string, revealedCount: number) {
  const chars = [...term]
  const limit = Math.floor(chars.filter(char => /[a-z]/i.test(char)).length / 2)
  let remaining = Math.max(0, Math.min(limit, Math.floor(revealedCount)))
  const mask = chars.map(char => {
    if (!/[a-z]/i.test(char)) return char
    return remaining-- > 0 ? char : '_'
  }).join('')
  return { mask, limit }
}
