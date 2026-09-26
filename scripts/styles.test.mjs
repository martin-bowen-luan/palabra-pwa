import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme tokens', () => {
  it('uses the theme-aware ink variable for inherited text', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8')
    const rootBlock = css.slice(css.indexOf(':root {'), css.indexOf('}'))
    expect(rootBlock).toContain('color: var(--ink);')
  })

  it('keeps category filters at least 44px tall on touch screens', () => {
    const css = readFileSync(resolve('src/styles/App.module.css'), 'utf8')
    expect(css).toMatch(/\.categoryRail button \{[^}]*min-height: 44px/)
    expect(css).toMatch(/\.searchBox input \{[^}]*height: 100%/)
  })
})
