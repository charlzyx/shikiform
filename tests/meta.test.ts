import { describe, expect, it } from 'vitest'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

describe('field and form meta', () => {
  it('tracks touched, dirty, canSubmit, and submitCount', async () => {
    const form = createEngine<{ name: string }>({ initialValues: { name: '' } })
    form.registerField('name', { required: true })
    expect(form.canSubmit).toBe(true)
    expect(form.binding('name').dirty).toBe(false)
    await expect(form.submit()).rejects.toEqual([{ path: 'name', messages: ['必填'] }])
    expect(form.submitCount).toBe(1)
    expect(form.submitting).toBe(false)
    expect(form.canSubmit).toBe(false)
    form.setValue('name', 'ada')
    expect(form.dirty).toBe(true)
    expect(form.binding('name').dirty).toBe(true)
    form.blur('name')
    expect(form.binding('name').touched).toBe(true)
    expect(await form.submit()).toEqual({ name: 'ada' })
    expect(form.submitCount).toBe(2)
    expect(form.canSubmit).toBe(true)
  })

  it('exposes validating while an async rule is in flight', async () => {
    let release: (message: string | null) => void = () => {}
    const form = createEngine<{ name: string }>({
      initialValues: { name: '' },
      validateTrigger: ['onChange'],
    })
    form.registerField('name', {
      rules: [
        {
          validator: () =>
            new Promise((resolve) => {
              release = resolve
            }),
        },
      ],
    })
    form.setValue('name', 'a')
    expect(form.binding('name').validating).toBe(true)
    expect(form.canSubmit).toBe(false)
    release(null)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(form.binding('name').validating).toBe(false)
  })

  it('debounces async rules and drops a stale result', async () => {
    const calls: string[] = []
    const form = createEngine<{ name: string }>({
      initialValues: { name: '' },
      asyncDebounceMs: 40,
      validateTrigger: ['onChange'],
    })
    form.registerField('name', {
      rules: [
        {
          validator: async (value, ctx) => {
            const current = String(value)
            calls.push(current)
            await new Promise((resolve) => setTimeout(resolve, 15))
            if (ctx.signal?.aborted) return null
            return current === 'ok' ? null : `bad:${current}`
          },
        },
      ],
    })
    form.setValue('name', 'a')
    form.setValue('name', 'ok')
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(calls).toEqual([])
    await new Promise((resolve) => setTimeout(resolve, 80))
    expect(calls).toEqual(['ok'])
    expect(form.errors).toEqual([])
  })

  it('notifies root $errors when a top-level field fails', async () => {
    const form = createEngine<{ code: string }>({ initialValues: { code: '' } })
    form.registerField('code', { required: true })
    const hits: string[] = []
    form.subscribeDep(':errors', () => hits.push('root'))
    await fieldErrorsOf(form.validate())
    expect(form.trackSelector((d) => d.$errors).value).toContain('必填')
    expect(hits).toContain('root')
  })

  it('passes the draft into a selector', () => {
    const form = createEngine<{ email: string }>({ initialValues: { email: 'ada@example.com' } })
    const selected = form.trackSelector((d) => ({ email: d.email.$value, can: d.$canSubmit }))
    expect(selected.value).toEqual({ email: 'ada@example.com', can: true })
    expect(selected.deps).toContain('email:value')
    expect(selected.deps).toContain(':meta')
  })
})
