import { describe, expect, it } from 'vitest'
import { applyJsxField } from '../packages/react/src/hooks/field-lifecycle'
import { createEngine } from '../packages/core/src/engine/create'

describe('React JSX lease sequences over the real engine (not a browser effect test)', () => {
  it.each(['owner-first', 'consumer-first'])('%s: disposing a pure consumer preserves the remaining JSX owner', async (order) => {
    const form = createEngine({ initialValues: { email: '' } })
    let consumer: (() => void) | undefined
    if (order === 'consumer-first') consumer = applyJsxField(form, 'email', {})
    form.mountJsxField('email', { required: true, rules: [{ minLength: 3 }] })
    if (order === 'owner-first') consumer = applyJsxField(form, 'email', {})
    const before = await form.validate()
    // empty value: only `required` reports (#63), minLength is skipped
    expect(before[0]?.messages).toEqual(['必填'])
    consumer?.()
    expect(form.binding('email').required).toBe(true)
    expect(await form.validate()).toEqual(before)
    expect(consumer).toBeUndefined()
  })

  it('a flags-only view applies display without acquiring or releasing validation', async () => {
    const form = createEngine({ initialValues: { email: '' } })
    form.mountJsxField('email', { required: true })
    const cleanup = applyJsxField(form, 'email', { display: 'virtual' })
    cleanup?.()
    expect(form.binding('email')).toMatchObject({ required: true, display: 'virtual' })
    expect((await form.validate())[0]?.path).toBe('email')
    expect(form.getSubmitValues()).toEqual({})
    expect(cleanup).toBeUndefined()
  })

  it('explicit required=false still owns a lease and restores the declaration when released', async () => {
    const form = createEngine({ initialValues: { email: '' }, fields: { email: { required: true } } })
    const cleanup = applyJsxField(form, 'email', { required: false })
    expect(form.binding('email').required).toBe(false)
    expect(cleanup).toBeTypeOf('function')
    cleanup?.()
    expect(form.binding('email').required).toBe(true)
    expect((await form.validate())[0]?.path).toBe('email')
  })

  it('an explicit empty rules array is an owner, not an absent declaration', async () => {
    const form = createEngine({ initialValues: { email: 'ab' }, fields: { email: { rules: [{ minLength: 3 }] } } })
    const cleanup = applyJsxField(form, 'email', { rules: [] })
    expect(await form.validate()).toEqual([])
    cleanup?.()
    expect((await form.validate())[0]?.messages).toHaveLength(1)
  })

  it('setup after cleanup re-applies JSX rules and final cleanup restores declared validation', async () => {
    const form = createEngine({ initialValues: { email: '' } })
    const spec = { required: true, rules: [{ minLength: 3 }] }
    const first = applyJsxField(form, 'email', spec)
    first?.()
    const second = applyJsxField(form, 'email', spec)
    expect((await form.validate())[0]?.messages).toEqual(['必填'])
    second?.()
    expect(await form.validate()).toEqual([])
  })
})
