// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Field,
  Form,
  Reset,
  Submit,
  connect,
  mapBlur,
  mapFieldProps,
  mapProps,
  useField,
  useFieldDecorator,
  useForm,
  type FieldBinding,
} from '../src'
import { Reset as AntReset } from '../src/antd'
import { createEngine } from '../src/core/engine/create'

afterEach(() => cleanup())

function requiredField(value = '') {
  const form = createEngine({ initialValues: { city: value }, fields: { city: { required: true, title: '城市' } } })
  return { form, field: form.binding('city') as FieldBinding<any> }
}

describe('mapFieldProps blur fallback', () => {
  it('does not pass status unless it is mapped', async () => {
    expect('status' in mapFieldProps(requiredField().field, {})).toBe(false)
    const { form } = requiredField()
    await form.validate()
    const field = form.binding('city') as FieldBinding<any>
    expect(mapFieldProps(field, {}, { status: 'status' }).status).toBe('error')
    expect(mapFieldProps(field, { status: 'warning' }, { status: 'status' }).status).toBe('warning')
  })

  it('treats onOpenChange(false) as blur and does not pass onBlur', async () => {
    const { form, field } = requiredField()
    const onOpenChange = vi.fn()
    const props = mapFieldProps(field, { onOpenChange }, { blurOn: 'onOpenChange' })
    expect('onBlur' in props).toBe(false)
    props.onOpenChange(true)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(form.binding('city').touched).toBe(false)
    props.onOpenChange(false)
    expect(onOpenChange).toHaveBeenCalledTimes(2)
    expect(form.binding('city').touched).toBe(true)
    expect(form.binding('city').errors).toEqual(['必填'])
  })

  it('treats onChange as blur after the value is written', () => {
    const { form, field } = requiredField()
    const onChange = vi.fn()
    const props = mapFieldProps(field, { onChange }, { blurOn: 'onChange' })
    expect(props.onBlur).toBeUndefined()
    props.onChange('杭州')
    expect(form.getValue('city')).toBe('杭州')
    expect(onChange).toHaveBeenCalledWith('杭州')
    expect(form.binding('city').touched).toBe(true)
    expect(form.binding('city').errors).toEqual([])
  })

  it('calls field.onBlur from a custom prop when `when` says so', () => {
    const { form, field } = requiredField()
    const onDismiss = vi.fn()
    const props = mapFieldProps(field, { onDismiss }, { blurOn: { prop: 'onDismiss', when: (reason: string) => reason === 'close' } })
    props.onDismiss('hover')
    expect(form.binding('city').touched).toBe(false)
    props.onDismiss('close')
    expect(onDismiss).toHaveBeenCalledTimes(2)
    expect(form.binding('city').touched).toBe(true)
    expect(form.binding('city').errors).toEqual(['必填'])
  })

  it('onBlur: false opts out and does not validate', () => {
    const { form, field } = requiredField()
    const props = mapFieldProps(field, {}, { onBlur: false })
    expect(props.onBlur).toBeUndefined()
    expect(form.binding('city').touched).toBe(false)
  })
})

describe('connect requires a blur decision when the control has no onBlur', () => {
  function NoBlur(props: { value?: string; onOpenChange?: (open: boolean) => void }) {
    return <span>{props.value}</span>
  }
  // @ts-expect-error no onBlur: blur validation would be dropped without blurOn / onBlur: false
  connect(NoBlur)
  connect(NoBlur, mapProps({ blurOn: 'onOpenChange' }))
  connect(NoBlur, mapBlur('onChange'))
  connect(NoBlur, mapProps({ onBlur: false }))

  it('wires onOpenChange close through connect so a Lobe-style select still validates', () => {
    const seen: Record<string, any>[] = []
    const Select = connect(
      function LobeSelect(props: { value?: string; onChange?: (value: string) => void; onOpenChange?: (open: boolean) => void }) {
        seen.push(props)
        return null
      },
      mapProps({ blurOn: 'onOpenChange' }),
    )
    const form = createEngine({ initialValues: { city: '' }, fields: { city: { required: true } } })
    render(<Form form={form}><Select name="city" /></Form>)
    expect(seen.at(-1)!.onBlur).toBeUndefined()
    act(() => seen.at(-1)!.onOpenChange(false))
    expect(form.binding('city').errors).toEqual(['必填'])
    act(() => {
      seen.at(-1)!.onChange('sh')
      seen.at(-1)!.onOpenChange(false)
    })
    expect(form.getValue('city')).toBe('sh')
    expect(form.binding('city').errors).toEqual([])
  })
})

