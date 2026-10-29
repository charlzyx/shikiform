import dayjs from 'dayjs'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createForm, Form, useField, type FieldBinding } from '../src'
import {
  Checkbox,
  connect,
  DatePicker,
  FormItem,
  Input,
  InputNumber,
  mapFieldProps,
  mapProps,
  mapReadPretty,
  PreviewText,
  Radio,
  Select,
  Switch,
  useAntdForm,
} from '../src/antd'

type Pattern = 'editable' | 'disabled' | 'readOnly' | 'readPretty'

function binding(value: unknown, extra: { pattern?: Pattern; enum?: { label: string; value: unknown }[] } = {}) {
  const form = createForm({ initialValues: { x: value }, fields: { x: { pattern: extra.pattern, enum: extra.enum } } })
  return { form, field: form.binding('x') as FieldBinding<any> }
}

/**
 * Resolve a connected control rendered with an explicit `field` down to the element it hands Ant Design.
 * The `field` branch calls no hooks, so the mapping is inspectable without a DOM.
 */
function target(Component: any, props: Record<string, unknown>): ReactElement<any> {
  let element: ReactElement<any> = Component(props)
  while (typeof element.type === 'function' && (element.type as any).name === 'WithField') {
    element = (element.type as any)(element.props)
  }
  return element
}

describe('mapFieldProps (the pure core of connect)', () => {
  it('binds value, chains onChange / onBlur once with the original arguments', () => {
    const { form, field } = binding('')
    const onChange = vi.fn(() => expect(form.getValue('x')).toBe('Ada'))
    const onBlur = vi.fn()
    const props = mapFieldProps(field, { onChange, onBlur, placeholder: 'p' })
    expect(props.value).toBe('')
    expect(props.placeholder).toBe('p')
    expect(props.id).toBe('x')
    const event = { target: { value: 'Ada' } }
    props.onChange(event)
    expect(form.getValue('x')).toBe('Ada')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith(event)
    props.onBlur({ type: 'blur' })
    expect(onBlur).toHaveBeenCalledTimes(1)
    expect(form.binding('x').touched).toBe(true)
  })

  it('reads checkbox events as checked and non-events as the value itself', () => {
    const { form, field } = binding(false)
    mapFieldProps(field, {}).onChange({ target: { type: 'checkbox', checked: true, value: 'on' } })
    expect(form.getValue('x')).toBe(true)
    mapFieldProps(form.binding('x') as FieldBinding<any>, {}).onChange(null)
    expect(form.getValue('x')).toBe(null)
  })

  it('renames, merges, and drops binding props', () => {
    const { field } = binding(true, { pattern: 'readOnly' })
    const props = mapFieldProps(field, {}, { value: 'checked', readOnly: 'disabled', status: false })
    expect(props.checked).toBe(true)
    expect(props.disabled).toBe(true)
    expect('readOnly' in props).toBe(false)
    expect('status' in props).toBe(false)
    expect('value' in props).toBe(false)
  })

  it('ORs disabled/readOnly with caller props and lets an explicit status win', async () => {
    const form = createForm({ initialValues: { x: '' }, fields: { x: { required: true } } })
    await form.validate()
    const field = form.binding('x') as FieldBinding<any>
    expect(mapFieldProps(field, { disabled: true }).disabled).toBe(true)
    expect(mapFieldProps(field, {}).status).toBe('error')
    expect(mapFieldProps(field, { status: 'warning' }).status).toBe('warning')
  })

  it('maps the field enum to options only when asked, and a caller list wins', () => {
    const { field } = binding('a', { enum: [{ label: 'A', value: 'a' }] })
    expect(mapFieldProps(field, {}).options).toBeUndefined()
    expect(mapFieldProps(field, {}, { options: 'options' }).options).toEqual([{ label: 'A', value: 'a', disabled: undefined }])
    expect(mapFieldProps(field, { options: [] }, { options: 'options' }).options).toEqual([])
  })

  it('runs transforms last and uses a custom getValueFromEvent', () => {
    const { form, field } = binding(0)
    const props = mapFieldProps(field, {}, { getValueFromEvent: (v: string) => Number(v) }, (p) => ({ ...p, extra: 1 }))
    props.onChange('42')
    expect(form.getValue('x')).toBe(42)
    expect(props.extra).toBe(1)
  })

  it('treats readPretty as readOnly when there is no read-pretty view', () => {
    const { field } = binding('x', { pattern: 'readPretty' })
    expect(mapFieldProps(field, {}).readOnly).toBe(true)
  })
})

