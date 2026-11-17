// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fieldErrorsOf } from './field-errors'

// Record the props each Ant Design control receives. Everything else (FormItem, the engine, connect) is real,
// so these contracts cover the connect() controls inside a `<Field decorator={[FormItem]}>`.
const seen = vi.hoisted(() => ({} as Record<string, any>))
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>()
  const spy = (name: string) =>
    function Recorder(props: any) {
      seen[name] = props
      return null
    }
  return {
    ...actual,
    Input: Object.assign(spy('Input'), { TextArea: actual.Input.TextArea, Password: actual.Input.Password }),
    Select: spy('Select'),
    InputNumber: spy('InputNumber'),
    Switch: spy('Switch'),
    Checkbox: Object.assign(spy('Checkbox'), { Group: actual.Checkbox.Group }),
  }
})
import { Field, Form, useForm } from '@shikiform/react'
import { Checkbox, DatePicker, FormItem, Input, InputNumber, Radio, Select, Switch } from '@shikiform/antd'

const CONTROLS: Record<string, any> = { Input, Select, InputNumber, Switch, Checkbox }

type Mode = 'editable' | 'disabled' | 'readOnly'

afterEach(() => {
  cleanup()
  for (const key of Object.keys(seen)) delete seen[key]
})

function mount(name: string, value: unknown, mode: Mode = 'editable', props: Record<string, unknown> = {}) {
  const flags = mode === 'disabled' ? { disabled: true } : mode === 'readOnly' ? { readOnly: true } : {}
  let api: any
  function App() {
    const form = useForm({ initialValues: { value }, fields: { value: flags } })
    api = form
    return (
      <Form form={form}>
        <Field name="value" decorator={[FormItem]} component={[CONTROLS[name], props]} />
      </Form>
    )
  }
  const view = render(<App />)
  return { form: api, html: () => view.container.innerHTML, control: () => seen[name] }
}

