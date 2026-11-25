import { createForm, defineEffects, ShikiUsageError, toRaw } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F7 effects acceptance in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('tracks only the active calculation input and replays the same pass value for downstream writes', () => {
    type Values = { active: 'a' | 'b'; inputs: { a: number; b: number }; result: { value: number }; display: string }
    const calculation = vi.fn()
    const form = createForm<Values>({
      initialValues: { active: 'a', inputs: { a: 2, b: 3 }, result: { value: 0 }, display: '' },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          calculation()
          d.result.value.$value = d.inputs[d.active.$value].$value * 2
          d.display.$value = String(d.result.$value.value)
        })
      })],
    })
    expect(form.getValue('display')).toBe('4')
    calculation.mockClear()
    form.setValue('inputs.b', 4)
    expect(calculation).not.toHaveBeenCalled()
    form.setValue('active', 'b')
    expect(form.getValue('display')).toBe('8')
    const calls = calculation.mock.calls.length
    form.setValue('inputs.a', 6)
    expect(calculation).toHaveBeenCalledTimes(calls)
    form.setValue('inputs.b', 5)
    expect(calculation.mock.calls.length).toBeGreaterThan(calls)
    expect(form.getValue('display')).toBe('10')
  })

  it.fails('BUG: getValue reads an in-progress reaction write when the calling batch has ended', () => {
    type Values = { input: number; result: number }
    const reads: [number, number][] = []
    const form = createForm<Values>({
      initialValues: { input: 0, result: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          const input = d.input.$value
          if (!input) return
          d.result.$value = input * 2
          reads.push([form.getValue('result'), d.result.$value])
        })
      })],
    })
    form.batch((d) => { d.input.$value = 2 })
    expect(reads.at(0)).toEqual([4, 4])
  })

  it('watch edits lists in order and ignores values read only in the action', () => {
    type Values = { flag: boolean; seed: number; rows: { qty: number }[]; total: number }
    const action = vi.fn()
    const form = createForm<Values>({
      initialValues: { flag: false, seed: 2, rows: [{ qty: 1 }], total: 0 },
      effects: [defineEffects<Values>(({ watch, draft, reaction }) => {
        watch(draft.flag, (d) => {
          action()
          d.rows.$value.push({ qty: d.seed.$value })
          d.rows[0].qty.$value += 10
          d.rows.$value.reverse()
          expect(d.rows.$value.map(({ qty }) => qty)).toEqual([2, 11])
        })
        reaction((d) => { d.total.$value = d.rows.$value.reduce((sum, row) => sum + row.qty, 0) })
      })],
    })
    expect(action).not.toHaveBeenCalled()
    form.setValue('flag', true)
    form.setValue('seed', 3)
    expect(action).toHaveBeenCalledOnce()
    expect(form.getValue('total')).toBe(13)
  })

  it('QA-69 combines direct form writes with draft structure edits in the same watch', () => {
    type Values = { run: boolean; processed: boolean; rows: { id: string; qty: number }[] }
    const form = createForm<Values>({
      initialValues: { run: false, processed: false, rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] },
      effects: [defineEffects<Values>(({ watch, draft }) => {
        watch(draft.run, (d) => {
          d.processed.$value = true
          form.setValue('rows.0.qty', 10)
          d.rows.$value.reverse()
          expect(d.rows[1].qty.$value).toBe(10)
          form.patchValues({ rows: [{ id: 'b', qty: 3 }, { id: 'a', qty: 10 }] })
        })
      })],
    })
    form.setValue('run', true)
    expect(form.getSubmitValues()).toEqual({
      run: true, processed: true, rows: [{ id: 'b', qty: 3 }, { id: 'a', qty: 10 }],
    })
  })

  it('QA-69 discards direct writes with the rest of a failed watch', () => {
    type Values = { run: boolean; note: string; rows: number[] }
    const form = createForm<Values>({
      initialValues: { run: false, note: '', rows: [1, 2] },
      effects: [defineEffects<Values>(({ watch, draft }) => {
        watch(draft.run, (d) => {
          form.setValue('note', 'temporary')
          d.rows.$value.reverse()
          throw new Error('discard watch')
        })
      })],
    })
    expect(() => form.setValue('run', true)).toThrow('discard watch')
    expect(form.getSubmitValues()).toEqual({ run: true, note: '', rows: [1, 2] })
  })

  it('getValue exposes the current batch snapshot with the ordinary read-only and identity rules', () => {
    const form = createForm({ initialValues: { group: { items: [1], label: 'before' } } })
    const before = form.getValue('group')
    form.batch((d) => {
      d.group.$value.items.push(2)
      const pending = form.getValue('group')
      expect(pending).toBe(form.getValue('group'))
      expect(pending).toEqual({ items: [1, 2], label: 'before' })
      expect(before.items).toEqual([1])
      if (mode === 'development') {
        expect(() => pending.items.push(99)).toThrow(ShikiUsageError)
        expect(pending).not.toBe(toRaw(pending))
      } else {
        expect(pending).toBe(toRaw(pending))
      }
      form.setValue('group.label', 'after')
      expect(form.getValue('group.label')).toBe('after')
      expect(d.group.label.$value).toBe('after')
    })
    expect(form.getValue('group')).toEqual({ items: [1, 2], label: 'after' })
  })

  it('dirty compares settled values and dirtyRows lists only final changed occupants', () => {
    const initialValues = { rows: [{ qty: 1 }, { qty: 2 }, { qty: 3 }], temp: 0 }
    const form = createForm({ initialValues, fields: { temp: { omit: true } } })
    const engine = engineOf(form)
    form.batch((d) => {
      d.rows[0].qty.$value = 9
      engine.swapArray('rows', 0, 1)
      engine.swapArray('rows', 0, 1)
      d.rows[0].qty.$value = 1
      engine.pushArray('rows', { qty: 4 })
      d.temp.$value = 1
    })
    expect(engine.takeDirtyRows('rows')).toEqual(new Set([3]))
    expect(form.dirty).toBe(true)
    form.batch(() => { engine.removeArray('rows', 3) })
    expect(form.dirty).toBe(false)
    expect(form.getSubmitValues()).toEqual({ rows: initialValues.rows })
  })

  it('reaction.each runs only the edited row and the inserted row when other rows keep their slots', () => {
    type Values = { rows: { id: string; qty: number; doubled: number }[] }
    const run = vi.fn()
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'a', qty: 1, doubled: 0 }, { id: 'b', qty: 2, doubled: 0 }, { id: 'c', qty: 3, doubled: 0 }] },
      effects: [defineEffects<Values>(({ reaction, draft }) => {
        reaction.each(draft.rows, (row) => {
          run(row.id.$value)
          row.doubled.$value = row.qty.$value * 2
        })
      })],
    })
    const engine = engineOf(form)
    run.mockClear()
    form.batch((d) => {
      d.rows[0].qty.$value = 2
      d.rows[1].qty.$value = 99
      d.rows[1].qty.$value = 2
      engine.pushArray('rows', { id: 'd', qty: 4, doubled: 0 })
    })
    expect(form.getValue('rows').map(({ id, doubled }) => [id, doubled])).toEqual([['a', 4], ['b', 4], ['c', 6], ['d', 8]])
    expect(run.mock.calls.flat().sort()).toEqual(['a', 'd'])
  })

  it.fails('BUG: runs each affected slot once when a cell edit is followed by a move', () => {
    type Values = { rows: { id: string; qty: number }[] }
    const run = vi.fn()
    const form = createForm<Values>({
      initialValues: { rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }, { id: 'c', qty: 3 }] },
      effects: [defineEffects<Values>(({ reaction, draft }) => {
        reaction.each(draft.rows, (row) => { run(row.id.$value, row.qty.$value) })
      })],
    })
    run.mockClear()
    form.batch(() => {
      form.setValue('rows.0.qty', 2)
      engineOf(form).moveArray('rows', 0, 1)
    })
    expect(run.mock.calls.sort()).toEqual([['a', 2], ['b', 2]])
  })

  it('enum, rule, and UI draft edits follow the working value through a row move', async () => {
    const form = createForm({
      initialValues: { rows: [{ id: 'a', choice: 'A' }, { id: 'b', choice: 'B' }] },
      fields: { 'rows.*.choice': { rules: { minLength: 1 }, componentProps: { style: { padding: 2 } } } },
    })
    form.batch((d) => {
      const field = d.rows[0].choice
      field.$value = 'Ada'
      field.$enum = [field.$value]
      field.$rules = [{ minLength: field.$value.length }]
      field.$componentProps.style.color = 'red'
      expect(field.$enum.map(({ value }) => value)).toEqual(['Ada'])
      expect(field.$rules).toEqual([{ minLength: 3 }])
      expect(field.$componentProps.style).toEqual({ padding: 2, color: 'red' })
      d.rows.$value.reverse()
    })
    const engine = engineOf(form)
    form.batch((d) => {
      expect(d.rows[1].choice.$rules).toEqual([{ minLength: 3 }])
      expect(d.rows[0].choice.$rules).toEqual([{ minLength: 1 }])
    })
    expect(engine.binding('rows.1.choice')).toMatchObject({
      value: 'Ada', options: [{ label: 'Ada', value: 'Ada' }], componentProps: { style: { padding: 2, color: 'red' } },
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'b', choice: 'B' }, { id: 'a', choice: 'Ada' }] })
  })

  it.fails('BUG: keeps distinct rule and enum writes on both rows when a move reuses their index', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', value: 1 }, { id: 'b', value: 2 }] } })
    form.batch((d) => {
      d.rows[0].value.$value = 10
      d.rows[0].value.$enum = [10]
      d.rows[0].value.$rules = [{ min: 10 }]
      d.rows.$value.reverse()
      d.rows[0].value.$value = 20
      d.rows[0].value.$enum = [20]
      d.rows[0].value.$rules = [{ min: 20 }]
    })
    form.batch((d) => {
      expect([d.rows[0].value.$value, d.rows[1].value.$value]).toEqual([20, 10])
      expect(d.rows.$value.map((_, i) => ({
        options: d.rows[i].value.$enum.map(({ value }) => value), rules: [...d.rows[i].value.$rules],
      }))).toEqual([{ options: [20], rules: [{ min: 20 }] }, { options: [10], rules: [{ min: 10 }] }])
    })
  })

  it('rolls back mixed edits from a failed layer including a successful grandchild batch', () => {
    type Node = { id: string; children: Node[] }
    const leaf = { id: 'child', children: [] }
    const form = createForm({
      initialValues: { rows: [{ id: 'a', x: 1 }, { id: 'b', x: 2 }], tree: [{ id: 'root', children: [leaf] }] as Node[] },
      trees: { tree: {} },
    })
    const engine = engineOf(form)
    const updates = vi.fn()
    form.subscribePath('rows.1.x', updates)
    form.batch((d) => {
      d.rows[0].x.$value = 3
      expect(() => form.batch((inner) => {
        engine.swapArray('rows', 0, 1)
        form.batch(() => { engine.moveTree('tree', [0, 0], [1]) })
        inner.rows[1].x.$enum = [99]
        inner.rows[1].x.$componentProps.hidden = true
        inner.rows[1].x.$value = 99
        form.setValue('rows.0.x', 200)
        form.patchValues({ tree: [] })
        expect(form.getValue('tree')).toEqual([])
        throw new Error('rollback')
      })).toThrow('rollback')
      expect(form.getValue('rows.0.x')).toBe(3)
      expect(form.getValue('tree')).toEqual([{ id: 'root', children: [leaf] }])
      expect(d.rows[0].x.$enum).toEqual([])
      expect(d.rows[0].x.$componentProps).toEqual({})
      d.rows[0].x.$value = 4
    })
    expect(updates).not.toHaveBeenCalled()
    expect(engine.binding('rows.0.x').componentProps).toEqual({})
    expect(form.getSubmitValues()).toEqual({
      rows: [{ id: 'a', x: 4 }, { id: 'b', x: 2 }], tree: [{ id: 'root', children: [leaf] }],
    })
  })
})
