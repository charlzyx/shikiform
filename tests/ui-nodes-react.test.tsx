// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, describe, expect, expectTypeOf, it, vi } from 'vitest'
import { defineEffects, Field, Form, typed, UI, useField, useForm, type FieldBinding, type UiName } from '@shikiform/react'
import { fieldErrorsOf } from './field-errors'

import { FormItem, Input, InputNumber, Slider } from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

function Echo(props: { style?: React.CSSProperties }) {
  const field = useField<string>()
  return <span data-echo id={field.id} style={props.style}>{field.value}</span>
}

describe('<Field ui> — several UIs of one field', () => {
  it('echo turns red: the instance has its own componentProps, the value is shared', () => {
    type V = { name: string }
    let form!: FormInstance<V>
    function App() {
      form = useForm<V>({
        initialValues: { name: '' },
        effects: [defineEffects<V>(({ reaction }) => {
          reaction((d) => {
            d.name.$ui('echo').$componentProps.style = d.name.$value.length > 3 ? { color: 'red' } : undefined
          })
        })],
      })
      return (
        <Form form={form} id="f">
          <Field name="name" title="姓名" decorator={[FormItem]} component={[Input]} />
          <Field name="name" ui="echo" component={[Echo]} />
        </Form>
      )
    }
    const view = render(<StrictMode><App /></StrictMode>)
    const input = view.container.querySelector('input')!
    fireEvent.change(input, { target: { value: 'Alice' } })
    const echo = view.container.querySelector('[data-echo]') as HTMLElement
    expect(echo.textContent).toBe('Alice')
    expect(echo.style.color).toBe('red')
    expect(input.style.color).toBe('')
    // distinct ids: the label points at the field, the echo has its own id
    expect(input.id).toBe('f-name')
    expect(echo.id).toBe('f-name--echo')
    expect(view.container.querySelector('label')!.getAttribute('for')).toBe('f-name')
  })

  it('slider + input share a value; the slider has its own pattern', () => {
    type V = { amount: number; lock: boolean }
    let form!: FormInstance<V>
    function App() {
      form = useForm<V>({
        initialValues: { amount: 10, lock: false },
        effects: [defineEffects<V>(({ reaction }) => {
          reaction((d) => { d.amount.$ui('slider').$pattern = d.lock.$value ? 'disabled' : undefined })
        })],
      })
      return (
        <Form form={form}>
          <Field name="amount" component={[InputNumber]} />
          <Field name="amount" ui="slider" component={[Slider]} />
        </Form>
      )
    }
    const view = render(<App />)
    const slider = () => view.container.querySelector('.ant-slider')!
    const handle = () => view.container.querySelector('.ant-slider-handle')!
    act(() => form.setValue('amount', 40))
    expect(handle().getAttribute('aria-valuenow')).toBe('40')
    expect((view.container.querySelector('input') as HTMLInputElement).value).toBe('40')
    act(() => form.setValue('lock', true))
    expect(slider().className).toContain('ant-slider-disabled')
    expect((view.container.querySelector('input') as HTMLInputElement).disabled).toBe(false)
    // unset falls back: a form-wide pattern reaches the instance
    act(() => form.setValue('lock', false))
    act(() => form.batch((d) => { d.$pattern = 'disabled' }))
    expect(slider().className).toContain('ant-slider-disabled')
  })

  it('useField() inside an instance is the shared field plus the instance UI state', () => {
    let seen!: FieldBinding<string>
    function Probe() {
      seen = useField<string>()
      return null
    }
    function App() {
      const form = useForm({ initialValues: { name: 'x' } })
      return (
        <Form form={form}>
          <Field name="name" required component={[Input]} />
          <Field name="name" ui="echo" pattern="readPretty" title="回显" component={[Probe]} />
        </Form>
      )
    }
    render(<App />)
    expect(seen.ui).toBe('echo')
    expect(seen.value).toBe('x')
    expect(seen.pattern).toBe('readPretty')
    expect(seen.required).toBe(true)
    expect(seen.title).toBe('回显')
  })

  it('an instance does not lease rules / enum (warns instead)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let form!: FormInstance<{ a: string }>
    function App() {
      form = useForm({ initialValues: { a: '' } })
      return (
        <Form form={form}>
          <Field name="a" component={[Input]} />
          <Field name="a" ui="echo" required component={[Echo]} />
        </Form>
      )
    }
    render(<App />)
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/ui="echo"> ignores required/)
  })
})

describe('<UI> — a UI with no data', () => {
  type V = { amount: number }
  function App({ onForm }: { onForm: (f: FormInstance<V>) => void }) {
    const form = useForm<V>({
      initialValues: { amount: 0 },
      effects: [defineEffects<V>(({ reaction }) => {
        reaction((d) => { d.$ui('approvalTip').$visible = d.amount.$value >= 50000 })
      })],
    })
    onForm(form)
    return (
      <Form form={form}>
        <Field name="amount" component={[InputNumber]} />
        <UI name="approvalTip" component={[({ message }: { message: string }) => <div role="alert">{message}</div>, { message: '需要审批' }]} />
      </Form>
    )
  }

  it('Alert toggles with amount ≥ 50000 and never enters values / submit', async () => {
    let form!: FormInstance<V>
    const view = render(<App onForm={(f) => (form = f)} />)
    expect(view.queryByRole('alert')).toBeNull()
    act(() => form.setValue('amount', 60000))
    expect(view.getByRole('alert').textContent).toBe('需要审批')
    act(() => form.setValue('amount', 100))
    expect(view.queryByRole('alert')).toBeNull()
    expect(await form.submit()).toEqual({ amount: 100 })
  })

  it('hiding a UI does not cascade to the fields inside it', async () => {
    let form!: FormInstance<{ note: string }>
    function Box() {
      form = useForm({ initialValues: { note: 'kept' } })
      return (
        <Form form={form}>
          <UI name="box" decorator={[FormItem]} title="备注区">
            <Field name="note" component={[Input]} />
          </UI>
        </Form>
      )
    }
    const view = render(<Box />)
    expect(view.container.querySelector('label')!.textContent).toBe('备注区')
    act(() => form.batch((d) => { d.$ui('box').$visible = false }))
    expect(view.container.querySelector('input')).toBeNull()
    form.batch((d) => { expect(d.note.$visible).toBe(true) })
    expect(await form.submit()).toEqual({ note: 'kept' })
  })

  it('warns once when a reaction writes a $ui name that never mounts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    function Typo() {
      const form = useForm({
        initialValues: { amount: 0 },
        effects: [defineEffects<V>(({ reaction }) => {
          reaction((d) => { d.$ui('aproval').$visible = d.amount.$value > 1 })
        })],
      })
      return (
        <Form form={form}>
          <UI name="approvalTip">tip</UI>
        </Form>
      )
    }
    render(<Typo />)
    await settle()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/\$ui\('aproval'\) was written.*"approvalTip"/)
  })

  it('ui names are plain strings unless registered', () => {
    expectTypeOf<UiName>().toEqualTypeOf<string>()
    const F = typed<{ a: string }>()
    void F
  })
})