describe('useFieldDecorator', () => {
  it('returns label, required, errors, and described-by ids for a decorator', async () => {
    const form = createEngine({
      initialValues: { email: '' },
      fields: { email: { title: '邮箱', description: '工作用', required: true } },
    })
    function Item() {
      const d = useFieldDecorator()
      return (
        <div>
          <label {...d.labelProps}>{d.label}{d.required ? '*' : ''}</label>
          {d.descriptionProps ? <p {...d.descriptionProps}>{d.description}</p> : null}
          {d.errorProps ? <p {...d.errorProps}>{d.errors.join('、')}</p> : null}
          <span data-describedby={d.describedBy ?? ''} data-invalid={d.invalid ? '1' : '0'} />
          <span data-control={d.control['aria-invalid'] ? 'invalid' : 'ok'} data-error={d.control.error ?? ''} />
        </div>
      )
    }
    const view = render(
      <Form form={form} id="f">
        <Field name="email"><Item /></Field>
      </Form>,
    )
    const label = view.getByText('邮箱*').closest('label')!
    expect(label.getAttribute('for')).toBe('f-email')
    expect(view.getByText('工作用').id).toBe('f-email-description')
    expect(view.getByText('邮箱*').closest('div')!.querySelector('[data-invalid]')!.getAttribute('data-invalid')).toBe('0')
    await act(async () => { await form.validate() })
    expect(view.getByRole('alert').textContent).toBe('必填')
    expect(view.getByRole('alert').id).toBe('f-email-error')
    expect(view.container.querySelector('[data-describedby]')!.getAttribute('data-describedby')).toBe('f-email-description f-email-error')
    expect(view.container.querySelector('[data-control]')!.getAttribute('data-error')).toBe('必填')
  })

  it('hides the mark and htmlFor in readPretty, and asterisk forces the mark', () => {
    const form = createEngine({
      initialValues: { email: 'a@b.c' },
      fields: { email: { title: '邮箱', required: true, pattern: 'readPretty' } },
    })
    function Item({ asterisk }: { asterisk?: boolean }) {
      const d = useFieldDecorator({ asterisk })
      return <label {...d.labelProps}>{d.label}{d.required ? '*' : ''}</label>
    }
    const view = render(
      <Form form={form} id="f">
        <Field name="email"><Item /></Field>
      </Form>,
    )
    const label = view.getByText('邮箱')
    expect(label.hasAttribute('for')).toBe(false)
    view.rerender(
      <Form form={form} id="f">
        <Field name="email"><Item asterisk /></Field>
      </Form>,
    )
    expect(view.getByText('邮箱*')).toBeTruthy()
  })

  it('accepts an explicit binding and throws outside a field otherwise', () => {
    function ByName() {
      const field = useField('email')
      const d = useFieldDecorator({ field, label: '覆盖' })
      return <span>{d.label}</span>
    }
    function Bare() {
      useFieldDecorator()
      return null
    }
    const form = createEngine({ initialValues: { email: '' }, fields: { email: { title: '邮箱' } } })
    const view = render(<Form form={form}><ByName /></Form>)
    expect(view.getByText('覆盖')).toBeTruthy()
    expect(() => render(<Form form={form}><Bare /></Form>)).toThrow(/useFieldDecorator/)
  })
})

describe('headless Submit and Reset', () => {
  it('Submit is a native submit until it has its own onSubmit, and disables after errors', async () => {
    const onSubmit = vi.fn()
    function App({ own }: { own?: boolean }) {
      const form = useForm({ initialValues: { name: '' }, fields: { name: { required: true } } })
      return (
        <Form form={form} onSubmit={onSubmit}>
          <Field name="name" component={[function Name(props: { value?: string; onChange?: (v: string) => void; onBlur?: () => void }) {
            return <input aria-label="姓名" value={props.value ?? ''} onChange={(event) => props.onChange?.(event.target.value)} onBlur={props.onBlur} />
          }]} />
          {own
            ? <Submit onSubmit={onSubmit}>存</Submit>
            : <Submit asChild><button>提交</button></Submit>}
        </Form>
      )
    }
    const view = render(<App />)
    const button = view.getByRole('button', { name: '提交' }) as HTMLButtonElement
    expect(button.type).toBe('submit')
    expect(button.disabled).toBe(false)
    await act(async () => { button.click() })
    expect(onSubmit).not.toHaveBeenCalled()
    expect(button.disabled).toBe(true)
  })

  it('render-prop Submit runs onSubmit on click and exposes loading', async () => {
    const onSubmit = vi.fn()
    function App() {
      const form = useForm({ initialValues: { name: 'Ada' } })
      return (
        <Form form={form}>
          <Submit onSubmit={onSubmit}>
            {(state) => <button type={state.type} disabled={state.disabled} onClick={state.onClick}>{state.loading ? '…' : '保存'}</button>}
          </Submit>
        </Form>
      )
    }
    const view = render(<App />)
    const button = view.getByRole('button', { name: '保存' }) as HTMLButtonElement
    expect(button.type).toBe('button')
    await act(async () => { fireEvent.click(button) })
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ name: 'Ada' })
  })

  it('Reset afterReset sees the restored values; preventDefault skips both', () => {
    const after = vi.fn()
    let api!: ReturnType<typeof useForm<{ a: string }>>
    function App({ cancel }: { cancel?: boolean }) {
      const form = useForm({ initialValues: { a: 'init' } })
      api = form
      return (
        <Form form={form}>
          <Reset
            onClick={cancel ? (event) => event.preventDefault() : undefined}
            afterReset={after}
          >重置</Reset>
        </Form>
      )
    }
    const view = render(<App />)
    act(() => api.setValue('a', 'edited'))
    fireEvent.click(view.getByRole('button', { name: '重置' }))
    expect(api.getValue('a')).toBe('init')
    expect(after).toHaveBeenCalledExactlyOnceWith({ a: 'init' })
    view.unmount()
    after.mockClear()
    const cancelled = render(<App cancel />)
    act(() => api.setValue('a', 'edited'))
    fireEvent.click(cancelled.getByRole('button', { name: '重置' }))
    expect(api.getValue('a')).toBe('edited')
    expect(after).not.toHaveBeenCalled()
  })

  it('antd Reset afterReset runs after the reset, onClick still sees the old value', () => {
    const seen: string[] = []
    let api!: ReturnType<typeof useForm<{ a: string }>>
    function App() {
      const form = useForm({ initialValues: { a: 'init' } })
      api = form
      return (
        <Form form={form}>
          <AntReset
            onClick={() => seen.push(api.getValue('a'))}
            afterReset={(values) => seen.push(values.a)}
          />
        </Form>
      )
    }
    const view = render(<App />)
    act(() => api.setValue('a', 'edited'))
    fireEvent.click(view.getByRole('button'))
    expect(seen).toEqual(['edited', 'init'])
    expect(api.getValue('a')).toBe('init')
  })
})
