// @vitest-environment happy-dom

import { act, cleanup, fireEvent, render, within } from '@testing-library/react'
import { StrictMode } from 'react'
import type { ComponentProps } from 'react'
import { renderToString } from 'react-dom/server'
import { connect, createForm, defineEffects, Field, Form, mapProps, useField } from '@shikiform/react'
import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
})

function TextControl() {
  const field = useField<string>()
  return <input id={field.id} aria-label="code" value={field.value} onChange={(event) => field.onChange(event.target.value)} />
}

it('releases old name and form leases while a field switches binding in place', async () => {
  const first = createForm({ initialValues: { a: '', b: '' } })
  const second = createForm({ initialValues: { a: '', b: '' } })
  const page = (form: typeof first, name: 'a' | 'b', key = 0) => (
    <Form form={form}>
      <Field key={key} name={name} rules={{ required: true, message: 'Code required' }} component={TextControl} />
    </Form>
  )
  const view = render(page(first, 'a'))
  const input = view.getByLabelText('code')
  await act(async () => {
    await expect(first.validate()).rejects.toEqual([{ path: 'a', messages: ['Code required'] }])
  })

  view.rerender(page(first, 'b'))
  expect(view.getByLabelText('code')).toBe(input)
  await act(async () => {
    await expect(first.validate()).rejects.toEqual([{ path: 'b', messages: ['Code required'] }])
  })

  view.rerender(page(second, 'b'))
  expect(view.getByLabelText('code')).toBe(input)
  fireEvent.change(input, { target: { value: 'north' } })
  expect(first.getValue('b')).toBe('')
  expect(second.getValue('b')).toBe('north')
  await expect(first.validate()).resolves.toEqual({ a: '', b: '' })

  view.rerender(page(second, 'a', 1))
  expect(view.getByLabelText('code')).not.toBe(input)
  await act(async () => {
    await expect(second.validate()).rejects.toEqual([{ path: 'a', messages: ['Code required'] }])
  })
  expect(second.getValue('b')).toBe('north')
})

it('updates an unmounted field from a reaction and restores the latest value on remount', () => {
  type Values = { source: string; code: string }
  const form = createForm({
    initialValues: { source: 'north', code: '' },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.code.$value = d.source.$value.toUpperCase() })
    })],
  })
  const page = (mounted: boolean) => <Form form={form}>{mounted && <Field name="code" component={TextControl} />}</Form>
  const view = render(page(true))
  expect((view.getByLabelText('code') as HTMLInputElement).value).toBe('NORTH')
  view.rerender(page(false))
  act(() => form.setValue('source', 'south'))
  expect(form.getSubmitValues()).toEqual({ source: 'south', code: 'SOUTH' })
  view.rerender(page(true))
  expect((view.getByLabelText('code') as HTMLInputElement).value).toBe('SOUTH')
})

it('keeps independent React roots isolated even when both use the same field path', () => {
  const left = createForm({ initialValues: { code: 'left' } })
  const right = createForm({ initialValues: { code: 'right' } })
  const first = render(<Form form={left}><Field name="code" component={TextControl} /></Form>)
  const second = render(<Form form={right}><Field name="code" component={TextControl} /></Form>)
  const leftInput = within(first.container).getByLabelText('code') as HTMLInputElement
  const rightInput = within(second.container).getByLabelText('code') as HTMLInputElement
  expect(leftInput.id).not.toBe(rightInput.id)
  fireEvent.change(leftInput, { target: { value: 'edited left' } })
  expect(rightInput.value).toBe('right')
  first.unmount()
  fireEvent.change(rightInput, { target: { value: 'edited right' } })
  expect(left.getValue('code')).toBe('edited left')
  expect(right.getValue('code')).toBe('edited right')
})

