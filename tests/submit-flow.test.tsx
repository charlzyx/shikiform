// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Form,
  createForm,
  createFormHook,
  createFormHookContexts,
  enUS,
  getDefaultMessages,
  setDefaultMessages,
  useForm,
  zhCN,
  type FieldError,
} from '../src'
import type { StandardSchemaV1 } from '../src/core'

afterEach(() => {
  cleanup()
  setDefaultMessages(zhCN)
})

const ctx = createFormHookContexts()
function TextInput({ label }: { label: string }) {
  const f = ctx.useFieldContext<string>()
  return <input aria-label={label} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} />
}
const { useAppForm } = createFormHook({ fieldContext: ctx.fieldContext, formContext: ctx.formContext, fieldComponents: { TextInput } })

type Login = { email: string; password: string }

async function submitNative(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('AppForm submit callbacks (#37)', () => {
  function Login(props: { onValid: (v: Login) => void; onInvalid?: (e: FieldError[]) => void }) {
    const form = useAppForm<Login>({ initialValues: { email: '', password: '' }, fields: { email: { required: true } } })
    return (
      <form.AppForm onSubmit={props.onValid} onInvalid={props.onInvalid} id="login" className="login-form" noValidate>
        <form.AppField name="email">{(f) => <f.TextInput label="邮箱" />}</form.AppField>
        <form.AppField name="password">{(f) => <f.TextInput label="密码" />}</form.AppField>
        <button type="submit">登录</button>
      </form.AppForm>
    )
  }

  it('native submit (Enter / type=submit) calls onSubmit with the values', async () => {
    const onValid = vi.fn()
    const { container } = render(<Login onValid={onValid} />)
    fireEvent.change(screen.getByLabelText('邮箱'), { target: { value: 'a@b.com' } })
    await submitNative(container)
    expect(onValid).toHaveBeenCalledExactlyOnceWith({ email: 'a@b.com', password: '' })
  })

  it('calls onInvalid with the errors and not onSubmit when validation fails', async () => {
    const onValid = vi.fn()
    const onInvalid = vi.fn()
    const { container } = render(<Login onValid={onValid} onInvalid={onInvalid} />)
    await submitNative(container)
    expect(onValid).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledExactlyOnceWith([{ path: 'email', messages: ['必填'] }])
  })

  it('passes native <form> attributes through', () => {
    const { container } = render(<Login onValid={() => {}} />)
    const form = container.querySelector('form')!
    expect(form.id).toBe('login')
    expect(form.className).toBe('login-form')
    expect(form.noValidate).toBe(true)
  })

  it('createFormHook({ messages }) applies to every useAppForm', async () => {
    const hook = createFormHook({ ...ctx, fieldComponents: { TextInput }, messages: { required: 'Required' } })
    let errors: FieldError[] = []
    function App() {
      const form = hook.useAppForm<{ a: string; b: string }>({
        initialValues: { a: '', b: '' },
        fields: { a: { required: true }, b: { rules: { minLength: 2 } } },
        messages: { minLength: ({ minLength }) => `min ${minLength}` },
      })
      return <form.AppForm onInvalid={(e) => (errors = e)} />
    }
    const { container } = render(<App />)
    await submitNative(container)
    expect(errors).toEqual([{ path: 'a', messages: ['Required'] }, { path: 'b', messages: ['min 2'] }])
  })
})

describe('<Form> submit flow (#38)', () => {
  function App(props: { onSubmit: () => unknown; onInvalid?: (e: FieldError[]) => void; onSubmitError?: (e: unknown) => void; required?: boolean }) {
    const form = useForm<{ a: string }>({ initialValues: { a: props.required ? '' : 'x' }, fields: { a: { required: !!props.required } } })
    return (
      <Form
        form={form}
        onSubmit={props.onSubmit as () => void}
        onInvalid={props.onInvalid}
        onSubmitError={props.onSubmitError}
        id="profile"
        className="my-form"
        noValidate
        aria-label="资料"
      >
        <button type="submit">提交</button>
      </Form>
    )
  }

  it('passes DOM attributes through to <form>', () => {
    const { container } = render(<App onSubmit={() => {}} />)
    const form = container.querySelector('form')!
    expect(form.id).toBe('profile')
    expect(form.className).toBe('my-form')
    expect(form.noValidate).toBe(true)
    expect(form.getAttribute('aria-label')).toBe('资料')
  })

  it('calls onInvalid with the errors', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    const { container } = render(<App required onSubmit={onSubmit} onInvalid={onInvalid} />)
    await submitNative(container)
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onInvalid).toHaveBeenCalledExactlyOnceWith([{ path: 'a', messages: ['必填'] }])
  })

  it('a throwing onSubmit goes to onSubmitError, never an unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const boom = new Error('409')
      const onSubmitError = vi.fn()
      const { container } = render(<App onSubmit={async () => { throw boom }} onSubmitError={onSubmitError} />)
      await submitNative(container)
      await new Promise((r) => setTimeout(r, 20))
      expect(onSubmitError).toHaveBeenCalledExactlyOnceWith(boom)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('without onSubmitError the error is reported with console.error', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const boom = new Error('409')
      const { container } = render(<App onSubmit={() => { throw boom }} />)
      await submitNative(container)
      await new Promise((r) => setTimeout(r, 20))
      expect(spy).toHaveBeenCalledWith('[shikiform] onSubmit failed', boom)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      spy.mockRestore()
      process.off('unhandledRejection', unhandled)
    }
  })

  it('form.submit() resolves reason "error" instead of rejecting', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: 'x' } })
    const boom = new Error('409')
    expect(await form.submit(() => { throw boom })).toEqual({ ok: false, reason: 'error', errors: [], error: boom })
    expect(form.submitting).toBe(false)
  })
})

