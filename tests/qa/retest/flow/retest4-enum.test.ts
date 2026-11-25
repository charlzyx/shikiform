import { setImmediate } from 'node:timers/promises'
import { createForm, defineEffects, EnumSource } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F7 enum variants in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-68 uses the cached key of a row template after moving the row', async () => {
    const load = vi.fn(async (key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load)
    const form = createForm({
      initialValues: { rows: [{ id: 'a', choice: 'template' }, { id: 'b', choice: 'template' }] },
      fields: { 'rows.*.choice': { enum: source.with('template') } },
      enumPolicy: 'error',
    })
    const engine = engineOf(form)
    await setImmediate()
    form.batch((d) => { d.rows[1].choice.$enum = source.with('other') })
    await setImmediate()
    engine.moveArray('rows', 1, 0)
    form.batch((d) => {
      d.rows[0].choice.$enum = undefined
      expect(d.rows[0].choice.$enum.map((option) => option.value)).toEqual(['template'])
    })
    expect(engine.binding('rows.0.choice')).toMatchObject({ loading: false, options: [{ label: 'template', value: 'template' }] })
    expect(load.mock.calls).toEqual([['template', expect.anything()], ['other', expect.anything()]])
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', choice: 'template' }, { id: 'a', choice: 'template' }] })
  })

  it('QA-68 restores a cached empty JSX source over a populated declaration without reloading', async () => {
    const load = vi.fn(async () => [])
    const source = EnumSource.from<void>(load)
    const form = createForm({
      initialValues: { group: { choice: '' } },
      fields: { 'group.choice': { enum: ['declared'] } },
    })
    const engine = engineOf(form)
    engine.applyJsxEnum('group.choice', source)
    await setImmediate()
    form.batch((d) => { d.group.choice.$enum = ['override'] })
    form.batch((d) => {
      form.batch((inner) => { inner.group.choice.$enum = undefined })
      expect(d.group.choice.$enum).toEqual([])
    })
    expect(engine.binding('group.choice')).toMatchObject({ loading: false, options: [] })
    expect(load).toHaveBeenCalledOnce()
  })

  it.fails('BUG: QA-68 reads the moved row JSX fallback at its new coordinate in the same batch', async () => {
    const load = vi.fn(async (key: string) => [{ label: key, value: key }])
    const source = EnumSource.from(load)
    const form = createForm({ initialValues: { rows: [{ id: 'a', choice: 'A' }, { id: 'b', choice: 'B' }] } })
    const engine = engineOf(form)
    engine.applyJsxEnum('rows.0.choice', source.with('A'))
    engine.applyJsxEnum('rows.1.choice', source.with('B'))
    await setImmediate()
    form.batch((d) => { d.rows[1].choice.$enum = ['override'] })

    let projected: unknown[] = []
    form.batch((d) => {
      engine.moveArray('rows', 1, 0)
      d.rows[0].choice.$enum = undefined
      projected = d.rows[0].choice.$enum.map(({ value }) => value)
    })
    expect(engine.binding('rows.0.choice').options).toEqual([{ label: 'B', value: 'B' }])
    expect(load).toHaveBeenCalledTimes(2)
    expect(projected).toEqual(['B'])
  })

  it('QA-64 clears an override on a relocated row with no fallback and leaves submit values alone', async () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', choice: 1 }, { id: 'b', choice: 2 }] } })
    form.batch((d) => { d.rows[0].choice.$enum = [1, 3] })
    form.batch((d) => {
      d.rows.$value.reverse()
      d.rows[1].choice.$enum = undefined
      expect(d.rows[1].choice.$enum).toEqual([])
    })
    expect(engineOf(form).binding('rows.1.choice').options ?? []).toEqual([])
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', choice: 2 }, { id: 'a', choice: 1 }] })
  })

  it('QA-64 clears in a watch and retains the prior override after nested rollback', () => {
    type Values = { group: { choice: number }; clear: boolean; count: number }
    const form = createForm<Values>({
      initialValues: { group: { choice: 1 }, clear: false, count: -1 },
      effects: [defineEffects<Values>(({ watch, draft }) => {
        watch(draft.clear, (d) => {
          d.group.choice.$enum = undefined
          d.count.$value = d.group.choice.$enum.length
        })
      })],
    })
    form.batch((d) => { d.group.choice.$enum = [1, 2] })
    expect(() => form.batch(() => {
      form.batch((d) => { d.group.choice.$enum = undefined })
      throw new Error('discard')
    })).toThrow('discard')
    expect(engineOf(form).binding('group.choice').options?.map(({ value }) => value)).toEqual([1, 2])
    form.setValue('clear', true)
    expect(form.getValue('count')).toBe(0)
    expect(engineOf(form).binding('group.choice').options ?? []).toEqual([])
  })
})
