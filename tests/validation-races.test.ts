import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createForm, defineEffects, type StandardSchemaV1, type ValidateCtx } from '../src/core'

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
    const form = createForm({
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
    expect(await pending).toEqual([])
    expect(seen).toEqual([10, 0, 0, 0, 0])
    // A fresh pass sees the edit, and record/get agree on it.
    held.open()
    expect(await form.validate()).toEqual([{ path: 'rows.0.max', messages: ['max must be >= min'] }])
    expect(seen.slice(5)).toEqual([10, 20, 20, 20, 20])
  })

  it('field rules and the form-level validate see the same version', async () => {
    const held = gate()
    let fieldSaw: unknown
    let formSaw: unknown
    const form = createForm({
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
      const form = createForm({
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

  it('an awaited validate()/submit() resolves with the message instead of rejecting', async () => {
    const form = createForm({
      initialValues: { name: 'x' },
      fields: { name: { rules: { validator: () => { throw new Error('sync boom') } } } },
    })
    await expect(form.validate('name')).resolves.toEqual([{ path: 'name', messages: ['sync boom'] }])
    await expect(form.submit()).resolves.toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'name', messages: ['sync boom'] }] })
    expect(form.validating).toBe(false)
    expect(form.submitting).toBe(false)
    await sleep(10)
    expect(unhandled).toEqual([])
  })

  it('a field schema whose validate throws synchronously is a message too', async () => {
    const schema: StandardSchemaV1<string> = {
      '~standard': { version: 1, vendor: 'test', validate: () => { throw new Error('schema boom') } },
    }
    const form = createForm({ initialValues: { name: 'x' }, validateTrigger: ['onChange'], fields: { name: { rules: schema } } })
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
    const form = createForm({
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
    expect(await pending).toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'name', messages: ['invalid current name'] }] })
    expect(onValid).not.toHaveBeenCalled()
  })

  it('submits the edited value once it has been validated', async () => {
    const entered = gate()
    const held = gate()
    const seen: string[] = []
    const form = createForm({
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
    expect(await pending).toEqual({ ok: true, values: { name: 'second' } })
    expect(onValid).toHaveBeenCalledExactlyOnceWith({ name: 'second' })
    expect(seen).toEqual(['first', 'second'])
  })

  it('a reaction derived from errors does not turn submit into a retry message', async () => {
    const form = createForm({
      initialValues: { name: '', hasError: false },
      fields: { name: { required: true } },
      effects: [defineEffects<{ name: string; hasError: boolean }>(({ reaction }) => {
        reaction((d) => { d.hasError.$value = d.$errors.length > 0 })
      })],
    })
    expect(await form.submit()).toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'name', messages: ['必填'] }] })
    form.setValue('name', 'ok')
    expect(await form.submit()).toEqual({ ok: true, values: { name: 'ok', hasError: false } })
  })

  it('gives up with the retry message when values never settle (bounded)', async () => {
    let calls = 0
    const form = createForm({
      initialValues: { n: 0 },
      validate: async () => {
        calls += 1
        form.setValue('n', calls)
        return {}
      },
    })
    expect(await form.submit()).toEqual({ ok: false, reason: 'superseded', errors: [], message: '表单或校验已更新，请重新提交' })
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
        reject(err instanceof Error ? err : new Error(String(err)))
      },
    )
  })
}

describe('an aborted async validator leaves the in-flight set', () => {
  it('submit finishes when the aborted validator never settles', async () => {
    const started = gate()
    let calls = 0
    const form = createForm<{ name: string }>({
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
    const first = form.validate()
    await started.promise
    expect(form.binding('name').validating).toBe(true)
    form.setValue('name', 'new')
    expect(calls).toBe(1)
    expect(await withTimeout(form.submit())).toEqual({ ok: true, values: { name: 'new' } })
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
    const form = createForm<{ name: string }>({
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
    const first = form.validate()
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
    expect(await withTimeout(pending)).toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'name', messages: ['仍要等'] }] })
    expect(form.submitting).toBe(false)
    await withTimeout(first)
  })

  it('a late resolve from an aborted validator does not write the field', async () => {
    let late!: (message: string | null) => void
    const started = gate()
    let calls = 0
    const form = createForm<{ name: string }>({
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
    const first = form.validate()
    await started.promise
    expect(await withTimeout(form.validate())).toEqual([{ path: 'name', messages: ['第二次错误'] }])
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
    const form = createForm<{ name: string }>({
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
    const first = form.validate()
    await started.promise
    expect(await withTimeout(form.validate())).toEqual([])
    await sleep(20)
    expect(form.errors).toEqual([])
    await withTimeout(first)
    expect(unhandled).toEqual([])
  })

  it('a late rejection from an aborted validator does not write the field', async () => {
    let late!: (reason: unknown) => void
    const started = gate()
    let calls = 0
    const form = createForm<{ name: string }>({
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
    const first = form.validate()
    await started.promise
    expect(await withTimeout(form.validate())).toEqual([{ path: 'name', messages: ['第二次错误'] }])
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
    const form = createForm<{ name: string }>({
      initialValues: { name: 'old' },
      asyncDebounceMs: 1000,
      validateTrigger: ['onChange'],
      fields: { name: { rules: schema } },
    })
    const first = form.validate()
    await started.promise
    form.setValue('name', 'new')
    expect(await withTimeout(form.submit())).toEqual({ ok: true, values: { name: 'new' } })
    expect(form.errors).toEqual([])
    await withTimeout(first)
  })

  it('still waits for an async validator and keeps its message', async () => {
    const pendingResult = gate()
    const later = gate()
    let calls = 0
    const form = createForm<{ name: string }>({
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
    expect(await pending).toEqual({ ok: false, reason: 'invalid', errors: [{ path: 'name', messages: ['异步错误'] }] })
    expect(form.validating).toBe(false)
    expect(form.submitting).toBe(false)
    const again = form.submit()
    await Promise.resolve()
    expect(form.submitting).toBe(true)
    later.open()
    expect(await again).toEqual({ ok: true, values: { name: 'x' } })
  })
})

describe('restoring a declared validator after JSX unmount (#7)', () => {
  it('a synchronously throwing declared validator runs once and lands as a message', async () => {
    let calls = 0
    const form = createForm({
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