describe('concurrent submit on unchanged values (#41)', () => {
  it('both submits succeed; neither returns the retry message', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: 'x' } })
    const save = vi.fn(async () => { await new Promise((r) => setTimeout(r, 30)) })
    const [r1, r2] = await Promise.all([form.submit(save), form.submit(save)])
    expect(r1).toEqual({ ok: true, values: { a: 'x' } })
    expect(r2).toEqual({ ok: true, values: { a: 'x' } })
    expect(save).toHaveBeenCalledTimes(2)
    expect(form.submitting).toBe(false)
  })

  it('with async rules too', async () => {
    const form = createForm<{ a: string }>({
      initialValues: { a: 'x' },
      fields: { a: { rules: { validator: async (v) => { await new Promise((r) => setTimeout(r, 10)); return v ? null : 'empty' } } } },
    })
    const results = await Promise.all([form.submit(), form.submit(), form.submit()])
    expect(results.map((r) => r.ok)).toEqual([true, true, true])
  })

  it('concurrent submits on an invalid form all report the same errors', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: '' }, fields: { a: { required: true } } })
    const [r1, r2] = await Promise.all([form.submit(), form.submit()])
    expect(r1).toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'a', messages: ['必填'] }] })
    expect(r2).toEqual(r1)
  })
})

