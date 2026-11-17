import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { defineEffects, SubmitSupersededError, SubmitUnstableError, type StandardSchemaV1, type ValidateCtx } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => { open = resolve })
  return { promise, open }
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

// Collect unhandled rejections for the duration of a test. Node reports them on a
// macrotask checkpoint, so every test below sleeps before it asserts.
let unhandled: unknown[] = []
const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
beforeEach(() => {
  unhandled = []
  process.on('unhandledRejection', onUnhandled)
})
afterEach(() => {
  process.off('unhandledRejection', onUnhandled)
})

describe('one pass validates one immutable snapshot (#1)', () => {
  it('value, record, root, parent (skips the array) and get() agree while an edit lands mid-pass', async () => {
    const held = gate()
    const seen: unknown[] = []
    const form = createEngine({
      initialValues: { rows: [{ min: 0, max: 10 }] },
      fields: {
        'rows.*.max': {
          rules: {
            validator: async (value: unknown, ctx: ValidateCtx) => {
              await held.promise
              seen.push(value, ctx.record.min, ctx.root.rows[0].min, ctx.parent.rows[0].min, ctx.get('rows.0.min'))
              return Number(value) < Number(ctx.get('rows.0.min')) ? 'max must be >= min' : null
            },
          },
        },
      },
    })
    const pending = form.validate()
    form.setValue('rows.0.min', 20)
    held.open()
    // The pass describes the snapshot it started on: min 0, max 10 is valid.
    await expect(pending).resolves.toBeUndefined()
    expect(seen).toEqual([10, 0, 0, 0, 0])
    // A fresh pass sees the edit, and record/get agree on it.
    held.open()
    expect(await fieldErrorsOf(form.validate())).toEqual([{ path: 'rows.0.max', messages: ['max must be >= min'] }])
    expect(seen.slice(5)).toEqual([10, 20, 20, 20, 20])
  })

  it('field rules and the form-level validate see the same version', async () => {
    const held = gate()
    let fieldSaw: unknown
    let formSaw: unknown
    const form = createEngine({
      initialValues: { min: 0, max: 10 },
      fields: { max: { rules: { validator: async (_value: unknown, ctx: ValidateCtx) => { fieldSaw = ctx.get('min'); await held.promise; return null } } } },
      validate: (values) => {
        formSaw = values.min
        return {}
      },
    })
    const pending = form.validate()
    await Promise.resolve()
    form.setValue('min', 20)
    held.open()
    await pending
    expect([fieldSaw, formSaw]).toEqual([0, 0])
  })
})

describe('a throwing field validator settles every caller (#2)', () => {
  for (const kind of ['sync throw', 'async reject'] as const) {
    it(`debounced window + ${kind}: no unhandled rejection, a managed message, then recovery`, async () => {
      let calls = 0
      const form = createEngine({
        initialValues: { name: 'ok' },
        asyncDebounceMs: 1,
        validateTrigger: ['onChange'],
        fields: {
          name: {
            rules: {
              validator: (value: unknown) => {
                calls += 1
                if (value !== 'bad') return kind === 'sync throw' ? null : Promise.resolve(null)
                if (kind === 'sync throw') throw new Error('network failure')
                return Promise.reject(new Error('network failure'))
              },
            },
          },
        },
      })
      form.setValue('name', 'b')
      form.setValue('name', 'ba')
      form.setValue('name', 'bad')
      await sleep(30)
      expect(calls).toBe(1)
      expect(unhandled).toEqual([])
      expect(form.errors).toEqual([{ path: 'name', messages: ['network failure'] }])
      expect(form.validating).toBe(false)
      expect(form.binding('name').validating).toBe(false)

      form.setValue('name', 'good')
      await sleep(30)
      expect(form.errors).toEqual([])
      expect(unhandled).toEqual([])
    })
  }

  it('an awaited validate()/submit() rejects FieldError[] (a field rule throw is still a message)', async () => {
    const form = createEngine({
      initialValues: { name: 'x' },
      fields: { name: { rules: { validator: () => { throw new Error('sync boom') } } } },
    })
    await expect(form.validate('name')).rejects.toEqual([{ path: 'name', messages: ['sync boom'] }])
    await expect(form.submit()).rejects.toEqual([{ path: 'name', messages: ['sync boom'] }])
    expect(form.validating).toBe(false)
    expect(form.submitting).toBe(false)
    await sleep(10)
    expect(unhandled).toEqual([])
  })

  it('a field schema whose validate throws synchronously is a message too', async () => {
    const schema: StandardSchemaV1<string> = {
      '~standard': { version: 1, vendor: 'test', validate: () => { throw new Error('schema boom') } },
    }
    const form = createEngine({ initialValues: { name: 'x' }, validateTrigger: ['onChange'], fields: { name: { rules: schema } } })
    form.setValue('name', 'y')
    await sleep(10)
    expect(unhandled).toEqual([])
    expect(form.errors).toEqual([{ path: 'name', messages: ['schema boom'] }])
  })
})

