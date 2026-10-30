// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Record the props each Ant Design control receives. Everything else (FormItem, the engine, connect) is real,
// so these contracts cover `useAntdForm`'s `field.Input` & co., which are now the connect() controls.
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
import { useAntdForm } from '../src/antd'

type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty'

afterEach(() => {
  cleanup()
  for (const key of Object.keys(seen)) delete seen[key]
})

function mount(name: string, value: unknown, pattern: Pattern = 'editable', props: Record<string, unknown> = {}) {
  let api: any
  function App() {
    const form = useAntdForm({ initialValues: { value }, fields: { value: { pattern } } })
    api = form
    return (
      <form.AppForm>
        <form.AppField name="value">
          {(field) => {
            const Control = (field as any)[name]
            return <Control {...props} />
          }}
        </form.AppField>
      </form.AppForm>
    )
  }
  const view = render(<App />)
  return { form: api, html: () => view.container.innerHTML, control: () => seen[name] }
}

describe('Ant Design bound input contracts (useAntdForm field.X = connect controls)', () => {
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

  it.each(['Select', 'Switch', 'Checkbox'])('%s cannot edit a readOnly model', (name) => {
    const { control } = mount(name, '', 'readOnly', { disabled: false })
    expect(control().disabled).toBe(true)
  })

  it.each(['Switch', 'Checkbox'])('%s uses a disabled boolean view for readPretty', (name) => {
    const { control } = mount(name, true, 'readPretty', { disabled: false })
    expect(control().checked).toBe(true)
    expect(control().disabled).toBe(true)
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
      const form = useAntdForm({ initialValues: { email: '' } })
      api = form
      return (
        <form.AppForm>
          <form.AppField name="email" title="邮箱" required>
            {(field) => <field.Input />}
          </form.AppField>
        </form.AppForm>
      )
    }
    const view = render(<App />)
    expect(view.container.innerHTML).toContain('邮箱')
    expect(view.container.innerHTML).toContain('ant-form-item-required')
    await api.validate()
    expect(seen.Input.status).toBe('error')
  })

  it('readPretty shows the preview text', () => {
    const { html } = mount('Input', 'hello', 'readPretty')
    expect(html()).toContain('data-read-pretty')
    expect(html()).toContain('hello')
  })

  it('Switch, Radio, DatePicker and Input.Password show the field title in FormItem', () => {
    function App() {
      const form = useAntdForm({
        initialValues: { on: false, picked: 'a', day: '2020-01-02', secret: 'x' },
        fields: { picked: { enum: [{ label: '甲', value: 'a' }] } },
      })
      return (
        <form.AppForm>
          <form.AppField name="on" title="开关">{(field) => <field.Switch />}</form.AppField>
          <form.AppField name="picked" title="单选">{(field) => <field.Radio />}</form.AppField>
          <form.AppField name="day" title="日期">{(field) => <field.DatePicker />}</form.AppField>
          <form.AppField name="secret" title="密码">{(field) => <field.Input.Password />}</form.AppField>
        </form.AppForm>
      )
    }
    const view = render(<App />)
    const html = view.container.innerHTML
    for (const label of ['开关', '单选', '日期', '密码']) expect(html).toContain(label)
    expect(view.container.querySelectorAll('.ant-form-item').length).toBe(4)
  })
})
