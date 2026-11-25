import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects, EnumSource, type EnumOption } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deferred } from '../../validation-submit/deferred'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

describe.each(['development', 'production'])('round three validation in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-63 preserves exact-path validation beside a normalized wildcard after insert and remove', async () => {
    type Values = { group: { rows: { code: string }[] } }
    const wildcard = 'group["rows"][*]["code"]' as 'group.rows.*.code'
    const exact = 'group["rows"][0]["code"]' as 'group.rows.0.code'
    const form = createForm<Values>({
      initialValues: { group: { rows: [{ code: 'first' }, { code: 'row' }] } },
      fields: {
        [wildcard]: { rules: { pattern: /^(first|row)$/, message: 'Invalid row' } },
        [exact]: { rules: { pattern: /^first$/, message: 'Invalid first row' } },
      },
    })
    form.batch((d) => {
      d.group.rows.$value.unshift({ code: 'wrong' })
      d.group.rows.$value.splice(1, 1)
      d.group.rows.$value.push({ code: 'also wrong' })
    })
    await expect(form.submit()).rejects.toEqual([
      { path: 'group.rows.0.code', messages: ['Invalid first row'] },
      { path: 'group.rows.2.code', messages: ['Invalid row'] },
    ])
    form.setValue('group.rows[0].code', 'first')
    form.setValue('group.rows[2].code', 'row')
    await expect(form.submit()).resolves.toEqual({ group: { rows: [{ code: 'first' }, { code: 'row' }, { code: 'row' }] } })
  })

  it('QA-63 shares dependencies between bracket query reads and dot writes', () => {
    type Values = { groups: { 'item-code': string }[]; echo: string }
    const derive = vi.fn()
    const form = createForm<Values>({
      initialValues: { groups: [{ 'item-code': 'initial' }], echo: '' },
      effects: [defineEffects<Values>(({ query, reaction }) => {
        const handle = query('groups[0]["item-code"]')
        reaction((d) => {
          derive(handle.$value)
          d.echo.$value = handle.$value
        })
      })],
    })
    form.setValue('groups.0.item-code', 'edited')
    expect(derive.mock.calls).toEqual([['initial'], ['edited']])
    expect(form.getSubmitValues().echo).toBe('edited')
  })

  it('QA-18 cancels only nested row 1, leaving the queued row 10 attempt and permitting a new row 1 edit', async () => {
    vi.useFakeTimers()
    type Values = { group: { rows: { code: string }[] }[] }
    const check = vi.fn(async () => null)
    const form = createForm<Values>({
      initialValues: { group: [{ rows: Array.from({ length: 11 }, () => ({ code: 'initial' })) }] },
      validateTrigger: ['onChange'],
      asyncDebounceMs: 50,
      fields: { 'group.0.rows.*.code': { rules: { validator: check } } },
    })
    form.setValue('group[0].rows[1].code', 'discard')
    form.setValue('group[0].rows[10].code', 'neighbor')
    await vi.advanceTimersByTimeAsync(20)
    form.reset('group[0]["rows"][1]' as 'group.0.rows.1')
    form.setValue('group[0].rows[1].code', 'fresh')
    await vi.advanceTimersByTimeAsync(30)
    expect(check).toHaveBeenCalledExactlyOnceWith('neighbor', expect.objectContaining({ path: 'group.0.rows.10.code' }))
    await vi.advanceTimersByTimeAsync(20)
    expect(check).toHaveBeenLastCalledWith('fresh', expect.objectContaining({ path: 'group.0.rows.1.code' }))
    expect(check).toHaveBeenCalledTimes(2)
  })

  it('QA-18 cancels the old timer and submit validates the reset value immediately', async () => {
    vi.useFakeTimers()
    const check = vi.fn(async () => null)
    const form = createForm({
      initialValues: { settings: { code: 'initial' } },
      validateTrigger: ['onChange'],
      asyncDebounceMs: 50,
      fields: { 'settings.code': { rules: { validator: check } } },
    })
    form.setValue('settings["code"]', 'discard')
    form.reset('settings["code"]' as 'settings.code')
    await expect(form.submit()).resolves.toEqual({ settings: { code: 'initial' } })
    await vi.advanceTimersByTimeAsync(50)
    expect(check).toHaveBeenCalledExactlyOnceWith('initial', expect.objectContaining({ path: 'settings.code' }))
  })

  it('QA-57 keeps normalized nested option edits across a failed inner batch', async () => {
    const form = createForm({ initialValues: { panel: { choice: ['blue'] } }, enumPolicy: 'error' })
    form.batch((d) => {
      d.panel.choice.$enum = ['blue', 'green']
      expect(() => form.batch((inner) => {
        inner.panel.choice.$enum = ['red']
        expect(inner.panel.choice.$enum[0].value).toBe('red')
        throw new Error('rollback')
      })).toThrow('rollback')
      const [blue] = d.panel.choice.$enum as EnumOption[]
      blue.label = 'Blue'
      blue.children = [{ label: 'Navy', value: 'navy' }]
      expect(d.panel.choice.$enum.map(({ value }) => value)).toEqual(['blue', 'green'])
    })
    expect(engineOf(form).binding('panel.choice').options).toEqual([
      { label: 'Blue', value: 'blue', children: [{ label: 'Navy', value: 'navy' }] },
      { label: 'green', value: 'green' },
    ])
    await expect(form.submit()).resolves.toEqual({ panel: { choice: ['blue'] } })
  })

  it('QA-57 normalizes a replacement written by a reaction before using it for a follow-up write', async () => {
    type Values = { source: string; output: string }
    const form = createForm<Values>({
      initialValues: { source: 'A', output: '' },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          d.output.$enum = [d.source.$value]
          d.output.$value = String(d.output.$enum[0].value)
        })
      })],
      enumPolicy: 'error',
    })
    form.setValue('source', 'B')
    await expect(form.submit()).resolves.toEqual({ source: 'B', output: 'B' })
  })

  it('QA-64 clears the override and aborts an in-flight enum with no fallback', async () => {
    const late = deferred<EnumOption[]>()
    const load = vi.fn((_key: string, { signal }: { signal: AbortSignal }) => {
      expect(signal.aborted).toBe(false)
      return late.promise
    })
    const form = createForm({ initialValues: { group: { choice: 'keep' } } })
    form.batch((d) => { d.group.choice.$enum = ['keep'] })
    form.batch((d) => { d.group.choice.$enum = EnumSource.from(load).with('late') })
    expect(engineOf(form).binding('group.choice').loading).toBe(true)
    form.batch((d) => {
      d.group.choice.$enum = undefined
      expect(d.group.choice.$enum).toEqual([])
    })
    expect(load.mock.calls[0][1].signal.aborted).toBe(true)
    late.resolve([{ label: 'Late', value: 'late' }])
    await setImmediate()
    expect(engineOf(form).binding('group.choice')).toMatchObject({ loading: false, options: [] })
    expect(form.getSubmitValues()).toEqual({ group: { choice: 'keep' } })
  })

  it.fails('BUG: QA-64 neighbor reads a stale static override instead of the cached declared source', async () => {
    const declared = [{ label: 'Declared', value: 'declared' }]
    const load = vi.fn(async () => declared)
    const form = createForm({
      initialValues: { choice: 'declared' },
      fields: { choice: { enum: EnumSource.from<void>(load) } },
    })
    await setImmediate()
    expect(engineOf(form).binding('choice').options).toEqual(declared)
    form.batch((d) => { d.choice.$enum = ['override'] })
    let pending: unknown[] = []
    form.batch((d) => {
      d.choice.$enum = undefined
      pending = d.choice.$enum.map(({ value }) => value)
    })
    await setImmediate()
    expect(engineOf(form).binding('choice').options).toEqual(declared)
    expect(load).toHaveBeenCalledOnce()
    expect(pending).toEqual(['declared'])
  })
})