for (const environment of ['development', 'production']) {
  it(
    environment === 'development'
      ? 'QA-54 warns once when duplicate unnamed Fields mount in StrictMode'
      : 'keeps a single value for duplicate unnamed Field owners in production',
    async () => {
      vi.stubEnv('NODE_ENV', environment)
      const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const form = createForm({ initialValues: { code: 'original', other: 'keep' } })
      const view = render(
        <StrictMode>
          <Form form={form}>
            <Field name="code" component={TextControl} />
            <Field name="code" component={TextControl} />
          </Form>
        </StrictMode>,
      )
      const [first, second] = view.getAllByLabelText('code') as HTMLInputElement[]
      fireEvent.change(second, { target: { value: 'edited' } })
      expect(first.value).toBe('edited')
      await expect(form.submit()).resolves.toEqual({ code: 'edited', other: 'keep' })
      if (environment === 'development') expect(warnings).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/Field.*code.*\bui\b/i))
      else expect(warnings).not.toHaveBeenCalled()
    },
  )
}

it('releases primary Field ownership on name changes and excludes named UIs', () => {
  vi.stubEnv('NODE_ENV', 'development')
  const warnings = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const form = createForm({ initialValues: { code: 'one', other: 'two' } })
  const page = (name: 'code' | 'other', second = false) => (
    <Form form={form}>
      <Field name={name} />
      <Field name="code" ui="echo" />
      {second && <Field name="code" />}
    </Form>
  )
  const view = render(page('code'))
  view.rerender(page('other', true))
  expect(warnings).not.toHaveBeenCalled()
  view.rerender(page('code', true))
  view.rerender(page('other'))
  view.rerender(page('code', true))
  expect(warnings).toHaveBeenCalledExactlyOnceWith(expect.stringMatching(/Field.*code.*\bui\b/i))
})

it.fails.each(['development', 'production'])('BUG: QA-55 a connected control writes to the form during an abandoned render in %s', (environment) => {
  vi.stubEnv('NODE_ENV', environment)
  const form = createForm({ initialValues: { code: 'original' } })
  const abandoned = new Error('abort this render')
  const Connected = connect(({ onChange }: { onChange?: (value: string) => void }) => {
    onChange?.('uncommitted edit')
    throw abandoned
  }, mapProps({ onBlur: false }))

  let error: unknown
  try {
    renderToString(<Form form={form}><Field name="code" component={Connected} /></Form>)
  } catch (caught) { error = caught }
  expect({ error, values: form.getSubmitValues() }).toEqual({
    error: environment === 'development'
      ? expect.objectContaining({ name: 'ShikiUsageError', message: expect.stringMatching(/render.*(event|effect)/i) })
      : abandoned,
    values: { code: 'original' },
  })
})

it('extracts a checkbox event as a boolean and leaves an output-only connected control read-only', () => {
  const form = createForm({ initialValues: { enabled: false } })
  const Checkbox = connect(({ value, ...props }: Omit<ComponentProps<'input'>, 'value'> & { value?: boolean }) => (
    <input {...props} type="checkbox" checked={value} />
  ))
  const Echo = connect(({ value }: { value?: boolean }) => <output>{String(value)}</output>, mapProps({ onBlur: false }))
  const view = render(
    <Form form={form}>
      <Field name="enabled" component={Checkbox} />
      <Field name="enabled" ui="echo" component={Echo} />
    </Form>,
  )
  expect(view.getByText('false')).toBeDefined()
  expect(form.dirty).toBe(false)
  fireEvent.click(view.getByRole('checkbox'))
  expect(form.getSubmitValues()).toEqual({ enabled: true })
  expect(view.getByText('true')).toBeDefined()
})

it('passes all arguments of each synchronous control event through parse and the caller handler', () => {
  const form = createForm({ initialValues: { code: 'initial' } })
  function Picker({ onChange }: { onChange?: (label: string, code: number) => void }) {
    return (
      <button type="button" onClick={() => {
        onChange?.('north', 7)
        onChange?.('south', 9)
      }}>Pick</button>
    )
  }
  const parse = vi.fn((label: string, code: number) => `${label}-${code}`)
  const caller = vi.fn(() => form.getValue('code'))
  const Connected = connect(Picker, mapProps({ parse, onBlur: false }))
  const view = render(<Form form={form}><Field name="code" component={[Connected, { onChange: caller }]} /></Form>)

  fireEvent.click(view.getByRole('button', { name: 'Pick' }))
  expect(parse.mock.calls).toEqual([['north', 7], ['south', 9]])
  expect(caller.mock.results.map(({ value }) => value)).toEqual(['north-7', 'south-9'])
  expect(form.getSubmitValues()).toEqual({ code: 'south-9' })
})
