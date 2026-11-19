// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import App from '../docs-site/src/content/docs/tutorial/_files/03-path'

afterEach(() => cleanup())

it('resetting the submit tutorial clears the previous JSON', async () => {
  const view = render(<App />)
  fireEvent.change(screen.getByLabelText(/^密码/), { target: { value: 'secret123' } })
  await act(async () => {
    fireEvent.submit(view.container.querySelector('form')!)
  })
  expect(view.container.querySelector('pre.shiki-code')?.textContent).toContain('secret123')
  fireEvent.click(screen.getByRole('button', { name: '重置表单' }))
  expect(view.container.querySelector('pre.shiki-code')).toBeNull()
})
