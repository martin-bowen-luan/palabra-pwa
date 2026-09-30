import { render, screen, cleanup } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { StudyFrame } from './StudyFrame'
afterEach(cleanup)
it('separates controls and scrollable content and restores route scrolling', () => {
  const first = render(<StudyFrame label="学习" header={<button>结束</button>} actions={<button>检查答案</button>}><p>题目</p></StudyFrame>)
  expect(screen.getByRole('region',{name:'学习内容'})).toContainElement(screen.getByText('题目'))
  expect(screen.getByRole('region',{name:'答题操作'})).toContainElement(screen.getByText('检查答案'))
  const second = render(<StudyFrame label="另一组" header="头部">内容</StudyFrame>)
  first.unmount()
  expect(document.documentElement).toHaveAttribute('data-study-viewport')
  second.unmount()
  expect(document.documentElement).not.toHaveAttribute('data-study-viewport')
})
