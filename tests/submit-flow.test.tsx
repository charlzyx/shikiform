// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fieldErrorsOf } from './field-errors'
import { SubmitSupersededError, SubmitUnstableError, isFieldErrors } from '@shikiform/react'
import {
  Form,
  createForm,
  Field,
  enUS,
  getDefaultMessages,
  setDefaultMessages,
  useField,
  useForm,
  zhCN,
  type FieldError,
} from '@shikiform/react'
import type { StandardSchemaV1 } from '@shikiform/core'
import { Reset, Submit } from '@shikiform/antd'

afterEach(() => {
  cleanup()
  setDefaultMessages(zhCN)
})

function TextInput({ label }: { label: string }) {
  const f = useField<string>()
  return <input aria-label={label} value={f.value ?? ''} onChange={(e) => f.onChange(e.target.value)} />
}

type Login = { email: string; password: string }

async function submitNative(container: HTMLElement) {
  await act(async () => {
    fireEvent.submit(container.querySelector('form')!)
  })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

describe('<Form> submit callbacks (#37)', () => {
  function Login(props: { onValid: (v: Login) => void; onInvalid?: (e: FieldError[]) => void }) {
    const form = useForm<Login>({ initialValues: { email: '', password: '' }, fields: { email: { required: true } } })
    return (
      <Form form={form} onSubmit={props.onValid} onInvalid={props.onInvalid} id="login" className="login-form" noValidate>
        <Field name="email" component={[TextInput, { label: '邮箱' }]} />
        <Field name="password" component={[TextInput, { label: '密码' }]} />
        <button type="submit">登录</button>
      </Form>
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

  it('form.submit() rejects the error onValid threw', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: 'x' } })
    const boom = new Error('409')
    await expect(form.submit(() => { throw boom })).rejects.toBe(boom)
    expect(form.submitting).toBe(false)
  })
})

describe('submit / validate promises', () => {
  it('resolves the values, or onValid\'s return when that is not undefined', async () => {
    const form = createForm<{ name: string }>({ initialValues: { name: 'ada' } })
    expect(await form.submit()).toEqual({ name: 'ada' })
    expect(await form.submit(async () => undefined)).toEqual({ name: 'ada' })
    expect(await form.submit(async (values) => values.name.length)).toBe(3)
  })

  it('validate(path) resolves when the path is clean and rejects FieldError[] when it is not', async () => {
    const form = createForm<{ name: string }>({ initialValues: { name: '' }, fields: { name: { required: true } } })
    await expect(form.validate('name')).rejects.toEqual([{ path: 'name', messages: ['必填'] }])
    form.setValue('name', 'ada')
    await expect(form.validate('name')).resolves.toBeUndefined()
    await expect(form.validate()).resolves.toBeUndefined()
  })
})