describe('connect', () => {
  it('binds by name through useField (hook-first) and writes back to the form', () => {
    const seen: Record<string, any>[] = []
    const Probe = connect((props: { value?: string; onChange?: (v: string) => void }) => {
      seen.push(props)
      return null
    })
    const form = createForm({ initialValues: { a: { b: 'v' } } })
    renderToStaticMarkup(
      <Form form={form}>
        <Probe name="a.b" />
      </Form>,
    )
    expect(seen.at(-1)!.value).toBe('v')
    seen.at(-1)!.onChange!('w')
    expect(form.getValue('a.b' as any)).toBe('w')
  })

  it('binds from a surrounding FormItem without its own name', () => {
    const seen: Record<string, any>[] = []
    const Probe = connect((props: { value?: unknown }) => {
      seen.push(props)
      return null
    })
    const form = createForm({ initialValues: { city: 'Paris' } })
    renderToStaticMarkup(
      <Form form={form}>
        <FormItem name="city" label="城市">
          <Probe />
        </FormItem>
      </Form>,
    )
    expect(seen.at(-1)!.value).toBe('Paris')
    expect(seen.at(-1)!.id).toBe('city')
  })

  it('renders the mapReadPretty view in readPretty and the control otherwise', () => {
    const Control = connect((props: { value?: string }) => <input data-control value={props.value} readOnly />, mapReadPretty(PreviewText))
    const editable = createForm({ initialValues: { x: 'hi' } })
    const pretty = createForm({ initialValues: { x: 'hi' }, fields: { x: { pattern: 'readPretty' } } })
    expect(renderToStaticMarkup(<Form form={editable}><Control name="x" /></Form>)).toContain('data-control')
    const html = renderToStaticMarkup(<Form form={pretty}><Control name="x" /></Form>)
    expect(html).toContain('data-read-pretty')
    expect(html).toContain('hi')
  })

  it('throws a clear error with no field source', () => {
    const Bare = connect(() => null)
    const form = createForm({ initialValues: {} })
    expect(() => renderToStaticMarkup(<Form form={form}><Bare /></Form>)).toThrow(/needs a `name` prop/)
  })

  it('works inside useAntdForm AppField (shared field context)', () => {
    function App() {
      const form = useAntdForm({ initialValues: { email: 'a@b.c' } })
      return (
        <form.AppForm>
          <form.AppField name="email">{() => <Input />}</form.AppField>
        </form.AppForm>
      )
    }
    expect(renderToStaticMarkup(<App />)).toContain('value="a@b.c"')
  })
})

