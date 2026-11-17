import { describe, expect, it } from 'vitest'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

// Let the queued restoration and its promises finish, including Node's
// unhandled-rejection checkpoint. No real request or browser mount is involved.
async function drainRestoration() {
  await new Promise<void>((resolve) => setImmediate(resolve))
  await new Promise<void>((resolve) => setImmediate(resolve))
}

describe('restoring declared validators after JSX unmount (#7)', () => {
  for (const result of ['success', 'message', 'reject'] as const) {
    it(`runs a Promise-returning validator once and manages ${result}`, async () => {
      let calls = 0
      const unhandled: unknown[] = []
      const onUnhandled = (reason: unknown) => { unhandled.push(reason) }
      process.on('unhandledRejection', onUnhandled)
      try {
        const form = createEngine({
          initialValues: { name: 'x' },
          fields: {
            name: {
              rules: {
                // Deliberately not an AsyncFunction: async behavior is determined
                // by the returned value, not the function's constructor.
                validator: () => {
                  calls += 1
                  if (result === 'reject') return Promise.reject(new Error('declared failure'))
                  return Promise.resolve(result === 'message' ? 'declared message' : undefined)
                },
              },
            },
          },
        })
        form.mountJsxField('name', { rules: [] })
        form.releaseJsxField('name')
        await drainRestoration()

        expect(calls).toBe(1)
        expect(unhandled).toEqual([])
        expect(form.errors).toEqual(result === 'success' ? [] : [{
          path: 'name',
          messages: [result === 'reject' ? 'declared failure' : 'declared message'],
        }])
        expect(form.validating).toBe(false)
        expect(form.binding('name').validating).toBe(false)
      } finally {
        process.off('unhandledRejection', onUnhandled)
      }
    })
  }

  it('also runs an async function only once', async () => {
    let calls = 0
    const form = createEngine({
      initialValues: { name: 'x' },
      fields: { name: { rules: { validator: async () => {
        calls += 1
        return 'async message'
      } } } },
    })
    form.mountJsxField('name', { rules: [] })
    form.releaseJsxField('name')
    await drainRestoration()
    expect(calls).toBe(1)
    expect(form.errors).toEqual([{ path: 'name', messages: ['async message'] }])
  })

  it('keeps built-in constraints on a rule that also has a custom callback', async () => {
    let calls = 0
    const form = createEngine({
      initialValues: { name: 'x' },
      fields: { name: { rules: {
        minLength: 3,
        validator: () => {
          calls += 1
          return 'custom message'
        },
      } } },
    })
    form.mountJsxField('name', { rules: [] })
    form.releaseJsxField('name')
    expect(form.errors.flatMap((error) => error.messages)).toContain('至少 3 个字符')
    await drainRestoration()
    expect(calls).toBe(1)
    expect(form.errors).toEqual([{ path: 'name', messages: ['至少 3 个字符', 'custom message'] }])
  })

  it('keeps built-in errors visible while one restored async callback is pending', async () => {
    let calls = 0
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const form = createEngine({
      initialValues: { name: 'x' },
      fields: { name: { rules: {
        minLength: 3,
        validator: async () => {
          calls += 1
          await held
          return 'async message'
        },
      } } },
    })
    form.mountJsxField('name', { rules: [] })
    try {
      form.releaseJsxField('name')
      expect(form.errors).toEqual([{ path: 'name', messages: ['至少 3 个字符'] }])
      await drainRestoration()
      expect(calls).toBe(1)
      expect(form.errors).toEqual([{ path: 'name', messages: ['至少 3 个字符'] }])
      expect(form.validating).toBe(true)
      expect(form.binding('name').validating).toBe(true)
    } finally {
      release()
      await drainRestoration()
    }
    expect(calls).toBe(1)
    expect(form.errors).toEqual([{ path: 'name', messages: ['至少 3 个字符', 'async message'] }])
    expect(form.validating).toBe(false)
    expect(form.binding('name').validating).toBe(false)
  })
})

