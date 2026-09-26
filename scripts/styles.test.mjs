import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme tokens', () => {
  it('uses the theme-aware ink variable for inherited text', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8')
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}'))
    expect(rootBlock).toContain('color: var(--ink);')
  })
})