describe('Ant Design control contracts (connect controls in a FormItem field)', () => {
  it.each([
    ['Input', '', [{ target: { value: 'Ada' } }], 'Ada'],
    ['Select', '', ['city', { label: 'City', value: 'city' }], 'city'],
    ['InputNumber', 3, [null], null],
    ['Switch', false, [true, { type: 'click' }], true],
    ['Checkbox', false, [{ target: { type: 'checkbox', checked: true } }], true],
  ])('%s writes once and calls the caller once with the original UI arguments', (name, initial, args, expected) => {
    let formRef: any
    const caller = vi.fn(() => expect(formRef.getValue('value')).toBe(expected))
    const { form, control } = mount(name as string, initial, 'editable', { onChange: caller })
    formRef = form
    control().onChange(...(args as unknown[]))
    expect(form.getValue('value')).toBe(expected)
    expect(caller).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledWith(...(args as unknown[]))
  })

  it.each(['Input', 'Select', 'InputNumber', 'Checkbox', 'Switch'])('%s wires blur and the caller exactly once', (name) => {
    const caller = vi.fn()
    const { form, control } = mount(name, '', 'editable', { onBlur: caller })
    const event = { type: 'blur' }
    expect(control().onBlur).toBeTypeOf('function')
    control().onBlur(event)
    expect(caller).toHaveBeenCalledTimes(1)
    expect(caller).toHaveBeenCalledWith(event)
    expect(form.binding('value').touched).toBe(true)
  })

  it.each(['Select', 'Switch', 'Checkbox'])('%s readOnly renders the preview instead of the control', (name) => {
    const { control, html } = mount(name, name === 'Select' ? 'a' : false, 'readOnly', { disabled: false })
    expect(control()).toBeUndefined()
    expect(html()).toContain('data-read-pretty')
  })

  it.each(['Switch', 'Checkbox'])('%s reads as 是 / 否 when readOnly (no control rendered)', (name) => {
    const on = mount(name, true, 'readOnly')
    expect(on.control()).toBeUndefined()
    expect(on.html()).toContain('是')
    cleanup()
    expect(mount(name, false, 'readOnly').html()).toContain('否')
  })

  it.each(['Input', 'InputNumber'])('%s respects an explicit readOnly prop as well as the field state', (name) => {
    const { control } = mount(name, '', 'editable', { readOnly: true })
    expect(control().readOnly).toBe(true)
  })

  it.each(['Input', 'Select', 'InputNumber', 'Switch', 'Checkbox'])('%s preserves model values and disabled priority', (name) => {
    const boolean = name === 'Switch' || name === 'Checkbox'
    const { control } = mount(name, boolean ? true : 'model', 'disabled', { value: 'caller', checked: false, disabled: false })
    expect(control().disabled).toBe(true)
    expect(boolean ? control().checked : control().value).toBe(boolean ? true : 'model')
  })

  it('InputNumber writes the raw Ant Design value (null on clear), without rewriting caller payloads', () => {
    const caller = vi.fn()
    const { form, control } = mount('InputNumber', 4, 'editable', { stringMode: true, onChange: caller })
    control().onChange(null)
    expect(form.getValue('value')).toBe(null)
    control().onChange('12.5')
    expect(form.getValue('value')).toBe('12.5')
    expect(caller.mock.calls).toEqual([[null], ['12.5']])
  })

  it('Input / Select / InputNumber sit in a FormItem: title as label, required mark, status', async () => {
    let api: any
    function App() {
      const form = useForm({ initialValues: { email: '' } })
      api = form
      return (
        <Form form={form}>
          <Field name="email" title="邮箱" required decorator={[FormItem]} component={[Input]} />
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.innerHTML).toContain('邮箱')
    expect(view.container.innerHTML).toContain('ant-form-item-required')
    await fieldErrorsOf(api.validate())
    expect(seen.Input.status).toBe('error')
  })

  it('readOnly shows the preview text', () => {
    const { html } = mount('Input', 'hello', 'readOnly')
    expect(html()).toContain('data-read-pretty')
    expect(html()).toContain('hello')
  })

  it('Switch, Radio, DatePicker and Input.Password show the field title in FormItem', () => {
    function App() {
      const form = useForm({
        initialValues: { on: false, picked: 'a', day: '2020-01-02', secret: 'x' },
        fields: { picked: { enum: [{ label: '甲', value: 'a' }] } },
      })
      return (
        <Form form={form}>
          <Field name="on" title="开关" decorator={[FormItem]} component={[Switch]} />
          <Field name="picked" title="单选" decorator={[FormItem]} component={[Radio.Group]} />
          <Field name="day" title="日期" decorator={[FormItem]} component={[DatePicker]} />
          <Field name="secret" title="密码" decorator={[FormItem]} component={[Input.Password]} />
        </Form>
      )
    }
    const view = render(<App />)
    const html = view.container.innerHTML
    for (const label of ['开关', '单选', '日期', '密码']) expect(html).toContain(label)
    expect(view.container.querySelectorAll('.ant-form-item').length).toBe(4)
  })

  it('Checkbox.Group, Radio.Group, RangePicker and TextArea are wrapped in FormItem', () => {
    function App() {
      const form = useForm({
        initialValues: {
          checks: ['a'],
          picked: 'a',
          range: ['2020-01-02', '2020-01-03'],
          note: '备注',
        },
        fields: {
          checks: { enum: [{ label: '甲', value: 'a' }] },
          picked: { enum: [{ label: '甲', value: 'a' }] },
        },
      })
      return (
        <Form form={form}>
          <Field name="checks" title="多选" decorator={[FormItem]} component={[Checkbox.Group]} />
          <Field name="picked" title="单选组" decorator={[FormItem]} component={[Radio.Group]} />
          <Field name="range" title="区间" decorator={[FormItem]} component={[DatePicker.RangePicker]} />
          <Field name="note" title="备注" decorator={[FormItem]} component={[Input.TextArea]} />
        </Form>
      )
    }
    const view = render(<App />)
    const html = view.container.innerHTML
    for (const label of ['多选', '单选组', '区间', '备注']) expect(html).toContain(label)
    expect(view.container.querySelectorAll('.ant-form-item').length).toBe(4)
  })
})
