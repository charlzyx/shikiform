import { createForm, defineEffects, EnumSource, ShikiUsageError } from '@shikiform/core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEngine } from '../../../../packages/core/src/engine/create'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('runtime guards in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-48 preserves a valid buffered list and can restore a row template after an invalid binding', async () => {
    const form = createForm({
      initialValues: { rows: [{ choice: 'keep' }] },
      fields: { 'rows.*.choice': { enum: ['keep'] } },
      enumPolicy: 'clear',
    })
    form.batch((d) => {
      d.rows[0].choice.$enum = [{ label: 'Keep', value: 'keep' }, { label: 'More', value: 'more' }]
      const invalid = () => { d.rows[0].choice.$enum = { kind: 'enum', source: 0 } as never }
      if (mode === 'development') expect(invalid).toThrow(/\$enum.*EnumSource/)
      else expect(invalid).not.toThrow()
      expect(d.rows[0].choice.$enum.map(option => option.value)).toEqual(['keep', 'more'])
    })
    form.batch((d) => { d.rows[0].choice.$enum = undefined })
    form.batch((d) => { expect(d.rows[0].choice.$enum.map(option => option.value)).toEqual(['keep']) })
    await expect(form.submit()).resolves.toEqual({ rows: [{ choice: 'keep' }] })
  })

  it('QA-48 preserves an in-flight enum binding through an invalid write and a row move', async () => {
    const options = [{ label: 'Kept', value: 'keep' }]
    let finish!: (value: typeof options) => void
    let signal!: AbortSignal
    const source = EnumSource.from((_id: string, ctx) => {
      signal = ctx.signal
      return new Promise<typeof options>(resolve => { finish = resolve })
    })
    const form = createEngine({
      initialValues: { rows: [{ id: 'a', choice: 'keep' }, { id: 'b', choice: 'other' }] },
      enumPolicy: 'clear',
    })
    form.batch((d) => { d.rows[0].choice.$enum = source.with('a') })
    const invalid = () => form.batch((d) => { d.rows[0].choice.$enum = new Set(options) as never })
    if (mode === 'development') expect(invalid).toThrow(ShikiUsageError)
    else expect(invalid).not.toThrow()
    form.moveArray('rows', 0, 1)
    expect(signal.aborted).toBe(false)
    finish(options)
    await vi.waitFor(() => {
      expect(form.binding('rows.1.choice')).toMatchObject({ value: 'keep', options, loading: false })
    })
  })

  it('QA-49 preserves a buffered rule when delete would create a hole, and [] still clears it', async () => {
    const form = createForm({ initialValues: { user: { code: '' } } })
    form.batch((d) => {
      d.user.code.$rules = [{ required: true, message: 'Code required' }]
      const invalid = () => { delete d.user.code.$rules[0] }
      if (mode === 'development') expect(invalid).toThrow(/array of rule objects/)
      else expect(invalid).not.toThrow()
      expect(d.user.code.$rules).toHaveLength(1)
      expect(d.user.code.$rules[0].required).toBe(true)
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'user.code', messages: ['Code required'] }])
    form.batch((d) => { d.user.code.$rules = [] })
    await expect(form.submit()).resolves.toEqual({ user: { code: '' } })
  })

  it('QA-49 rejects malformed rule entries consistently even when nested inside a row template', async () => {
    const form = createForm({
      initialValues: { rows: [{ age: 10 }] },
      fields: { 'rows.*.age': { rules: { min: 18, message: 'Must be 18' } } },
    })
    form.batch((d) => {
      for (const entry of [new Date(), [], false]) {
        const invalid = () => { d.rows[0].age.$rules = [{ min: 0 }, entry] as never }
        if (mode === 'development') expect(invalid).toThrow(ShikiUsageError)
        else expect(invalid).not.toThrow()
      }
      expect(d.rows[0].age.$rules[0].min).toBe(18)
    })
    await expect(form.submit()).rejects.toEqual([{ path: 'rows.0.age', messages: ['Must be 18'] }])
  })

  it('QA-53 rejects a class instance and accepts a null-prototype replacement and nested patches', () => {
    class Props {
      placeholder = 'invalid'
    }
    const form = createEngine({
      initialValues: { code: '' },
      fields: { code: { componentProps: { placeholder: 'declared' } } },
    })
    form.batch((d) => {
      const invalid = () => { d.code.$componentProps = new Props() }
      if (mode === 'development') expect(invalid).toThrow(/expects a plain object/)
      else expect(invalid).not.toThrow()
      expect(d.code.$componentProps.placeholder).toBe('declared')
      d.code.$componentProps = Object.assign(Object.create(null), { style: { color: 'blue' } })
      d.code.$componentProps.style.color = 'red'
    })
    expect(form.binding('code').componentProps).toEqual({ style: { color: 'red' } })
    form.batch((d) => { Reflect.set(d.code, '$componentProps', undefined) })
    expect(form.binding('code').componentProps).toEqual({ placeholder: 'declared' })
  })

  it('QA-53 keeps named UI JSX props after invalid writes and applies only the valid nested patch', () => {
    const form = createEngine({ initialValues: { code: '' } })
    form.claimUi('code', 'echo', 'field')
    form.batch((d) => {
      const ui = d.code.$ui('echo')
      const invalid = () => { ui.$decoratorProps = 7 as never }
      if (mode === 'development') expect(invalid).toThrow(/\$decoratorProps expects a plain object/)
      else expect(invalid).not.toThrow()
      ui.$decoratorProps.style ??= {}
      ui.$decoratorProps.style.color = 'red'
    })
    const jsx = { decoratorProps: { label: 'Echo', style: { padding: 8 } } }
    expect(form.uiBinding('code', 'echo', jsx, 'field').decoratorProps).toEqual({
      label: 'Echo', style: { padding: 8, color: 'red' },
    })
  })

  it('QA-51 leaves siblings intact after direct writes to an existing row child and an absent handle', async () => {
    const form = createForm({ initialValues: { rows: [{ qty: 1 }], note: '' } })
    form.batch((d) => {
      for (const key of ['qty', 'absent']) {
        const write = () => Reflect.set(d.rows[0], key, 99)
        if (mode === 'development') expect(write).toThrow(/\$value/)
        else expect(write()).toBe(true)
      }
      d.rows.$value.push({ qty: 2 })
      d.note.$value = 'saved'
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ qty: 1 }, { qty: 2 }], note: 'saved' })
  })

  it('QA-51 ignores a strict array-index handle assignment while accepting a value-draft index assignment', () => {
    const form = createForm({ initialValues: { values: [1, 2] } })
    form.batch((d) => {
      const write = () => { (d.values as unknown as number[])[0] = 99 }
      if (mode === 'development') expect(write).toThrow(/\$value/)
      else expect(write).not.toThrow()
      d.values.$value[1] = 8
    })
    expect(form.getSubmitValues()).toEqual({ values: [1, 8] })
  })

  it('QA-35 resolves an own undefined key inserted by a buffered row replacement', async () => {
    type Row = { $valeu?: string }
    const form = createForm<{ rows: Row[] }>({ initialValues: { rows: [] } })
    form.batch((d) => {
      d.rows.$value.push({ $valeu: undefined })
      expect(d.rows[0].$valeu.$value).toBeUndefined()
      d.rows[0].$valeu.$value = 'own business value'
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ $valeu: 'own business value' }] })
  })

  it('QA-35 does not subscribe a reaction merely by walking an own dollar-prefixed field handle', () => {
    type Values = { group: { $errorss: string }; other: number }
    const read = vi.fn()
    const form = createForm({
      initialValues: { group: { $errorss: 'data' }, other: 0 },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          const handle = d.group.$errorss
          read(typeof handle, d.other.$value)
        })
      })],
    })
    expect(read.mock.calls).toEqual([['function', 0]])
    form.setValue('group.$errorss', 'changed')
    expect(read).toHaveBeenCalledOnce()
    form.setValue('other', 1)
    expect(read.mock.calls).toEqual([['function', 0], ['function', 1]])
  })

  it('QA-52 ignores a nested misspelled state as a write and still applies a correct flag', () => {
    const form = createEngine({ initialValues: { rows: [{ selected: false }] } })
    form.batch((d) => {
      const child = d.rows[0].selected
      const write = () => Reflect.set(child, '$disbaled', true)
      if (mode === 'development') expect(write).toThrow(/Did you mean [\s\S]*\$disabled/)
      else expect(write()).toBe(true)
      d.rows[0].selected.$visible = false
    })
    expect(form.binding('rows.0.selected')).toMatchObject({ visible: false, disabled: false, value: false })
  })

  it('QA-52 treats a formerly own near-state key as a typo after a buffered parent replacement', () => {
    type Values = { row: { $visibile?: string }; marker: string }
    const form = createForm<Values>({ initialValues: { row: { $visibile: 'real' }, marker: '' } })
    form.batch((d) => {
      expect(d.row.$visibile.$value).toBe('real')
      d.row.$value = {}
      const read = () => Reflect.get(d.row, '$visibile')
      if (mode === 'development') expect(read).toThrow(/Did you mean [\s\S]*\$visible/)
      else expect(read()).toBeUndefined()
      d.marker.$value = 'saved'
    })
    expect(form.getSubmitValues()).toEqual({ row: {}, marker: 'saved' })
  })
})
