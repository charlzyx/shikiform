import dayjs from 'dayjs'
import { createRef, forwardRef, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { createForm, defineEffects, Field, Form, useField, type FieldBinding } from '../src'
import { FieldContext } from '../src/react/field-context'
import { zhCN } from '../src/core/validation/messages'
import {
  Checkbox,
  connect,
  DatePicker,
  FormItem,
  FormLayout,
  Input,
  InputNumber,
  mapFieldProps,
  mapFormItemProps,
  mapProps,
  mapReadPretty,
  PreviewText,
  Radio,
  Select,
  Switch,
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
  // `connect` returns a forwardRef component: call its render with no ref.
  let element: ReactElement<any> = typeof Component === 'function' ? Component(props) : Component.render(props, null)
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

  it('binds from the surrounding <Field> without its own name', () => {
    const seen: Record<string, any>[] = []
    const Probe = connect((props: { value?: unknown }) => {
      seen.push(props)
      return null
    })
    const form = createForm({ initialValues: { city: 'Paris' } })
    renderToStaticMarkup(
      <Form form={form} id="f">
        <Field name="city" title="城市" decorator={[FormItem]}>
          <Probe />
        </Field>
      </Form>,
    )
    expect(seen.at(-1)!.value).toBe('Paris')
    expect(seen.at(-1)!.id).toBe('f-city')
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

  it('outside a field renders the plain control and warns once in development', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const Bare = connect(function BareControl(props: { label?: string }) { return <i>{props.label}</i> })
    const form = createForm({ initialValues: {} })
    expect(renderToStaticMarkup(<Form form={form}><Bare label="plain" /><Bare label="again" /></Form>)).toBe('<form><i>plain</i><i>again</i></form>')
    expect(renderToStaticMarkup(<Bare label="no form" />)).toBe('<i>no form</i>')
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/Connected\(BareControl\) is outside a <Field>/)
    warn.mockRestore()
  })

  it('forwards ref and hoists statics (Select.Option, Input.Search)', () => {
    let seen: unknown
    const Target = forwardRef<HTMLInputElement, { value?: string }>(function Target(props, ref) {
      seen = ref
      return <input ref={ref} readOnly value={props.value ?? ''} />
    })
    const withStatic = Object.assign(Target, { Extra: 'x' as const })
    const Connected = connect(withStatic)
    const _typed: 'x' = Connected.Extra
    void _typed
    const ref = createRef<HTMLInputElement>()
    const form = createForm({ initialValues: { a: 'v' } })
    renderToStaticMarkup(<Form form={form}><Connected name="a" ref={ref} /></Form>)
    expect(seen).toBe(ref)
    expect(Connected.Extra).toBe('x')
    expect(Select.Option).toBeDefined()
    expect((Input as any).Search).toBeDefined()
  })

  it('mapProps object keys take any field state: title, required, componentProps.x', () => {
    const Probe = vi.fn((_props: Record<string, unknown>) => null)
    const Connected = connect(Probe, mapProps({ title: 'placeholder', required: 'aria-required', 'componentProps.max': 'count' }))
    const form = createForm({ initialValues: { a: '' }, fields: { a: { title: '名称', required: true, componentProps: { max: 5 } } } })
    renderToStaticMarkup(<Form form={form}><Connected name="a" /></Form>)
    expect(Probe.mock.calls[0]![0]).toMatchObject({ placeholder: '名称', 'aria-required': true, count: 5 })
    renderToStaticMarkup(<Form form={form}><Connected name="a" placeholder="explicit" /></Form>)
    expect(Probe.mock.calls[1]![0]).toMatchObject({ placeholder: 'explicit' })
  })

  it('Radio is usable as a component itself (the group), with Radio.Group and Radio.Button', () => {
    const form = createForm({ initialValues: { r: 'b' }, fields: { r: { enum: [{ label: '甲', value: 'a' }, { label: '乙', value: 'b' }] } } })
    const html = renderToStaticMarkup(<Form form={form}><Field name="r" component={[Radio]} /></Form>)
    expect(html).toContain('ant-radio-group')
    expect(html).toContain('乙')
    expect(Radio.Group).toBe(Radio)
    expect(Radio.Button).toBeDefined()
  })
})