describe('concurrent submit (#41)', () => {
  it('an older submit rejects SubmitSupersededError; the latest one resolves the values', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: 'x' } })
    const save = vi.fn(async () => { await new Promise((r) => setTimeout(r, 30)) })
    const [r1, r2] = await Promise.allSettled([form.submit(save), form.submit(save)])
    expect(r1.status).toBe('rejected')
    if (r1.status === 'rejected') expect(r1.reason).toBeInstanceOf(SubmitSupersededError)
    expect(r2).toEqual({ status: 'fulfilled', value: { a: 'x' } })
    expect(save).toHaveBeenCalledTimes(1)
    expect(form.submitting).toBe(false)
  })

  it('with async rules too, only the latest submit resolves', async () => {
    const form = createForm<{ a: string }>({
      initialValues: { a: 'x' },
      fields: { a: { rules: { validator: async (v) => { await new Promise((r) => setTimeout(r, 10)); return v ? null : 'empty' } } } },
    })
    const results = await Promise.allSettled([form.submit(), form.submit(), form.submit()])
    expect(results[0]?.status).toBe('rejected')
    expect(results[1]?.status).toBe('rejected')
    expect(results[2]).toEqual({ status: 'fulfilled', value: { a: 'x' } })
    if (results[0]?.status === 'rejected') expect(results[0].reason).toBeInstanceOf(SubmitSupersededError)
  })

  it('the latest invalid submit rejects FieldError[]; an older one rejects SubmitSupersededError', async () => {
    const form = createForm<{ a: string }>({ initialValues: { a: '' }, fields: { a: { required: true } } })
    const [r1, r2] = await Promise.allSettled([form.submit(), form.submit()])
    expect(r1.status).toBe('rejected')
    if (r1.status === 'rejected') expect(r1.reason).toBeInstanceOf(SubmitSupersededError)
    expect(r2.status).toBe('rejected')
    if (r2.status === 'rejected') expect(r2.reason).toEqual([{ path: 'a', messages: ['必填'] }])
    expect(isFieldErrors(r2.status === 'rejected' ? r2.reason : null)).toBe(true)
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
    expect(await fieldErrorsOf(form.validate())).toEqual([
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
    expect(await fieldErrorsOf(form.validate())).toEqual([
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
    expect(await fieldErrorsOf(form.validate())).toEqual([
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
    expect(await fieldErrorsOf(form.validate())).toEqual([
      { path: 'a', messages: ['bad a'] },
      { path: 'b', messages: ['bad b'] },
      { path: 'c', messages: ['bad c'] },
    ])
  })

  it('values that never settle reject SubmitUnstableError, not SubmitSupersededError', async () => {
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
    const error = await form.submit().then(() => null, (reason) => reason)
    expect(error).toBeInstanceOf(SubmitUnstableError)
    expect(error).not.toBeInstanceOf(SubmitSupersededError)
    expect(error).toMatchObject({ code: 'unstable', message: 'Form changed, please submit again' })
    expect(calls).toBe(3)
  })

  it('setDefaultMessages changes the app-wide defaults; form messages still win', async () => {
    setDefaultMessages(enUS)
    expect(getDefaultMessages().required).toBe('Required')
    const a = createForm<{ x: string }>({ initialValues: { x: '' }, fields: { x: { required: true } } })
    const b = createForm<{ x: string }>({ initialValues: { x: '' }, fields: { x: { required: true } }, messages: { required: '必须填' } })
    expect(await fieldErrorsOf(a.validate())).toEqual([{ path: 'x', messages: ['Required'] }])
    expect(await fieldErrorsOf(b.validate())).toEqual([{ path: 'x', messages: ['必须填'] }])
    setDefaultMessages(zhCN)
    expect(await fieldErrorsOf(a.validate())).toEqual([{ path: 'x', messages: ['必填'] }])
  })
})

describe('antd Submit / Reset', () => {
  it('Submit with onSubmit submits on click, without a native <form> around it', async () => {
    const onSubmit = vi.fn()
    const onInvalid = vi.fn()
    let api: any
    function App({ ok }: { ok: boolean }) {
      const form = useForm({ initialValues: { a: ok ? 'x' : '' }, fields: { a: { required: true } } })
      api = form
      return (
        <Form form={form}>
          <Submit onSubmit={onSubmit} onInvalid={onInvalid}>save</Submit>
        </Form>
      )
    }
    const ok = render(<App ok />)
    const button = ok.getByRole('button') as HTMLButtonElement
    expect(button.type).toBe('button')
    await act(async () => {
      fireEvent.click(button)
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ a: 'x' })
    ok.unmount()
    const bad = render(<App ok={false} />)
    await act(async () => {
      fireEvent.click(bad.getByRole('button'))
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(onInvalid).toHaveBeenCalledOnce()
    expect(api.errors).toEqual([{ path: 'a', messages: ['必填'] }])
  })

  it('<Form> and <Submit> send an unstable submit to onSubmitError, not onInvalid', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      let calls = 0
      const form = createForm({
        initialValues: { n: 0 },
        validate: async () => {
          calls += 1
          form.setValue('n', calls)
          return {}
        },
      })
      const onSubmitError = vi.fn()
      const onInvalid = vi.fn()
      const view = render(
        <Form form={form} onSubmitError={onSubmitError} onInvalid={onInvalid}>
          <button type="submit">go</button>
          <Submit onSubmit={() => undefined} onSubmitError={onSubmitError} onInvalid={onInvalid}>save</Submit>
        </Form>,
      )
      await act(async () => {
        fireEvent.submit(view.container.querySelector('form')!)
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(onInvalid).not.toHaveBeenCalled()
      expect(onSubmitError).toHaveBeenCalledOnce()
      expect(onSubmitError.mock.calls[0]?.[0]).toBeInstanceOf(SubmitUnstableError)
      onSubmitError.mockClear()
      await act(async () => {
        fireEvent.click(view.getByText('save'))
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(onInvalid).not.toHaveBeenCalled()
      expect(onSubmitError).toHaveBeenCalledOnce()
      expect(onSubmitError.mock.calls[0]?.[0]).toBeInstanceOf(SubmitUnstableError)
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('Submit catches a throwing onSubmit and a failed validation; neither is an unhandled rejection', async () => {
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      const boom = new Error('409')
      const onSubmitError = vi.fn()
      const onInvalid = vi.fn()
      function App({ broken }: { broken: boolean }) {
        const form = useForm({ initialValues: { a: broken ? '' : 'x' }, fields: { a: { required: true } } })
        return (
          <Form form={form}>
            <Submit onSubmit={() => { if (!broken) throw boom }} onSubmitError={onSubmitError} onInvalid={onInvalid}>save</Submit>
          </Form>
        )
      }
      const ok = render(<App broken={false} />)
      await act(async () => {
        fireEvent.click(ok.getByRole('button'))
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(onSubmitError).toHaveBeenCalledExactlyOnceWith(boom)
      ok.unmount()
      const bad = render(<App broken />)
      await act(async () => {
        fireEvent.click(bad.getByRole('button'))
        await new Promise((r) => setTimeout(r, 20))
      })
      expect(onInvalid).toHaveBeenCalledOnce()
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })

  it('Submit without onSubmit is a native submit button for <Form onSubmit>', async () => {
    const onSubmit = vi.fn()
    function App() {
      const form = useForm({ initialValues: { a: 'x' } })
      return (
        <Form form={form} onSubmit={onSubmit}>
          <Submit />
        </Form>
      )
    }
    const view = render(<App />)
    expect((view.getByRole('button') as HTMLButtonElement).type).toBe('submit')
    await submitNative(view.container)
    expect(onSubmit).toHaveBeenCalledExactlyOnceWith({ a: 'x' })
  })

  it('Reset restores the initial values (or resets to `values`)', () => {
    let api: any
    function App({ values }: { values?: { a: string } }) {
      const form = useForm({ initialValues: { a: 'init' } })
      api = form
      return (
        <Form form={form}>
          <Reset values={values} />
        </Form>
      )
    }
    const view = render(<App />)
    act(() => api.setValue('a', 'edited'))
    fireEvent.click(view.getByRole('button'))
    expect(api.getValue('a')).toBe('init')
    expect(api.dirty).toBe(false)
    view.unmount()
    const next = render(<App values={{ a: 'loaded' }} />)
    fireEvent.click(next.getByRole('button'))
    expect(api.getValue('a')).toBe('loaded')
    expect(api.initial).toEqual({ a: 'loaded' })
  })
})