describe('FormItem', () => {
  it('shows label, required mark, and the first error after validation', async () => {
    const form = createForm({ initialValues: { email: '' } })
    const view = () =>
      renderToStaticMarkup(
        <Form form={form}>
          <FormItem name="email" label="邮箱" required>
            <Input />
          </FormItem>
        </Form>,
      )
    const first = view()
    expect(first).toContain('邮箱')
    expect(first).toContain('ant-form-item-required')
    await form.validate()
    const after = view()
    // antd renders `help` through a motion list on the client; SSR carries the status classes.
    expect(after).toContain('ant-form-item-has-error')
    expect(after).toContain('ant-input-status-error')
    expect(form.binding('email').errors).toEqual(['必填'])
  })

  it('applies field options as a mount lease, like <Field rules>', async () => {
    const form = createForm({ initialValues: { code: 'x' } })
    renderToStaticMarkup(
      <Form form={form}>
        <FormItem name="code" rules={{ minLength: 3 }}>
          <Input />
        </FormItem>
      </Form>,
    )
    expect(await form.validate()).toEqual([{ path: 'code', messages: ['至少 3 个字符'] }])
  })

  it('renders nothing for display hidden / none and hides the required mark in readPretty', () => {
    const hidden = createForm({ initialValues: { a: 1 }, fields: { a: { display: 'hidden' } } })
    expect(renderToStaticMarkup(<Form form={hidden}><FormItem name="a" label="A"><InputNumber /></FormItem></Form>)).not.toContain('A')
    const pretty = createForm({ initialValues: { a: 1 }, fields: { a: { pattern: 'readPretty', required: true } } })
    const html = renderToStaticMarkup(<Form form={pretty}><FormItem name="a" label="A"><InputNumber /></FormItem></Form>)
    expect(html).not.toContain('ant-form-item-required')
    expect(html).toContain('data-read-pretty')
  })

  it('accepts a binding from useField (hooks first, component as sugar)', async () => {
    const form = createForm({ initialValues: { name: '' } })
    function Hooked() {
      const field = useField('name', { required: true })
      return (
        <FormItem field={field} label="姓名">
          <Input />
        </FormItem>
      )
    }
    renderToStaticMarkup(<Form form={form}><Hooked /></Form>)
    expect(await form.validate()).toEqual([{ path: 'name', messages: ['必填'] }])
  })
})

