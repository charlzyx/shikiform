import { createForm, defineEffects, ShikiUsageError, type FormInstance } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../../../packages/core/src/engine/create'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('reaction failures and async continuations in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-45 reports the first of two errors only after an independent chain settles', async () => {
    type Values = { qty: number; total: number; final: number }
    const first = new Error('first failure')
    const second = new Error('second failure')
    const form = createForm<Values>({
      initialValues: { qty: 1, total: 0, final: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => { if (d.qty.$value === 2) throw first })
        reaction((d) => { if (d.qty.$value === 2) throw second })
        reaction((d) => { d.total.$value = d.qty.$value * 4 })
        reaction((d) => { d.final.$value = d.total.$value + 2 })
      })],
    })
    const seen = vi.fn(() => form.getValue('final'))
    form.subscribePath('qty', seen)
    expect(() => form.batch((d) => { d.qty.$value = 2 })).toThrow(first)
    expect(seen.mock.results.map(result => result.value)).toEqual([10])
    await expect(form.submit()).resolves.toEqual({ qty: 2, total: 8, final: 10 })
    form.setValue('qty', 3)
    expect(form.getValue('final')).toBe(14)
  })

  it('QA-45 recomputes row derivations and their aggregate after an array insert triggers a failing sibling', async () => {
    type Values = { rows: { id: string; qty: number; total: number }[]; combined: number }
    const fail = new Error('failing sibling')
    const form = createEngine<Values>({
      initialValues: { rows: [{ id: 'a', qty: 2, total: 0 }], combined: 0 },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction((d) => { if (d.rows.$value.length === 2) throw fail })
        reaction.each(draft.rows, (row) => { row.total.$value = row.qty.$value * 3 })
        reaction((d) => { d.combined.$value = d.rows.$value.reduce((sum, row) => sum + row.total, 0) })
      })],
    })
    expect(() => form.insertArray('rows', 0, { id: 'new', qty: 4, total: 0 })).toThrow(fail)
    const result = await form.submit()
    expect(result.rows.map(row => [row.id, row.total])).toEqual([['new', 12], ['a', 6]])
    expect(result.combined).toBe(18)
  })

  it('QA-46 invalidates row, root and named UI drafts captured by a rejected reaction.each', async () => {
    type Values = { rows: { id: string; active: boolean; label: string }[]; message: string }
    let release!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    let task!: Promise<void>
    const form = createEngine<Values>({
      initialValues: { rows: [{ id: 'a', active: false, label: 'before' }], message: 'before' },
      effects: [defineEffects<Values>(({ draft, reaction }) => {
        reaction.each(draft.rows, (row, { d }) => {
          if (!row.active.$value) return
          const ui = row.label.$ui('echo')
          const props = ui.$componentProps
          task = gate.then(() => {
            const read = () => row.label.$value
            if (mode === 'development') expect(read).toThrow(/after await/)
            else expect(read()).toBe('before')
            const attempts = [
              () => { row.label.$value = 'late' },
              () => { d.message.$value = 'late' },
              () => { ui.$title = 'late' },
              () => { delete props.style.color },
            ]
            for (const write of attempts) {
              if (mode === 'development') expect(write).toThrow(/after await/)
              else expect(write).not.toThrow()
            }
          })
          return task
        })
      })],
    })
    form.claimUi('rows.0.label', 'echo', 'field')
    form.batch((d) => {
      d.rows[0].label.$ui('echo').$title = 'original'
      d.rows[0].label.$ui('echo').$componentProps = { style: { color: 'red' } }
    })
    expect(() => form.setValue('rows.0.active', true)).toThrow(/must be synchronous/)
    release()
    await task
    expect(form.uiBinding('rows.0.label', 'echo', undefined, 'field')).toMatchObject({
      title: 'original', componentProps: { style: { color: 'red' } },
    })
    await expect(form.submit()).resolves.toEqual({
      rows: [{ id: 'a', active: true, label: 'before' }], message: 'before',
    })
  })

  it('QA-46 leaves a separately started watch free to commit async results via a new batch', async () => {
    type Values = { request: number; result: number[] }
    let form: FormInstance<Values>
    let task!: Promise<void>
    form = createForm<Values>({
      initialValues: { request: 0, result: [] },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch(draft.request, (d) => {
          const request = d.request.$value
          task = Promise.resolve().then(() => {
            form.setValue('result', [request])
            form.batch((next) => { next.result.$value.push(request + 1) })
          })
        })
      })],
    })
    form.setValue('request', 7)
    expect(form.getValue('result')).toEqual([])
    await task
    await expect(form.submit()).resolves.toEqual({ request: 7, result: [7, 8] })
  })

  it('QA-47 settles a successful setValue alongside a row mutation', async () => {
    type Values = { trigger: boolean; rows: number[]; note: string }
    let form: FormInstance<Values>
    form = createForm<Values>({
      initialValues: { trigger: false, rows: [1], note: '' },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          if (!d.trigger.$value || d.rows.$value.length !== 1) return
          d.rows.$value.push(2)
          form.setValue('note', 'from reaction')
          if (d.note.$value !== 'from reaction') throw new Error('setValue missing from draft')
        })
      })],
    })
    const states = vi.fn(() => form.getSubmitValues())
    form.subscribePath('rows', states)
    const change = () => form.setValue('trigger', true)
    change()
    expect(states.mock.results.map(result => result.value)).toEqual([
      { trigger: true, rows: [1, 2], note: 'from reaction' },
    ])
    await expect(form.validate('note')).resolves.toBe('from reaction')
  })

  it('QA-47 allows watch actions to set a value, move its baseline and submit it', async () => {
    type Values = { start: boolean; note: string }
    let form: FormInstance<Values>
    let submitted!: Promise<Values>
    form = createForm<Values>({
      initialValues: { start: false, note: '' },
      effects: [defineEffects<Values>(({ draft, watch }) => {
        watch(draft.start, (d) => {
          if (!d.start.$value) return
          form.setValue('note', 'done')
          form.reset({ start: true, note: 'saved' })
          submitted = form.submit()
        })
      })],
    })
    expect(() => form.setValue('start', true)).not.toThrow(ShikiUsageError)
    await expect(submitted).resolves.toEqual({ start: true, note: 'saved' })
    expect(form.dirty).toBe(false)
  })
})
