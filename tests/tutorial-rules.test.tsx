// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import App from '../docs-site/src/content/docs/tutorial/_files/09-rules.solution'

afterEach(() => cleanup())

/** The message on screen. antd keeps the previous explain node while the next one appears. */
function feedback(label: string): string {
  const item = screen.getByText(label, { selector: 'label' }).closest('.ant-form-item')
  const current = item?.querySelector('.ant-form-show-help-item-appear-active') ?? item?.querySelector('.ant-form-item-explain-error')
  return current?.textContent ?? ''
}

async function submit(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
}

it('the tutorial answer judges an empty email and a cleared age only with 必填', async () => {
  const view = render(<App />)
  fireEvent.change(screen.getByRole('textbox', { name: /邮箱/ }), { target: { value: 'bad' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /年龄/ }), { target: { value: '17' } })
  await submit(view.container)
  expect(feedback('姓名')).toBe('必填')
  expect(feedback('邮箱')).toBe('邮箱格式不对')
  expect(feedback('年龄')).toBe('需要年满 18')

  fireEvent.change(screen.getByRole('textbox', { name: /邮箱/ }), { target: { value: '' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /年龄/ }), { target: { value: '' } })
  await submit(view.container)
  expect(feedback('邮箱')).toBe('必填')
  expect(feedback('年龄')).toBe('必填')
  expect(view.container.textContent).not.toContain('Invalid input')
  expect(view.container.textContent).not.toContain('expected number')

  fireEvent.change(screen.getByRole('textbox', { name: /姓名/ }), { target: { value: '张' } })
  await submit(view.container)
  expect(feedback('姓名')).toBe('至少 2 个字')

  fireEvent.change(screen.getByRole('textbox', { name: /姓名/ }), { target: { value: '张三' } })
  fireEvent.change(screen.getByRole('textbox', { name: /邮箱/ }), { target: { value: 'ada@example.com' } })
  fireEvent.change(screen.getByRole('spinbutton', { name: /年龄/ }), { target: { value: '18' } })
  await submit(view.container)
  const payload = view.container.querySelector('pre.shiki-code')?.textContent ?? ''
  expect(payload).toContain('"name": "张三"')
  expect(payload).toContain('"email": "ada@example.com"')
  expect(payload).toContain('"age": 18')
})
