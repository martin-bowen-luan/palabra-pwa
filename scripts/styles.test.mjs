import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

describe('theme tokens', () => {
  it('keeps light-mode supporting text at AA contrast on exercise paper', () => {
    const css = readFileSync(resolve('src/styles/global.css'), 'utf8')
    const root = css.slice(css.indexOf(':root {'), css.indexOf('}'))
    const luminance = hex => {
      const [r,g,b] = hex.match(/../g).map(value=>parseInt(value,16)/255).map(value=>value<=0.04045?value/12.92:((value+0.055)/1.055)**2.4)
      return 0.2126*r+0.7152*g+0.0722*b
    }
    const paper=luminance(root.match(/--paper: #([0-9a-f]{6})/)[1])
    const muted=luminance(root.match(/--muted: #([0-9a-f]{6})/)[1])
    expect((paper+0.05)/(muted+0.05)).toBeGreaterThanOrEqual(4.5)
  })
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
