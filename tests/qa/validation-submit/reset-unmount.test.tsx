// @vitest-environment happy-dom
import { setImmediate } from 'node:timers/promises'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { createForm, defineEffects, Field, Form, Reset, type ValidateCtx } from '@shikiform/react'
import { afterEach, expect, it, vi } from 'vitest'
import { deferred } from './deferred'

afterEach(cleanup)

it('clears a pending JSX-only validator on unmount and ignores its later rejection', async () => {
  const entered = deferred<AbortSignal | undefined>()
  const validator = deferred<string>()
  const form = createForm({ initialValues: { name: 'Ada' } })
  const rules = { validator: (_value: unknown, { signal }: ValidateCtx) => {
    entered.resolve(signal)
    return validator.promise
  } }
  const view = render(<Form form={form}><Field name="name" rules={rules} /></Form>)
  let pending!: ReturnType<typeof form.validate>
  act(() => { pending = form.validate() })
  const signal = await entered.promise
  view.rerender(<Form form={form} />)

  const result = await Promise.race([pending, setImmediate('waiting for the removed validator')])
  validator.reject(new Error('Old JSX error'))
  await setImmediate()
  expect(result).toEqual({ name: 'Ada' })
  expect(signal?.aborted).toBe(true)
  expect(form.errors).toEqual([])
  expect(form.canSubmit).toBe(true)
})

it('passes restored and recomputed values to afterReset with validation state already cleared', () => {
  type Values = { qty: number; total: number }
  const form = createForm<Values>({
    initialValues: { qty: 2, total: 0 },
    effects: [
      defineEffects<Values>(({ reaction }) => {
        reaction((d) => { d.total.$value = d.qty.$value * 10 })
      }),
    ],
  })
  const afterReset = vi.fn((values: unknown) => ({ values, errors: form.errors, dirty: form.dirty }))
  render(<Form form={form}><Reset afterReset={afterReset}>Restore</Reset></Form>)
  act(() => {
    form.setValue('qty', 5)
    form.setErrors({ qty: 'Review the quantity' })
  })
  expect(form.dirty).toBe(true)
  expect(form.errors).toEqual([{ path: 'qty', messages: ['Review the quantity'] }])

  fireEvent.click(screen.getByRole('button', { name: 'Restore' }))
  expect(afterReset).toHaveBeenCalledExactlyOnceWith({ qty: 2, total: 20 })
  expect(afterReset).toHaveReturnedWith({ values: { qty: 2, total: 20 }, errors: [], dirty: false })
})
