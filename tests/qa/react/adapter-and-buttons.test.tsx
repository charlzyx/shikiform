// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { connect, createForm, Field, Form, mapProps, Reset, Submit, useFieldDecorator } from '@shikiform/react'

afterEach(cleanup)

it('formats and parses a registered control and validates its parsed value when the picker closes', () => {
  function Picker(props: {
    id?: string
    value?: number
    onChange?: (major: number, minor: number) => void
    onOpenChange?: (open: boolean) => void
  }) {
    const { control } = useFieldDecorator()
    return (
      <>
        <input id={props.id} value={props.value} readOnly aria-describedby={control['aria-describedby']} />
        <button type="button" onClick={() => props.onOpenChange?.(true)}>Open picker</button>
        <button type="button" onClick={() => props.onChange?.(2, 50)}>Pick 2.50</button>
        <button type="button" onClick={() => props.onOpenChange?.(false)}>Close picker</button>
      </>
    )
  }
  const Currency = connect(Picker, mapProps({
    format: (value: string) => Number(value),
    parse: (major: number, minor: number) => (major + minor / 100).toFixed(2),
    blurOn: 'onOpenChange',
  }))
  function Decorator({ children }: { children?: React.ReactNode }) {
    const field = useFieldDecorator()
    return (
      <>
        <label {...field.labelProps}>{field.label}</label>
        {children}
        {field.errorProps && <p {...field.errorProps}>{field.error}</p>}
      </>
    )
  }
  const validate = vi.fn((value: string) => Number(value) >= 10 ? undefined : 'Minimum is 10')
  const form = createForm({ initialValues: { amount: '12.75' }, validateTrigger: ['onBlur'] })
  const view = render(
    <Form form={form} kit={{ components: { Currency }, decorator: Decorator }}>
      <Field name="amount" title="Amount" rules={{ validator: validate }} component="Currency" />
    </Form>,
  )
  const input = view.getByLabelText('Amount') as HTMLInputElement
  expect(input.value).toBe('12.75')
  fireEvent.click(view.getByText('Open picker'))
  fireEvent.click(view.getByText('Pick 2.50'))
  expect(form.getValue('amount')).toBe('2.50')
  expect(input.value).toBe('2.5')
  expect(validate).not.toHaveBeenCalled()
  fireEvent.click(view.getByText('Close picker'))
  expect(validate.mock.calls).toEqual([['2.50', expect.anything()]])
  const error = view.getByRole('alert')
  expect(error.textContent).toBe('Minimum is 10')
  expect(input.getAttribute('aria-describedby')).toBe(error.id)
})

it('locks an asChild native submit while saving and re-enables it after one delivery', async () => {
  const form = createForm({ initialValues: { name: 'Ada' } })
  let release!: () => void
  const saving = new Promise<void>((resolve) => { release = resolve })
  const onSubmit = vi.fn(() => saving)
  const view = render(
    <Form form={form} onSubmit={onSubmit}>
      <Submit asChild><button>Save</button></Submit>
    </Form>,
  )
  const save = view.getByRole('button', { name: 'Save' }) as HTMLButtonElement
  expect(save.type).toBe('submit')
  await act(async () => { save.click() })
  expect(save.disabled).toBe(true)
  expect(save.getAttribute('aria-busy')).toBe('true')
  await act(async () => { save.click() })
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Ada' })
  expect(form.submitCount).toBe(1)
  await act(async () => release())
  expect(save.disabled).toBe(false)
  expect(save.hasAttribute('aria-busy')).toBe(false)
})

it('honors preventDefault in a render-prop Reset and calls afterReset with already-restored values', () => {
  const form = createForm({ initialValues: { name: 'Ada' } })
  const afterReset = vi.fn((values) => ({ callback: values.name, stored: form.getValue('name') }))
  const page = (cancel: boolean) => (
    <Form form={form}>
      <Reset afterReset={afterReset} onClick={(event) => { if (cancel) event.preventDefault() }}>
        {({ type, disabled, onClick }) => <button type={type} disabled={disabled} onClick={onClick}>Reset</button>}
      </Reset>
    </Form>
  )
  const view = render(page(true))
  act(() => form.setValue('name', 'Edited'))
  fireEvent.click(view.getByText('Reset'))
  expect(form.getValue('name')).toBe('Edited')
  expect(afterReset).not.toHaveBeenCalled()
  view.rerender(page(false))
  fireEvent.click(view.getByText('Reset'))
  expect(afterReset).toHaveBeenCalledExactlyOnceWith({ name: 'Ada' })
  expect(afterReset).toHaveReturnedWith({ callback: 'Ada', stored: 'Ada' })
  expect(form.dirty).toBe(false)
})
