import { describe, expect, it } from 'vitest'
import { type StandardSchemaV1 } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

function gate() {
  let open!: () => void
  const promise = new Promise<void>((resolve) => {
    open = resolve
  })
  return { promise, open }
}

/**
 * Slow check of the value captured when validation started.
 * `old` waits on `hold`. The next value finishes immediately.
 * A null message is success.
 */
function deferredCheck(hold: Promise<void>, slowMessage: string | null, nextMessage: string | null) {
  return async (values: { name: string }) => {
    if (values.name === 'old') {
      await hold
      return slowMessage ? { name: slowMessage } : {}
    }
    return nextMessage ? { name: nextMessage } : {}
  }
}

function deferredSchema(
  hold: Promise<void>,
  slowMessage: string | null,
  nextMessage: string | null,
): StandardSchemaV1<{ name: string }> {
  return {
    '~standard': {
      version: 1,
      vendor: 'test',
      async validate(value) {
        const current = value as { name: string }
        const extra = await deferredCheck(hold, slowMessage, nextMessage)(current)
        if (!extra.name) return { value: current }
        return { issues: [{ path: ['name'], message: extra.name }] }
      },
    },
  }
}

describe('form-level validate generations (schema and function)', () => {
  for (const kind of ['schema', 'function'] as const) {
    it(`${kind}: a slow failure does not overwrite a newer success`, async () => {
      const held = gate()
      const check = deferredCheck(held.promise, 'old-error', null)
      const form = createEngine<{ name: string }>({
        initialValues: { name: 'old' },
        validate: kind === 'schema' ? deferredSchema(held.promise, 'old-error', null) : check,
      })
      const first = form.validate()
      form.setValue('name', 'new')
      await form.validate()
      expect(form.getValue('name')).toBe('new')
      expect(form.errors).toEqual([])
      held.open()
      await first
      expect(form.getValue('name')).toBe('new')
      expect(form.errors).toEqual([])
      expect(form.validating).toBe(false)
    })

    it(`${kind}: a slow success does not clear a newer failure`, async () => {
      const held = gate()
      const check = deferredCheck(held.promise, null, 'new-error')
      const form = createEngine<{ name: string }>({
        initialValues: { name: 'old' },
        validate: kind === 'schema' ? deferredSchema(held.promise, null, 'new-error') : check,
      })
      const first = form.validate()
      form.setValue('name', 'new')
      await form.validate()
      expect(form.errors.find((error) => error.path === 'name')?.messages).toEqual(['new-error'])
      held.open()
      await first
      expect(form.errors.find((error) => error.path === 'name')?.messages).toEqual(['new-error'])
      expect(form.validating).toBe(false)
    })
  }
})

describe('rules that combine required with other constraints', () => {
  it('reports minLength from the same rule object as required', async () => {
    const combined = createEngine<{ name: string }>({
      initialValues: { name: 'x' },
      fields: { name: { rules: [{ required: true, minLength: 6 }] } },
    })
    const split = createEngine<{ name: string }>({
      initialValues: { name: 'x' },
      fields: { name: { rules: [{ required: true }, { minLength: 6 }] } },
    })
    expect(await combined.validate()).toEqual(await split.validate())
    expect((await combined.validate()).flatMap((error) => error.messages)).toContain('至少 6 个字符')
  })

  it('reports only required when the value is empty (other rules skip empty values)', async () => {
    const combined = createEngine<{ name: string }>({
      initialValues: { name: '' },
      fields: { name: { rules: [{ required: true, minLength: 6 }] } },
    })
    const split = createEngine<{ name: string }>({
      initialValues: { name: '' },
      fields: { name: { rules: [{ required: true }, { minLength: 6 }] } },
    })
    const combinedErrors = await combined.validate()
    const splitErrors = await split.validate()
    expect(combinedErrors).toEqual(splitErrors)
    expect(combinedErrors.flatMap((error) => error.messages)).toEqual(['必填'])
  })

  it('runs a validator that shares a rule with required', async () => {
    let calls = 0
    const form = createEngine<{ name: string }>({
      initialValues: { name: 'hello' },
      fields: {
        name: {
          rules: [
            {
              required: true,
              validator: () => {
                calls += 1
                return '自定义'
              },
            },
          ],
        },
      },
    })
    const errors = await form.validate()
    expect(calls).toBe(1)
    expect(errors.flatMap((error) => error.messages)).toContain('自定义')
  })
})