describe('FormItem', () => {
  it('shows label, required mark, and the first error after validation', async () => {
    const form = createForm({ initialValues: { email: '' } })
    const view = () =>
      renderToStaticMarkup(
        <Form form={form}>
          <Field name="email" title="邮箱" required decorator={[FormItem]}>
            <Input />
          </Field>
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

  it('is a pure decorator: the <Field> owns the rules as a mount lease', async () => {
    const form = createForm({ initialValues: { code: 'x' } })
    renderToStaticMarkup(
      <Form form={form}>
        <Field name="code" rules={{ minLength: 3 }} decorator={[FormItem]}>
          <Input />
        </Field>
      </Form>,
    )
    expect(await form.validate()).toEqual([{ path: 'code', messages: ['至少 3 个字符'] }])
  })

  it('renders nothing for display hidden / none and hides the required mark in readPretty', () => {
    const hidden = createForm({ initialValues: { a: 1 }, fields: { a: { display: 'hidden' } } })
    expect(renderToStaticMarkup(<Form form={hidden}><Field name="a" title="A" decorator={[FormItem]}><InputNumber /></Field></Form>)).not.toContain('A')
    const pretty = createForm({ initialValues: { a: 1 }, fields: { a: { pattern: 'readPretty', required: true } } })
    const html = renderToStaticMarkup(<Form form={pretty}><Field name="a" title="A" decorator={[FormItem]}><InputNumber /></Field></Form>)
    expect(html).not.toContain('ant-form-item-required')
    expect(html).toContain('data-read-pretty')
  })

  it('accepts a binding from useField (hooks first, component as sugar)', async () => {
    const form = createForm({ initialValues: { name: '' } })
    function Hooked() {
      const field = useField('name', { required: true, title: '姓名' })
      return (
        <FieldContext.Provider value={field}>
          <FormItem>
            <Input />
          </FormItem>
        </FieldContext.Provider>
      )
    }
    const html = renderToStaticMarkup(<Form form={form}><Hooked /></Form>)
    expect(html).toContain('姓名')
    expect(await form.validate()).toEqual([{ path: 'name', messages: ['必填'] }])
    const props = mapFormItemProps(form.binding('name', { title: '姓名' }) as FieldBinding<any>, { tooltip: 't' })
    expect(props).toMatchObject({ label: '姓名', required: true, validateStatus: 'error', help: '必填', tooltip: 't', htmlFor: 'name' })
  })

  it('outside a field is pure layout: a label around several fields, no status', () => {
    const form = createForm({ initialValues: { province: 'zj', city: 'hz' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormItem label="地址">
          <Field name="province" component={[Input]} />
          <Field name="city" component={[Input]} />
        </FormItem>
      </Form>,
    )
    expect(html).toContain('地址')
    expect(html).toContain('value="zj"')
    expect(html).toContain('value="hz"')
    expect(html.match(/ant-form-item-label/g)).toHaveLength(1)
    expect(mapFormItemProps(null, { label: 'x' })).toMatchObject({ label: 'x', required: false, validateStatus: undefined, help: undefined })
    expect(mapFormItemProps(null, { label: 'x' })).not.toHaveProperty('htmlFor')
  })

  it('maps title → label, description → extra, decoratorProps, and feedbackLayout', () => {
    const form = createForm({ initialValues: { a: '' }, fields: { a: { title: '声明标题', description: '说明', decoratorProps: { tooltip: 'tip' } } } })
    const field = form.binding('a') as FieldBinding<any>
    expect(mapFormItemProps(field, {})).toMatchObject({ label: '声明标题', extra: '说明', tooltip: 'tip' })
    expect(mapFormItemProps(field, { label: '显式', extra: 'x' })).toMatchObject({ label: '显式', extra: 'x' })
    expect(mapFormItemProps(field, { feedbackLayout: 'terse' }).style).toEqual({ marginBottom: 0 })
    expect(mapFormItemProps(field, { asterisk: true }).required).toBe(true)
    form.registerField('a', { required: true })
    void form.validate()
    const failed = form.binding('a') as FieldBinding<any>
    expect(mapFormItemProps(failed, { feedbackLayout: 'none' })).toMatchObject({ validateStatus: 'error', help: undefined })
    expect(mapFormItemProps(failed, {}, { layout: 'vertical', labelCol: { span: 4 } })).toMatchObject({ layout: 'vertical', labelCol: { span: 4 } })
  })
})

describe('<Field decorator component> (Formily style)', () => {
  it('renders the decorator around the component and passes tuple props', () => {
    const form = createForm({ initialValues: { email: 'a@b.c' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <Field name="email" title="邮箱" description="工作邮箱" required decorator={[FormItem, { tooltip: '提示' }]} component={[Input, { placeholder: 'name@example.com' }]} />
      </Form>,
    )
    expect(html).toContain('邮箱')
    expect(html).toContain('工作邮箱')
    expect(html).toContain('ant-form-item-required')
    expect(html).toContain('placeholder="name@example.com"')
    expect(html).toContain('value="a@b.c"')
  })

  it('declares the slots in fields: <Field name /> alone renders them', () => {
    const form = createForm({
      initialValues: { city: 'sh' },
      fields: { city: { title: '城市', decorator: [FormItem], component: [Select, { allowClear: true }], enum: [{ label: '上海', value: 'sh' }] } },
    })
    const html = renderToStaticMarkup(<Form form={form}><Field name="city" /></Form>)
    expect(html).toContain('城市')
    expect(html).toContain('上海')
  })

  it('a reaction patches $componentProps / $decoratorProps / $title and the control sees it', () => {
    type V = { kind: string; city: string }
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        const vip = d.kind.$value === 'vip'
        d.city.$componentProps.placeholder = vip ? 'VIP 城市' : '普通城市'
        d.city.$decoratorProps.tooltip = vip ? 'vip-tip' : undefined
        if (vip) d.city.$title = 'VIP 城市'
      })
    })
    const form = createForm<V>({ initialValues: { kind: 'normal', city: '' }, effects: [effects] })
    const view = () =>
      renderToStaticMarkup(
        <Form form={form}>
          <Field name="city" title="城市" decorator={[FormItem]} component={[Input, { placeholder: 'jsx', maxLength: 5 }]} />
        </Form>,
      )
    let html = view()
    expect(html).toContain('placeholder="普通城市"')
    expect(html).toContain('maxLength="5"')
    expect(html).toContain('城市')
    form.setValue('kind', 'vip')
    html = view()
    expect(html).toContain('placeholder="VIP 城市"')
    expect(html).toContain('VIP 城市')
  })

  it('table cells can use no decorator, or a different one', () => {
    const form = createForm({ initialValues: { a: 'x', b: 'y' } })
    function Cell({ children }: { children?: React.ReactNode }) {
      return <td data-cell>{children}</td>
    }
    const html = renderToStaticMarkup(
      <Form form={form}>
        <Field name="a" component={[Input]} />
        <Field name="b" decorator={[Cell]} component={[Input]} />
      </Form>,
    )
    expect(html).not.toContain('ant-form-item')
    expect(html).toContain('data-cell')
    expect(html).toContain('value="y"')
  })

  it('keeps the render-prop <Field> working, now with a field context', () => {
    const form = createForm({ initialValues: { a: 'x' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <Field name="a" title="A">
          {(field) => (
            <FormItem>
              <span data-v>{field.value}</span>
            </FormItem>
          )}
        </Field>
      </Form>,
    )
    expect(html).toContain('data-v')
    expect(html).toContain('A')
  })
})

describe('FormLayout', () => {
  it('is inherited by FormItem; nested layouts and decoratorProps win', () => {
    const form = createForm({ initialValues: { a: '', b: '' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout layout="vertical" colon={false}>
          <Field name="a" title="A" decorator={[FormItem]} component={[Input]} />
          <FormLayout layout="horizontal" labelCol={{ span: 6 }}>
            <Field name="b" title="B" decorator={[FormItem]} component={[Input]} />
          </FormLayout>
        </FormLayout>
      </Form>,
    )
    expect(html).toContain('ant-form-item-vertical')
    expect(html).toContain('ant-form-item-horizontal')
    expect(html).toContain('ant-col-6')
  })

  it('inline layout and size', () => {
    const form = createForm({ initialValues: { a: '' } })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <FormLayout layout="inline" size="small">
          <Field name="a" title="A" decorator={[FormItem]} component={[Input]} />
        </FormLayout>
      </Form>,
    )
    expect(html).toContain('data-form-layout="inline"')
    expect(html).toContain('ant-input-sm')
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

  it('Switch and Checkbox bind checked; readPretty shows messages.yes / no', () => {
    for (const Control of [Switch, Checkbox]) {
      const { form, field } = binding(false)
      const el = target(Control, { field })
      expect(el.props.checked).toBe(false)
      expect(el.props.status).toBeUndefined()
      el.props.onChange(Control === Switch ? true : { target: { type: 'checkbox', checked: true } })
      expect(form.getValue('x')).toBe(true)
      const pretty = createForm({ initialValues: { x: true, y: false }, fields: { x: { pattern: 'readPretty' }, y: { pattern: 'readPretty' } } })
      const html = renderToStaticMarkup(<Form form={pretty}><Control name="x" /><Control name="y" /></Form>)
      expect(html).toContain(zhCN.yes)
      expect(html).toContain(zhCN.no)
      expect(html).not.toContain('ant-switch')
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
    const groupHtml = renderToStaticMarkup(<Form form={pretty}><Checkbox.Group name="x" /></Form>)
    expect(groupHtml).toContain('ant-tag')
    expect(groupHtml).toContain('红')
    expect(groupHtml).toContain('蓝')
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

  it('server-renders every control in a FormItem-decorated <Field>', () => {
    const form = createForm({
      initialValues: { a: 'x', b: 2, c: 'red', d: true, e: true, f: ['red'], g: 'blue', h: '2026-10-29' },
      fields: { c: { enum: options }, f: { enum: options }, g: { enum: options } },
    })
    const html = renderToStaticMarkup(
      <Form form={form}>
        <Field name="a" title="A" decorator={[FormItem]}><Input /></Field>
        <Field name="b" title="B" decorator={[FormItem]}><InputNumber /></Field>
        <Field name="c" title="C" decorator={[FormItem]}><Select /></Field>
        <Field name="d" title="D" decorator={[FormItem]}><Switch /></Field>
        <Field name="e" title="E" decorator={[FormItem]}><Checkbox>同意</Checkbox></Field>
        <Field name="f" title="F" decorator={[FormItem]}><Checkbox.Group /></Field>
        <Field name="g" title="G" decorator={[FormItem]}><Radio.Group /></Field>
        <Field name="h" title="H" decorator={[FormItem]}><DatePicker /></Field>
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
