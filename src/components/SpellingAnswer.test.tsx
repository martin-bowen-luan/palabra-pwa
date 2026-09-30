import { cleanup, render } from '@testing-library/react'
import { it, expect, vi } from 'vitest'
import { SpellingAnswer } from './SpellingAnswer'
it('focuses the full answer without scrolling the document',()=>{
  const focus=vi.spyOn(HTMLElement.prototype,'focus')
  render(<SpellingAnswer answer="hola" language="es"/>)
  expect(focus).toHaveBeenCalledWith({preventScroll:true})
  cleanup();focus.mockRestore()
})
