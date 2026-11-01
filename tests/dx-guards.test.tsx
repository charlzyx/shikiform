// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrayField, Field, ObjectField, createForm, defineEffects, useField } from '../src'
import { ShikiUsageError } from '../src/core'
import { Input, ProArrayTable, useAntdForm } from '../src/antd'

afterEach(cleanup)

function withReaction(effect: (d: any) => void, initialValues: any = { kind: 'a', email: '' }) {
  return () => createForm<any>({ initialValues, effects: [defineEffects<any>(({ reaction }) => reaction(effect))] })
}

describe('draft typos and read-only writes throw in development', () => {
  it('a misspelled $ state read throws with the suggestion instead of returning a truthy handle', () => {
    expect(withReaction((d) => { d.email.$required = !!d.kind.$valeu })).toThrow(ShikiUsageError)
    expect(withReaction((d) => { d.email.$required = !!d.kind.$valeu })).toThrow(/d\.kind\.\$valeu is not a draft state\. Did you mean d\.kind\.\$value\?/)
    expect(withReaction((d) => { d.email.$required = d.kind.$Visible })).toThrow(/\$visible/)
  })

  it('short or unrelated $ keys stay child paths (a field literally named $id / $ref)', () => {
    const form = withReaction((d) => { d.copy.$value = d.meta.$id.$value + d.meta.$ref.$value }, { meta: { $id: 'a', $ref: 'b' }, copy: '' })()
    expect(form.getValue('copy')).toBe('ab')
  })

  it('a misspelled $ state write throws instead of being ignored', () => {
    expect(withReaction((d) => { d.email.$requird = true })).toThrow(/d\.email\.\$requird is not a draft state, so the write is ignored\. Did you mean d\.email\.\$required\?/)
    expect(withReaction((d) => { d.email.$nonsense = true })).toThrow(/Writable: \$value/)
  })

  it('writing a read-only state names the API that changes it', () => {
    expect(withReaction((d) => { d.email.$errors = ['x'] })).toThrow(/d\.email\.\$errors is read-only in a draft\. .*form\.setErrors/)
    expect(withReaction((d) => { d.$canSubmit = false })).toThrow(/d\.\$canSubmit is read-only/)
  })

  it('assigning a plain property says to write $value (not a bare proxy TypeError)', () => {
    expect(withReaction((d) => { d.email.value = 'x' })).toThrow(ShikiUsageError)
    expect(withReaction((d) => { d.email.value = 'x' })).toThrow(/d\.email\.value = … does nothing.*d\.email\.value\.\$value = …/)
    expect(withReaction((d) => { d.email = 'x' })).toThrow(/d\.email = … does nothing.*d\.email\.\$value = …/)
  })

  it('every writable state still writes', () => {
    const form = withReaction((d) => {
      d.email.$value = 'x'
      d.email.$required = true
      d.email.$visible = true
      d.email.$pattern = 'editable'
      d.email.$rules = []
      d.email.$title = 'Email'
      d.email.$componentProps.placeholder = 'p'
    })()
    expect(form.getValue('email')).toBe('x')
    expect(form.query('email').$required).toBe(true)
    expect(form.query('email').$title).toBe('Email')
  })
})

describe('a missing <Form> names the caller and the fix', () => {
  it('Field / useField / ObjectField / ArrayField / ProArrayTable', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() => render(<Field name="email" component={[Input]} />)).toThrow(/useField\('email'\) \/ <Field name="email"> has no form\. Render it inside <Form form=\{form\}> .* or <form\.AppForm>/)
      function Hook() { useField('age'); return null }
      expect(() => render(<Hook />)).toThrow(/useField\('age'\)/)
      expect(() => render(<ObjectField name="addr" />)).toThrow(/<ObjectField name="addr"> has no form/)
      expect(() => render(<ArrayField name="items">{() => null}</ArrayField>)).toThrow(/items/)
      expect(() => render(<ProArrayTable name="rows" columns={[]} />)).toThrow(/<ProArrayTable name="rows"> has no form/)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('an error on screen is re-checked on change', () => {
  it('typing a valid value clears 必填 and re-enables form.Submit without a blur', async () => {
    const onSubmit = vi.fn()
    function App() {
      const form = useAntdForm({ initialValues: { name: '' } })
      return (
        <form.AppForm onSubmit={onSubmit}>
          <form.AppField name="name" title="姓名" required>{(f) => <f.Input />}</form.AppField>
          <form.Submit>go</form.Submit>
        </form.AppForm>
      )
    }
    const view = render(<App />)
    const button = view.getByRole('button') as HTMLButtonElement
    await act(async () => { fireEvent.click(button); await new Promise((r) => setTimeout(r, 20)) })
    const input = view.getByRole('textbox')
    expect(view.container.textContent).toContain('必填')
    expect(input.className).toContain('ant-input-status-error')
    expect(button.disabled).toBe(true)
    await act(async () => { fireEvent.change(input, { target: { value: 'Ada' } }); await new Promise((r) => setTimeout(r, 20)) })
    // antd keeps the old help text mounted for its leave animation; the field status is the signal.
    expect(input.className).not.toContain('ant-input-status-error')
    expect(button.disabled).toBe(false)
  })

  it('a field without errors still waits for its trigger (no validation while typing the first time)', async () => {
    const form = createForm<any>({ initialValues: { name: '' } })
    form.registerField('name', { rules: [{ minLength: 3 }] })
    form.setValue('name', 'a')
    await new Promise((r) => setTimeout(r, 10))
    expect(form.query('name').$errors).toEqual([])
    await form.validate('name')
    expect(form.query('name').$errors.length).toBe(1)
    form.setValue('name', 'abcd')
    await new Promise((r) => setTimeout(r, 10))
    expect(form.query('name').$errors).toEqual([])
  })
})