describe('submit returns only values its pass validated (#6)', () => {
  it('re-validates after an edit while waiting and reports the real error', async () => {
    const entered = gate()
    const held = gate()
    const form = createEngine({
      initialValues: { name: 'valid' },
      validate: async (values) => {
        if (values.name !== 'valid') return { name: 'invalid current name' }
        entered.open()
        await held.promise
        return {}
      },
    })
    const onValid = vi.fn()
    const pending = form.submit(onValid)
    await entered.promise
    form.setValue('name', 'invalid')
    held.open()
    await expect(pending).rejects.toEqual([{ path: 'name', messages: ['invalid current name'] }])
    expect(onValid).not.toHaveBeenCalled()
  })

  it('submits the edited value once it has been validated', async () => {
    const entered = gate()
    const held = gate()
    const seen: string[] = []
    const form = createEngine({
      initialValues: { name: 'first' },
      validate: async (values) => {
        seen.push(values.name)
        if (values.name === 'first') {
          entered.open()
          await held.promise
        }
        return {}
      },
    })
    const onValid = vi.fn()
    const pending = form.submit(onValid)
    await entered.promise
    form.setValue('name', 'second')
    held.open()
    expect(await pending).toEqual({ name: 'second' })
    expect(onValid).toHaveBeenCalledExactlyOnceWith({ name: 'second' })
    expect(seen).toEqual(['first', 'second'])
  })

  it('a reaction derived from errors does not turn submit into a retry message', async () => {
    const form = createEngine({
      initialValues: { name: '', hasError: false },
      fields: { name: { required: true } },
      effects: [defineEffects<{ name: string; hasError: boolean }>(({ reaction }) => {
        reaction((d) => { d.hasError.$value = d.$errors.length > 0 })
      })],
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'name', messages: ['必填'] }])
    form.setValue('name', 'ok')
    expect(await form.submit()).toEqual({ name: 'ok', hasError: false })
  })

  it('gives up with the retry message when values never settle (bounded)', async () => {
    let calls = 0
    const form = createEngine({
      initialValues: { n: 0 },
      validate: async () => {
        calls += 1
        form.setValue('n', calls)
        return {}
      },
    })
    const error = await form.submit().then(() => null, (reason) => reason)
    expect(error).toBeInstanceOf(SubmitUnstableError)
    expect(error).toMatchObject({ code: 'unstable', message: '表单或校验已更新，请重新提交' })
    expect(error).not.toBeInstanceOf(SubmitSupersededError)
    expect(calls).toBe(3)
    expect(form.submitting).toBe(false)
  })
})

function withTimeout<T>(promise: Promise<T>, ms = 1000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (err) => {
        clearTimeout(timer)
        reject(err)
      },
    )
  })
}