describe('exact declarations alongside wildcard templates (#8)', () => {
  for (const source of ['fields', 'registerField'] as const) {
    for (const restore of ['setValue', 'reset'] as const) {
      it(`keeps virtual from ${source} after clearing and ${restore}`, async () => {
        const form = createEngine<{ rows: { token: string }[] }>({
          initialValues: { rows: [{ token: 'example-only' }] },
          fields: {
            'rows.*.token': { required: true },
            ...(source === 'fields' ? { 'rows.0.token': { display: 'virtual' } } : {}),
          },
        })
        if (source === 'registerField') form.registerField('rows.0.token', { display: 'virtual' })
        expect(form.getSubmitValues()).toEqual({ rows: [{}] })
        form.setValue('rows', [])
        expect(form.getSubmitValues()).toEqual({ rows: [] })
        expect(await fieldErrorsOf(form.validate())).toEqual([])
        expect(await form.submit()).toEqual({ rows: [] })
        if (restore === 'reset') form.reset()
        else form.setValue('rows', [{ token: 'example-only' }])

        expect(form.getSubmitValues()).toEqual({ rows: [{}] })
        expect(await form.submit()).toEqual({ rows: [{}] })
      })
    }
  }

  it('keeps an explicit virtual false override of a virtual template', () => {
    const form = createEngine({
      initialValues: { rows: [{ token: 'keep' }] },
      fields: {
        'rows.*.token': { display: 'virtual' },
        'rows.0.token': { display: 'visible' },
      },
    })
    expect(form.getSubmitValues()).toEqual({ rows: [{ token: 'keep' }] })
    form.setValue('rows', [])
    expect(form.getSubmitValues()).toEqual({ rows: [] })
    form.setValue('rows', [{ token: 'keep' }])
    expect(form.getSubmitValues()).toEqual({ rows: [{ token: 'keep' }] })
  })

  it('keeps undefined declaration updates as no-ops across instance recreation', () => {
    const form = createEngine({
      initialValues: { rows: [{ token: 'example-only' }] },
      fields: {
        'rows.*.token': { required: true },
        'rows.0.token': { display: 'virtual', pattern: 'readOnly' },
      },
    })
    form.registerField('rows.0.token', { display: undefined, pattern: undefined })
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    form.setValue('rows', [])
    form.setValue('rows', [{ token: 'example-only' }])
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(form.binding('rows.0.token').pattern).toBe('readOnly')
  })

  for (const display of ['hidden', 'none'] as const) {
    it(`keeps exact display ${display} and its validation/submission behavior`, async () => {
      const form = createEngine({
        initialValues: { rows: [{ name: '' }] },
        fields: {
          'rows.*.name': { required: true },
          'rows.0.name': { display },
        },
      })
      form.setValue('rows', [])
      form.setValue('rows', [{ name: '' }])
      expect(form.binding('rows.0.name').display).toBe(display)
      expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(display === 'hidden' ? ['rows.0.name'] : [])
      expect(form.getSubmitValues()).toEqual({ rows: [display === 'hidden' ? { name: '' } : {}] })
    })
  }

  it('keeps an exact pattern without rules or required', () => {
    const form = createEngine({
      initialValues: { rows: [{ name: 'kept' }] },
      fields: {
        'rows.*.name': { required: true },
        'rows.0.name': { pattern: 'readOnly' },
      },
    })
    form.setValue('rows', [])
    form.reset()
    expect(form.binding('rows.0.name').pattern).toBe('readOnly')
  })

  it('does not grow empty arrays or absent objects when omitting declared fields', () => {
    const form = createEngine<{ rows: { token: string }[]; editor?: { token: string } }>({
      initialValues: { rows: [] },
      fields: { 'rows.0.token': { display: 'virtual' }, 'editor.token': { display: 'none' } },
    })
    expect(form.getSubmitValues()).toEqual({ rows: [] })
    expect(form.getValue('rows')).toEqual([])
  })

  it('keeps declarations but not template validators while reset leaves rows empty', async () => {
    const form = createEngine<{ rows: { token: string }[] }>({
      initialValues: { rows: [] },
      fields: { 'rows.*.token': { required: true }, 'rows.0.token': { display: 'virtual' } },
    })
    form.setValue('rows', [{ token: 'example-only' }])
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    form.reset()
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(await form.submit()).toEqual({ rows: [] })
    form.setValue('rows', [{ token: 'example-only' }])
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(await form.submit()).toEqual({ rows: [{}] })
  })
})