describe('built-in messages (#44)', () => {
  type V = { name: string; email: string; site: string; agree: boolean; bio: string; long: string; code: string; color: string; age: number; big: number; boom: number }
  const initialValues: V = { name: '', email: 'bad', site: 'nope', agree: false, bio: 'a', long: 'abcdef', code: 'x', color: 'pink', age: 1, big: 99, boom: 0 }
  const fields = {
    name: { required: true },
    email: { rules: { format: 'email' as const } },
    site: { rules: { format: 'url' as const } },
    agree: { rules: { isTrue: true } },
    bio: { rules: { minLength: 3 } },
    long: { rules: { maxLength: 3 } },
    code: { rules: { pattern: /^\d+$/ } },
    age: { rules: { min: 18 } },
    big: { rules: { max: 10 } },
    boom: { rules: { validator: () => { throw new Error() } } },
    color: { enum: [{ label: 'Red', value: 'red' }] },
  }

  it('defaults stay Chinese', async () => {
    const form = createForm<V>({ initialValues, enumPolicy: 'error', fields })
    expect(await form.validate()).toEqual([
      { path: 'name', messages: ['必填'] },
      { path: 'email', messages: ['邮箱格式不对'] },
      { path: 'site', messages: ['URL 格式不对'] },
      { path: 'agree', messages: ['必须勾选'] },
      { path: 'bio', messages: ['至少 3 个字符'] },
      { path: 'long', messages: ['最多 3 个字符'] },
      { path: 'code', messages: ['格式不对'] },
      { path: 'age', messages: ['不能小于 18'] },
      { path: 'big', messages: ['不能大于 10'] },
      { path: 'boom', messages: ['校验失败'] },
      { path: 'color', messages: ['不在可选范围内'] },
    ])
  })

  it('FormOptions.messages: enUS covers every built-in message', async () => {
    const form = createForm<V>({ initialValues, enumPolicy: 'error', fields, messages: enUS })
    expect(await form.validate()).toEqual([
      { path: 'name', messages: ['Required'] },
      { path: 'email', messages: ['Invalid email address'] },
      { path: 'site', messages: ['Invalid URL'] },
      { path: 'agree', messages: ['Must be checked'] },
      { path: 'bio', messages: ['At least 3 characters'] },
      { path: 'long', messages: ['At most 3 characters'] },
      { path: 'code', messages: ['Invalid format'] },
      { path: 'age', messages: ['Must be at least 18'] },
      { path: 'big', messages: ['Must be at most 10'] },
      { path: 'boom', messages: ['Invalid value'] },
      { path: 'color', messages: ['Not an allowed option'] },
    ])
  })

  it('function messages receive parameters; partial overrides fall back to defaults; rule.message wins', async () => {
    const form = createForm<{ a: string; b: number; c: string; d: string; e: string }>({
      initialValues: { a: 'x', b: 1, c: '', d: '', e: 'pink' },
      enumPolicy: 'error',
      fields: {
        a: { rules: { minLength: 3 } },
        b: { rules: { min: 5 } },
        c: { required: true },
        d: { rules: { required: true, message: 'own message' } },
        e: { enum: ['red', 'blue'] },
      },
      messages: {
        minLength: ({ path, minLength, length }) => `${path}: ${length}/${minLength}`,
        min: ({ min, value }) => `${String(value)} < ${min}`,
        enum: ({ options, value }) => `${String(value)} ∉ ${options.map((o) => o.value).join('|')}`,
      },
    })
    expect(await form.validate()).toEqual([
      { path: 'a', messages: ['a: 1/3'] },
      { path: 'b', messages: ['1 < 5'] },
      { path: 'c', messages: ['必填'] },
      { path: 'd', messages: ['own message'] },
      { path: 'e', messages: ['pink ∉ red|blue'] },
    ])
  })

  it('fallback covers schema issues without a message, async throws, and form-level schemas', async () => {
    const emptyIssue: StandardSchemaV1 = { '~standard': { version: 1, vendor: 't', validate: () => ({ issues: [{ message: '' }] }) } }
    const rootIssue: StandardSchemaV1<any> = { '~standard': { version: 1, vendor: 't', validate: () => ({ issues: [{ message: '', path: ['c'] }] }) } }
    const form = createForm<{ a: string; b: string; c: string }>({
      initialValues: { a: 'x', b: 'y', c: 'z' },
      fields: {
        a: { rules: emptyIssue },
        b: { rules: { validator: async () => { throw new Error('') } } },
      },
      validate: rootIssue,
      messages: { fallback: ({ path }) => `bad ${path}` },
    })
    expect(await form.validate()).toEqual([
      { path: 'a', messages: ['bad a'] },
      { path: 'b', messages: ['bad b'] },
      { path: 'c', messages: ['bad c'] },
    ])
  })

  it('superseded message is configurable and the result is structured', async () => {
    let calls = 0
    const form = createForm({
      initialValues: { n: 0 },
      messages: { superseded: 'Form changed, please submit again' },
      validate: async () => {
        calls += 1
        form.setValue('n', calls)
        return {}
      },
    })
    expect(await form.submit()).toEqual({ ok: false, reason: 'superseded', errors: [], message: 'Form changed, please submit again' })
  })

  it('setDefaultMessages changes the app-wide defaults; form messages still win', async () => {
    setDefaultMessages(enUS)
    expect(getDefaultMessages().required).toBe('Required')
    const a = createForm<{ x: string }>({ initialValues: { x: '' }, fields: { x: { required: true } } })
    const b = createForm<{ x: string }>({ initialValues: { x: '' }, fields: { x: { required: true } }, messages: { required: '必须填' } })
    expect(await a.validate()).toEqual([{ path: 'x', messages: ['Required'] }])
    expect(await b.validate()).toEqual([{ path: 'x', messages: ['必须填'] }])
    setDefaultMessages(zhCN)
    expect(await a.validate()).toEqual([{ path: 'x', messages: ['必填'] }])
  })
})