describe('JSX unmount', () => {
  it('clears a JSX-only required error as soon as the field unmounts', async () => {
    const form = createEngine<{ note: string }>({ initialValues: { note: '' } })
    form.mountJsxField('note', { required: true })
    await form.validate()
    expect(form.canSubmit).toBe(false)
    form.releaseJsxField('note')
    expect(form.binding('note').required).toBe(false)
    expect(form.errors).toEqual([])
    expect(form.canSubmit).toBe(true)
  })

  it('keeps a declared required error when JSX rules unmount', async () => {
    const form = createEngine<{ name: string }>({
      initialValues: { name: '' },
      fields: { name: { required: true } },
    })
    form.mountJsxField('name', { rules: [{ minLength: 4, message: '太短' }] })
    await form.validate()
    // empty value: the JSX minLength skips it, only the declared required reports
    expect(form.errors.flatMap((error) => error.messages)).toEqual(['必填'])
    form.releaseJsxField('name')
    expect(form.binding('name').required).toBe(true)
    expect(form.errors.flatMap((error) => error.messages)).toEqual(['必填'])
    expect(form.canSubmit).toBe(false)
  })

  it('does not let a JSX validator write after unmount', async () => {
    const held = gate()
    let calls = 0
    const form = createEngine<{ note: string }>({ initialValues: { note: 'x' } })
    form.mountJsxField('note', {
      rules: [
        {
          validator: async () => {
            calls += 1
            await held.promise
            return 'late'
          },
        },
      ],
    })
    const pending = form.validate()
    await Promise.resolve()
    expect(calls).toBe(1)
    form.releaseJsxField('note')
    held.open()
    await pending
    expect(form.errors).toEqual([])
    expect(await form.validate()).toEqual([])
    expect(form.canSubmit).toBe(true)
  })

  it('leaves an effect rule error in place when JSX unmounts', async () => {
    const form = createEngine<{ title: string }>({ initialValues: { title: 'abc' } })
    form.batch((d) => {
      d.title.$rules = [{ minLength: 4, message: '至少四字' }]
    })
    form.mountJsxField('title', { rules: [{ maxLength: 1, message: '太长' }] })
    await form.validate()
    expect(form.errors.flatMap((error) => error.messages)).toContain('至少四字')
    form.releaseJsxField('title')
    expect(form.errors.flatMap((error) => error.messages)).toContain('至少四字')
  })
})

describe('wildcard templates after reset and replace', () => {
  it('drops a template instance that reset removed', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.pushArray('rows', { name: '' })
    expect((await form.validate()).map((error) => error.path)).toEqual(['rows.0.name'])
    form.reset()
    expect(form.getValue('rows')).toEqual([])
    expect(await form.validate()).toEqual([])
    const submitted = await form.submit()
    expect(submitted.ok).toBe(true)
    if (submitted.ok) expect(submitted.values.rows).toEqual([])
  })

  it('drops a template instance when the array is replaced with []', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.pushArray('rows', { name: '' })
    await form.validate()
    form.setValue('rows', [])
    expect(form.getValue('rows')).toEqual([])
    expect(await form.validate()).toEqual([])
  })

  it('still validates rows that reset restored', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.pushArray('rows', { name: '' })
    expect((await form.validate()).map((error) => error.path).sort()).toEqual(['rows.0.name', 'rows.1.name'])
    form.reset()
    expect(form.getValue('rows')).toEqual([{ name: '' }])
    expect((await form.validate()).map((error) => error.path)).toEqual(['rows.0.name'])
  })

  it('keeps removeArray from reporting the removed row', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.pushArray('rows', { name: '' })
    form.removeArray('rows', 0)
    expect(await form.validate()).toEqual([])
  })

  it('keeps an exact declaration when the array is cleared', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }] },
      fields: {
        'rows.*.name': { required: true },
        'rows.0.name': { required: true },
      },
    })
    form.setValue('rows', [])
    expect((await form.validate()).map((error) => error.path)).toEqual(['rows.0.name'])
  })

  it('does not write a template error after the row disappears', async () => {
    const held = gate()
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: {
        'rows.*.name': {
          rules: [
            {
              validator: async () => {
                await held.promise
                return 'late'
              },
            },
          ],
        },
      },
    })
    form.pushArray('rows', { name: 'a' })
    const pending = form.validate()
    await Promise.resolve()
    form.setValue('rows', [])
    held.open()
    await pending
    expect(form.errors).toEqual([])
    expect(await form.validate()).toEqual([])
  })
})
