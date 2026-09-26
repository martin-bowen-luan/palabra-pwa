// @vitest-environment node
import { describe, expect, it } from 'vitest'
import type { ConfigEnv, UserConfig } from 'vite'
import config from '../vite.config'

const resolve = config as (environment: ConfigEnv) => UserConfig

describe('Vite base path', () => {
  it('serves production preview from the same subpath as the build', () => {
    expect(resolve({ command: 'serve', mode: 'production', isPreview: true }).base).toBe('/palabra-pwa/')
  })

  it('keeps local development at the origin root', () => {
    expect(resolve({ command: 'serve', mode: 'development', isPreview: false }).base).toBe('/')
  })
})