describe('connected Ant Design controls', () => {
  const options = [
    { label: '红', value: 'red' },
    { label: '蓝', value: 'blue' },
  ]

  it('Input binds value / onChange(event) and disables nothing by default', () => {
    const { form, field } = binding('')
    const el = target(Input, { field })
    expect(el.props.value).toBe('')
    expect(el.props.readOnly).toBe(false)
    el.props.onChange({ target: { value: 'Ada' } })
    expect(form.getValue('x')).toBe('Ada')
  })

  it('InputNumber writes the raw number or null', () => {
    const { form, field } = binding(3)
    const el = target(InputNumber, { field })
    el.props.onChange(7)
    expect(form.getValue('x')).toBe(7)
    el.props.onChange(null)
    expect(form.getValue('x')).toBe(null)
  })

  it('Select takes enum options, maps readOnly to disabled, and shows labels in readPretty', () => {
    const { form, field } = binding('red', { enum: options, pattern: 'readOnly' })
    const el = target(Select, { field })
    expect(el.props.options.map((o: any) => o.value)).toEqual(['red', 'blue'])
    expect(el.props.disabled).toBe(true)
    el.props.onChange('blue', options[1])
    expect(form.getValue('x')).toBe('blue')
    const pretty = createForm({ initialValues: { x: 'blue' }, fields: { x: { enum: options, pattern: 'readPretty' } } })
    const html = renderToStaticMarkup(<Form form={pretty}><Select name="x" /></Form>)
    expect(html).toContain('蓝')
    expect(html).not.toContain('blue')
  })

  it('Switch and Checkbox bind checked; readPretty renders them disabled', () => {
    for (const Control of [Switch, Checkbox]) {
      const { form, field } = binding(false)
      const el = target(Control, { field })
      expect(el.props.checked).toBe(false)
      expect(el.props.status).toBeUndefined()
      el.props.onChange(Control === Switch ? true : { target: { type: 'checkbox', checked: true } })
      expect(form.getValue('x')).toBe(true)
      const pretty = binding(true, { pattern: 'readPretty' })
      expect(target(Control, { field: pretty.field }).props.disabled).toBe(true)
    }
  })

  it('Checkbox.Group and Radio.Group bind arrays / values with enum options', () => {
    const group = binding(['red'], { enum: options })
    const g = target(Checkbox.Group, { field: group.field })
    expect(g.props.options).toHaveLength(2)
    expect(g.props.id).toBeUndefined()
    g.props.onChange(['red', 'blue'])
    expect(group.form.getValue('x')).toEqual(['red', 'blue'])
    const radio = binding('red', { enum: options })
    const r = target(Radio.Group, { field: radio.field })
    r.props.onChange({ target: { type: 'radio', value: 'blue', checked: true } })
    expect(radio.form.getValue('x')).toBe('blue')
    const pretty = createForm({ initialValues: { x: ['red', 'blue'] }, fields: { x: { enum: options, pattern: 'readPretty' } } })
    expect(renderToStaticMarkup(<Form form={pretty}><Checkbox.Group name="x" /></Form>)).toContain('红, 蓝')
  })

  it('DatePicker stores the formatted string and hands the picker a dayjs', () => {
    const { form, field } = binding('2026-10-29')
    const el = target(DatePicker, { field })
    expect(dayjs.isDayjs(el.props.value)).toBe(true)
    expect(el.props.value.format('YYYY-MM-DD')).toBe('2026-10-29')
    el.props.onChange(dayjs('2026-11-01'), '2026-11-01')
    expect(form.getValue('x')).toBe('2026-11-01')
    target(DatePicker, { field: form.binding('x') }).props.onChange(null, '')
    expect(form.getValue('x')).toBeUndefined()
    const range = binding(['2026-01-01', '2026-01-31'])
    const r = target(DatePicker.RangePicker, { field: range.field })
    expect(r.props.value.map((d: any) => d.format('YYYY-MM-DD'))).toEqual(['2026-01-01', '2026-01-31'])
    r.props.onChange([dayjs('2026-02-01'), dayjs('2026-02-02')], ['2026-02-01', '2026-02-02'])
    expect(range.form.getValue('x')).toEqual(['2026-02-01', '2026-02-02'])
    const pretty = createForm({ initialValues: { x: '2026-10-29', y: ['2026-01-01', '2026-01-31'] }, fields: { x: { pattern: 'readPretty' }, y: { pattern: 'readPretty' } } })
    const html = renderToStaticMarkup(<Form form={pretty}><DatePicker name="x" /><DatePicker.RangePicker name="y" /></Form>)
    expect(html).toContain('2026-10-29')
    expect(html).toContain('2026-01-01 ~ 2026-01-31')
  })

  it('server-renders every control under FormItem', () => {
    const form = createForm({
      initialValues: { a: 'x', b: 2, c: 'red', d: true, e: true, f: ['red'], g: 'blue', h: '2026-10-29' },
      fields: { c: { enum: options }, f: { enum: options }, g: { enum: options } },
    })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormItem name="a" label="A"><Input /></FormItem>
        <FormItem name="b" label="B"><InputNumber /></FormItem>
        <FormItem name="c" label="C"><Select /></FormItem>
        <FormItem name="d" label="D"><Switch /></FormItem>
        <FormItem name="e" label="E"><Checkbox>同意</Checkbox></FormItem>
        <FormItem name="f" label="F"><Checkbox.Group /></FormItem>
        <FormItem name="g" label="G"><Radio.Group /></FormItem>
        <FormItem name="h" label="H"><DatePicker /></FormItem>
      </Form>,
    )
    expect(html).toContain('value="x"')
    expect(html).toContain('ant-switch-checked')
    expect(html).toContain('同意')
    expect(html.match(/ant-checkbox-wrapper-checked/g)?.length).toBe(2)
    expect(html).toContain('ant-radio-wrapper-checked')
    expect(html).toContain('value="2026-10-29"')
  })

  it('mapProps composes with a custom control', () => {
    const { form, field } = binding(0)
    const Stars = connect((_: { score?: number; onPick?: (n: number) => void }) => null, mapProps({ value: 'score', onChange: 'onPick', status: false }))
    const el = target(Stars, { field })
    expect(el.props.score).toBe(0)
    el.props.onPick(4)
    expect(form.getValue('x')).toBe(4)
  })
})
