import { useState } from 'react'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { Turnstile } from './Turnstile'

afterEach(() => { cleanup(); vi.unstubAllEnvs(); vi.unstubAllGlobals() })

it('clears an earlier challenge error after recovery and disables submission again on expiry', async () => {
  vi.stubEnv('VITE_TURNSTILE_SITE_KEY', 'unit-test-sitekey')
  let callbacks: Record<string, unknown> | undefined
  vi.stubGlobal('turnstile', {
    render: (_element: HTMLElement, options: Record<string, unknown>) => { callbacks = options; return 'unit-widget' },
    remove: () => {},
  })
  function Form() {
    const [token, setToken] = useState('')
    return <><Turnstile onToken={setToken} /><button disabled={!token}>提交验证</button></>
  }
  render(<Form />)
  await waitFor(() => expect(callbacks).toBeDefined())
  act(() => (callbacks!['error-callback'] as () => void)())
  expect(screen.getByRole('alert')).toHaveTextContent('验证暂不可用')
  expect(screen.getByRole('button')).toBeDisabled()
  act(() => (callbacks!.callback as (token: string) => void)('unit-test-token'))
  expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  expect(screen.getByRole('button')).toBeEnabled()
  act(() => (callbacks!['expired-callback'] as () => void)())
  expect(screen.getByRole('alert')).toHaveTextContent('验证已过期')
  expect(screen.getByRole('button')).toBeDisabled()
})
