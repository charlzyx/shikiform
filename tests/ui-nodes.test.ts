import { afterEach, describe, expect, it, vi } from 'vitest'
import { defineEffects, ShikiUsageError } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'

describe('named UI nodes (core)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('a field instance has its own UI layer; unset state falls back to the field', () => {
    const form = createEngine({
      initialValues: { name: '' },
      fields: { name: { title: '姓名' } },
      effects: [
        defineEffects<{ name: string }>(({ reaction }) => {
          reaction((d) => {
            if (d.name.$value === 'red') d.name.$ui('echo').$componentProps.style = { color: 'red' }
            else d.name.$ui('echo').$componentProps = undefined as never
          })
        }),
      ],
    })
    const echo = form.uiBinding('name', 'echo', { readOnly: true }, 'field')
    expect(echo.readOnly).toBe(true)
    expect(echo.visible).toBe(true)
    expect(echo.componentProps).toEqual({})
    form.setValue('name', 'red')
    expect(form.uiBinding('name', 'echo', undefined, 'field').componentProps).toEqual({ style: { color: 'red' } })
    // the field itself is untouched
    expect(form.binding('name').componentProps).toEqual({})
    // pattern falls back to the field (inherits root) when the instance sets none
    form.batch((d) => { d.$disabled = true })
    expect(form.uiBinding('name', 'echo', undefined, 'field').disabled).toBe(true)
    // title falls back to the field's for a field instance, not for a pure node
    form.claimUi('name', 'echo', 'field')
    expect(form.uiBinding('name', 'echo', undefined, 'field').title).toBe('姓名')
  })

  it('reaction > JSX > fallback for display / pattern, and $ui reads are dependencies', () => {
    const seen: unknown[] = []
    const form = createEngine({
      initialValues: { amount: 0, flag: false },
      effects: [
        defineEffects<{ amount: number; flag: boolean }>(({ reaction }) => {
          reaction((d) => { d.amount.$ui('slider').$disabled = d.flag.$value ? true : undefined })
          reaction((d) => { seen.push(d.amount.$ui('slider').$disabled) })
        }),
      ],
    })
    expect(form.uiBinding('amount', 'slider', { readOnly: true }, 'field').readOnly).toBe(true)
    form.setValue('flag', true)
    expect(form.uiBinding('amount', 'slider', { readOnly: true }, 'field').disabled).toBe(true)
    expect(form.binding('amount').readOnly).toBe(false)
    expect(seen.at(-1)).toBe(true)
    form.setValue('flag', false)
    expect(seen.at(-1)).toBe(false)
  })

  it('a pure UI node is never in values / submit / validation', async () => {
    const form = createEngine({
      initialValues: { amount: 0 },
      effects: [
        defineEffects<{ amount: number }>(({ reaction }) => {
          reaction((d) => { d.$ui('approvalTip').$visible = d.amount.$value >= 50000 })
        }),
      ],
    })
    expect(form.uiBinding('', 'approvalTip', undefined, 'node').visible).toBe(false)
    form.setValue('amount', 60000)
    expect(form.uiBinding('', 'approvalTip', undefined, 'node').visible).toBe(true)
    const result = await form.submit()
    expect(result).toEqual({ amount: 60000 })
    expect(form.values).toEqual({ amount: 60000 })
  })

  it('hiding a UI node does not change any field', async () => {
    const form = createEngine({ initialValues: { a: '' }, fields: { a: { required: true } } })
    form.batch((d) => { d.$ui('box').$visible = false; d.a.$ui('echo').$visible = false })
    expect(form.binding('a').visible).toBe(true)
    await expect(form.submit()).rejects.toEqual(expect.any(Array))
  })

  it('ids differ from the field id', () => {
    const form = createEngine({ initialValues: { user: { name: '' } } })
    expect(form.binding('user.name').id).toBe('user-name')
    expect(form.uiBinding('user.name', 'echo', undefined, 'field').id).toBe('user-name--echo')
  })

  it('a $ui handle only has UI state (dev)', () => {
    const form = createEngine({ initialValues: { a: '' } })
    expect(() => form.batch((d) => { (d.a.$ui('echo') as any).$value = 'x' })).toThrow(ShikiUsageError)
    expect(() => form.batch((d) => { (d.a.$ui('echo') as any).$requird = true })).toThrow(/not UI-node state/)
  })

  it('warns once after mount settles when a written UI never mounts', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const form = createEngine({
      initialValues: { a: 1 },
      effects: [defineEffects<{ a: number }>(({ reaction }) => {
        reaction((d) => {
          d.$ui('aprovalTip').$visible = d.a.$value > 1
          d.$ui('approvalTip').$visible = d.a.$value > 1
        })
      })],
    })
    form.claimUi('', 'approvalTip', 'node')
    await new Promise((r) => setTimeout(r, 5))
    expect(warn).not.toHaveBeenCalled() // not ready: React has not mounted
    form.markUiReady()
    await new Promise((r) => setTimeout(r, 5))
    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toMatch(/d\.\$ui\('aprovalTip'\).*Mounted at the root: "approvalTip"/)
    form.setValue('a', 2)
    await new Promise((r) => setTimeout(r, 5))
    expect(warn).toHaveBeenCalledTimes(1)
  })
})