describe('an aborted async validator leaves the in-flight set', () => {
  it('submit finishes when the aborted validator never settles', async () => {
    const started = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'old' },
      asyncDebounceMs: 1000,
      validateTrigger: ['onChange'],
      fields: {
        name: {
          rules: {
            validator: (_value, ctx) => {
              calls += 1
              const generation = calls
              return new Promise<string | null>((resolve) => {
                if (generation === 1) {
                  started.open()
                  ctx.signal?.addEventListener('abort', () => {})
                  return
                }
                resolve(null)
              })
            },
          },
        },
      },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    expect(form.binding('name').validating).toBe(true)
    form.setValue('name', 'new')
    expect(calls).toBe(1)
    expect(await withTimeout(form.submit())).toEqual({ name: 'new' })
    expect(form.errors).toEqual([])
    expect(form.submitting).toBe(false)
    expect(form.binding('name').validating).toBe(false)
    await withTimeout(first)
    expect(calls).toBeGreaterThan(1)
  })

  it('submit still waits for the validator that replaced the aborted one', async () => {
    const started = gate()
    const live = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'a' },
      asyncDebounceMs: 1000,
      validateTrigger: ['onChange'],
      fields: {
        name: {
          rules: {
            validator: (_value, ctx) => {
              calls += 1
              const generation = calls
              return new Promise<string | null>((resolve) => {
                if (generation === 1) {
                  started.open()
                  ctx.signal?.addEventListener('abort', () => {})
                  return
                }
                void live.promise.then(() => resolve('仍要等'))
              })
            },
          },
        },
      },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    form.setValue('name', 'b')
    let settled = false
    const pending = form.submit().then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(calls).toBeGreaterThan(1)
    live.open()
    await expect(withTimeout(pending)).rejects.toEqual([{ path: 'name', messages: ['仍要等'] }])
    expect(form.submitting).toBe(false)
    await withTimeout(first)
  })

  it('a late resolve from an aborted validator does not write the field', async () => {
    let late!: (message: string | null) => void
    const started = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'first' },
      fields: {
        name: {
          rules: {
            validator: () => {
              calls += 1
              if (calls === 1) {
                return new Promise<string | null>((resolve) => {
                  late = resolve
                  started.open()
                })
              }
              return '第二次错误'
            },
          },
        },
      },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    await expect(withTimeout(form.validate())).rejects.toEqual([{ path: 'name', messages: ['第二次错误'] }])
    late('过期错误')
    await sleep(20)
    expect(form.errors).toEqual([{ path: 'name', messages: ['第二次错误'] }])
    await withTimeout(first)
    expect(form.errors).toEqual([{ path: 'name', messages: ['第二次错误'] }])
    expect(unhandled).toEqual([])
  })

  it('ignores an error resolved from the abort listener itself', async () => {
    const started = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'first' },
      fields: {
        name: {
          rules: {
            validator: (_value, ctx) => {
              calls += 1
              if (calls === 1) {
                return new Promise<string | null>((resolve) => {
                  started.open()
                  ctx.signal?.addEventListener('abort', () => resolve('过期错误'))
                })
              }
              return null
            },
          },
        },
      },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    await expect(withTimeout(form.validate())).resolves.toBeUndefined()
    await sleep(20)
    expect(form.errors).toEqual([])
    await withTimeout(first)
    expect(unhandled).toEqual([])
  })

  it('a late rejection from an aborted validator does not write the field', async () => {
    let late!: (reason: unknown) => void
    const started = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'first' },
      fields: {
        name: {
          rules: {
            validator: () => {
              calls += 1
              if (calls === 1) {
                return new Promise<string | null>((_resolve, reject) => {
                  late = reject
                  started.open()
                })
              }
              return '第二次错误'
            },
          },
        },
      },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    await expect(withTimeout(form.validate())).rejects.toEqual([{ path: 'name', messages: ['第二次错误'] }])
    late(new Error('过期失败'))
    await sleep(20)
    expect(unhandled).toEqual([])
    expect(form.errors).toEqual([{ path: 'name', messages: ['第二次错误'] }])
    await withTimeout(first)
  })

  it('an aborted async field schema that never settles does not pin submit', async () => {
    const started = gate()
    let calls = 0
    const schema: StandardSchemaV1<string> = {
      '~standard': {
        version: 1,
        vendor: 'test',
        validate: () => {
          calls += 1
          if (calls === 1) {
            started.open()
            return new Promise<never>(() => {})
          }
          return { value: 'new' }
        },
      },
    }
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'old' },
      asyncDebounceMs: 1000,
      validateTrigger: ['onChange'],
      fields: { name: { rules: schema } },
    })
    const first = fieldErrorsOf(form.validate())
    await started.promise
    form.setValue('name', 'new')
    expect(await withTimeout(form.submit())).toEqual({ name: 'new' })
    expect(form.errors).toEqual([])
    await withTimeout(first)
  })

  it('still waits for an async validator and keeps its message', async () => {
    const pendingResult = gate()
    const later = gate()
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'x' },
      fields: {
        name: {
          rules: {
            validator: () => {
              const generation = calls
              calls += 1
              const hold = generation === 0 ? pendingResult.promise : later.promise
              return hold.then(() => (generation === 0 ? '异步错误' : null))
            },
          },
        },
      },
    })
    let settled = false
    const pending = form.submit().then((result) => {
      settled = true
      return result
    })
    await Promise.resolve()
    await Promise.resolve()
    expect(settled).toBe(false)
    expect(form.binding('name').validating).toBe(true)
    pendingResult.open()
    await expect(pending).rejects.toEqual([{ path: 'name', messages: ['异步错误'] }])
    expect(form.validating).toBe(false)
    expect(form.submitting).toBe(false)
    const again = form.submit()
    await Promise.resolve()
    expect(form.submitting).toBe(true)
    later.open()
    expect(await again).toEqual({ name: 'x' })
  })
})

describe('a value change drops a stale async error (#122)', () => {
  async function until(pred: () => boolean): Promise<void> {
    for (let i = 0; i < 50; i++) {
      if (pred()) return
      await sleep(10)
    }
    throw new Error('timed out waiting for an async check')
  }

  it('clears the occupied error when the value changes to an available one, then submit is allowed', async () => {
    let release!: (message: string | null) => void
    const form = createEngine<{ username: string }>({
      initialValues: { username: '' },
      asyncDebounceMs: 20,
      fields: {
        username: {
          required: true,
          rules: {
            validator: (value) => {
              if (value === 'admin') return new Promise<string | null>((resolve) => { release = resolve })
              return null
            },
          },
        },
      },
    })
    form.setValue('username', 'admin')
    form.blur('username')
    await until(() => typeof release === 'function')
    release('已被占用')
    await sleep(20)
    expect(form.errors).toEqual([{ path: 'username', messages: ['已被占用'] }])
    expect(form.canSubmit).toBe(false)

    form.setValue('username', 'ada')
    // The finished request's message is dropped with that attempt, before the replacement check returns.
    expect(form.errors).toEqual([])
    expect(form.binding('username').validating).toBe(true)
    expect(form.canSubmit).toBe(false)
    await sleep(50)
    expect(form.errors).toEqual([])
    expect(form.binding('username').validating).toBe(false)
    expect(form.canSubmit).toBe(true)
    expect(await form.submit()).toEqual({ username: 'ada' })
  })

  it('does not apply an in-flight occupied result after the value changes', async () => {
    let release!: (message: string | null) => void
    const started = gate()
    const form = createEngine<{ username: string }>({
      initialValues: { username: '' },
      asyncDebounceMs: 20,
      fields: {
        username: {
          rules: {
            validator: (value) => new Promise<string | null>((resolve) => {
              if (value === 'admin') {
                release = resolve
                started.open()
                return
              }
              resolve(null)
            }),
          },
        },
      },
    })
    form.setValue('username', 'admin')
    form.blur('username')
    await started.promise
    expect(form.binding('username').validating).toBe(true)
    expect(form.errors).toEqual([])
    form.setValue('username', 'ada')
    release('已被占用')
    await sleep(50)
    expect(form.getValue('username')).toBe('ada')
    expect(form.errors).toEqual([])
    expect(form.binding('username').validating).toBe(false)
    expect(form.canSubmit).toBe(true)
  })

  it('still settles when the value changes again while the recheck is in flight', async () => {
    const gates: Array<ReturnType<typeof gate>> = []
    const seen: string[] = []
    const form = createEngine<{ username: string }>({
      initialValues: { username: '' },
      asyncDebounceMs: 20,
      fields: {
        username: {
          rules: {
            validator: (value) => {
              const current = String(value ?? '')
              seen.push(current)
              const held = gate()
              gates.push(held)
              return held.promise.then(() => (current === 'admin' ? '已被占用' : null))
            },
          },
        },
      },
    })
    form.setValue('username', 'admin')
    form.blur('username')
    await until(() => gates.length === 1)
    gates[0]!.open()
    await sleep(20)
    expect(form.errors).toEqual([{ path: 'username', messages: ['已被占用'] }])

    form.setValue('username', 'a')
    await until(() => gates.length === 2)
    expect(form.binding('username').validating).toBe(true)
    form.setValue('username', 'ada')
    gates[1]!.open()
    await until(() => gates.length === 3)
    gates[2]!.open()
    await sleep(20)
    expect(seen).toContain('ada')
    expect(form.getValue('username')).toBe('ada')
    expect(form.errors).toEqual([])
    expect(form.binding('username').validating).toBe(false)
    expect(form.canSubmit).toBe(true)
  })

  it('matches the docs lookup: abort drops the occupied message for both sequences', async () => {
    const lookup = (username: string, signal?: AbortSignal) => new Promise<string | null>((resolve) => {
      const timer = setTimeout(() => {
        resolve(username.trim().toLowerCase() === 'admin' ? '已被占用' : null)
      }, 40)
      signal?.addEventListener('abort', () => {
        clearTimeout(timer)
        resolve(null)
      }, { once: true })
    })
    const make = () => createEngine<{ username: string; password: string; confirm: string }>({
      initialValues: { username: '', password: 'secret123', confirm: 'secret123' },
      asyncDebounceMs: 20,
      fields: {
        username: {
          required: true,
          rules: { validator: (value, ctx) => lookup(String(value ?? ''), ctx.signal) },
        },
        password: { required: true, rules: { minLength: 8 } },
        confirm: {
          required: true,
          omit: true,
          rules: { validator: (value, ctx) => (value && value !== ctx.record?.password ? '两次密码不一致' : null) },
        },
      },
    })

    const finished = make()
    finished.setValue('username', 'admin')
    finished.blur('username')
    await until(() => finished.errors.some((error) => error.messages.includes('已被占用')))
    finished.setValue('username', 'ada')
    expect(finished.errors).toEqual([])
    await until(() => finished.canSubmit)
    expect(await finished.submit()).toEqual({ username: 'ada', password: 'secret123' })

    const inflight = make()
    inflight.setValue('username', 'admin')
    inflight.blur('username')
    await until(() => inflight.binding('username').validating)
    expect(inflight.errors).toEqual([])
    inflight.setValue('username', 'ada')
    await until(() => inflight.canSubmit)
    expect(inflight.errors).toEqual([])
    expect(await inflight.submit()).toEqual({ username: 'ada', password: 'secret123' })
  })
})

describe('restoring a declared validator after JSX unmount (#7)', () => {
  it('a synchronously throwing declared validator runs once and lands as a message', async () => {
    let calls = 0
    const form = createEngine({
      initialValues: { name: 'x' },
      fields: { name: { rules: { validator: () => { calls += 1; throw new Error('declared failure') } } } },
    })
    form.mountJsxField('name', { rules: [] })
    form.releaseJsxField('name')
    await sleep(10)
    expect(calls).toBe(1)
    expect(unhandled).toEqual([])
    expect(form.errors).toEqual([{ path: 'name', messages: ['declared failure'] }])
    expect(form.validating).toBe(false)
  })
})
