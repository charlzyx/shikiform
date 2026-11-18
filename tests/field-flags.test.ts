import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

describe('field flags', () => {
  it('visible defaults to true and false stops rendering without dropping the value from submit', async () => {
    const form = createEngine<{ a: string; b: string }>({ initialValues: { a: 'keep', b: '' } })
    expect(form.binding('a').visible).toBe(true)
    form.batch((d) => {
      d.a.$visible = false
      d.b.$visible = false
      d.b.$required = true
    })
    expect(form.binding('a').visible).toBe(false)
    expect(form.binding('b').visible).toBe(false)
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(form.getSubmitValues()).toEqual({ a: 'keep', b: '' })
    expect(await form.submit()).toEqual({ a: 'keep', b: '' })
    form.batch((d) => { d.b.$visible = true })
    expect(form.binding('b').visible).toBe(true)
    await expect(form.submit()).rejects.toEqual([expect.objectContaining({ path: 'b' })])
  })

  it('disabled grays the field out, skips validation, and still submits', async () => {
    const form = createEngine<{ a: string }>({ initialValues: { a: '' }, fields: { a: { required: true } } })
    form.batch((d) => { d.a.$disabled = true })
    expect(form.binding('a').disabled).toBe(true)
    expect(form.binding('a').readOnly).toBe(false)
    expect(form.binding('a').visible).toBe(true)
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(await form.submit()).toEqual({ a: '' })
  })

  it('readOnly renders as a preview, skips validation, and still submits', async () => {
    const form = createEngine<{ a: string }>({ initialValues: { a: '' }, fields: { a: { required: true, readOnly: true } } })
    expect(form.binding('a').readOnly).toBe(true)
    expect(form.binding('a').disabled).toBe(false)
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(await form.submit()).toEqual({ a: '' })
  })

  it('readOnly wins over disabled when both are set', () => {
    const form = createEngine<{ a: string }>({
      initialValues: { a: 'x' },
      fields: { a: { disabled: true, readOnly: true } },
    })
    const field = form.binding('a')
    expect(field.disabled).toBe(true)
    expect(field.readOnly).toBe(true)
    // The control layer treats readOnly as the preview and does not also disable it.
    expect(field.readOnly && field.disabled).toBe(true)
  })

  it('clears existing errors when the field stops validating, and brings them back when it does', async () => {
    const form = createEngine<{ a: string }>({ initialValues: { a: '' }, fields: { a: { required: true } } })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['a'])
    form.batch((d) => { d.a.$visible = false })
    expect(form.errors).toEqual([])
    expect(form.binding('a').errors).toEqual([])
    form.batch((d) => { d.a.$visible = true })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['a'])
    form.batch((d) => { d.a.$disabled = true })
    expect(form.errors).toEqual([])
    form.batch((d) => { d.a.$disabled = false; d.a.$readOnly = true })
    await fieldErrorsOf(form.validate())
    expect(form.errors).toEqual([])
    form.batch((d) => { d.a.$readOnly = false })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['a'])
  })

  it('submits every field except one whose own omit is set, including reaction-written values', async () => {
    const form = createEngine<{ price: number; total: number; note: string }>({
      initialValues: { price: 2, total: 0, note: 'keep' },
      fields: { note: { omit: true } },
      effects: [
        defineEffects<{ price: number; total: number; note: string }>(({ reaction }) => {
          reaction((d) => { d.total.$value = d.price.$value * 3 })
        }),
      ],
    })
    expect(form.getValue('total')).toBe(6)
    expect(form.binding('total').readOnly).toBe(false)
    expect(form.binding('note').omit).toBe(true)
    expect(form.getSubmitValues()).toEqual({ price: 2, total: 6 })
    expect(await form.submit()).toEqual({ price: 2, total: 6 })
    form.batch((d) => { d.total.$omit = true })
    expect(form.getSubmitValues()).toEqual({ price: 2 })
    form.batch((d) => { d.note.$omit = false })
    expect(form.getSubmitValues()).toEqual({ price: 2, note: 'keep' })
  })

  it('a hidden field is still submitted; omit is what leaves it out', async () => {
    const form = createEngine<{ shown: string; hidden: string }>({ initialValues: { shown: 's', hidden: 'h' } })
    form.batch((d) => { d.hidden.$visible = false })
    expect(await form.submit()).toEqual({ shown: 's', hidden: 'h' })
    form.batch((d) => { d.hidden.$omit = true })
    expect(form.getSubmitValues()).toEqual({ shown: 's' })
  })

  it('inherits visible, disabled and readOnly by OR, and an explicit false exits', () => {
    const form = createEngine<{ box: { child: string; other: string } }>({
      initialValues: { box: { child: 'v', other: 'o' } },
    })
    form.batch((d) => {
      d.box.$readOnly = true
      d.box.$disabled = true
      d.box.$visible = false
    })
    expect(form.binding('box.child').visible).toBe(false)
    expect(form.binding('box.child').disabled).toBe(true)
    expect(form.binding('box.child').readOnly).toBe(true)
    form.batch((d) => {
      d.box.child.$visible = true
      d.box.child.$disabled = false
      d.box.child.$readOnly = false
    })
    expect(form.binding('box.child').visible).toBe(true)
    expect(form.binding('box.child').disabled).toBe(false)
    expect(form.binding('box.child').readOnly).toBe(false)
    expect(form.binding('box.other').visible).toBe(false)
    expect(form.binding('box.other').readOnly).toBe(true)
    form.batch((d) => {
      d.box.child.$readOnly = undefined
      d.box.child.$disabled = undefined
      d.box.child.$visible = undefined
    })
    expect(form.binding('box.child').readOnly).toBe(true)
    expect(form.binding('box.child').disabled).toBe(true)
    expect(form.binding('box.child').visible).toBe(false)
  })

  it('inherits omit from an ancestor; a child omit: false does not opt back in', () => {
    const childOmit: boolean[] = []
    const rowOmit: boolean[] = []
    const form = createEngine<{ box: { child: string; nested: { leaf: string } }; rows: { name: string }[] }>({
      initialValues: { box: { child: 'v', nested: { leaf: 'l' } }, rows: [{ name: 'a' }] },
      fields: { 'box.child': { omit: false } },
      effects: [
        defineEffects<{ box: { child: string; nested: { leaf: string } }; rows: { name: string }[] }>(({ reaction }) => {
          reaction((d) => { childOmit.push(d.box.child.$omit) })
          reaction((d) => { rowOmit.push(d.rows[0].name.$omit) })
        }),
      ],
    })
    expect(childOmit.length).toBeGreaterThan(0)
    expect(childOmit.every((value) => value === false)).toBe(true)
    expect(rowOmit.every((value) => value === false)).toBe(true)
    expect(form.binding('box.child').omit).toBe(false)

    const childRuns = () => childOmit.length
    const rowRuns = () => rowOmit.length
    const beforeParent = childRuns()
    form.batch((d) => { d.box.$omit = true })
    expect(childRuns()).toBeGreaterThan(beforeParent)
    expect(childOmit.at(-1)).toBe(true)
    expect(rowOmit.at(-1)).toBe(false)
    expect(form.binding('box').omit).toBe(true)
    expect(form.binding('box.child').omit).toBe(true)
    expect(form.binding('box.nested.leaf').omit).toBe(true)
    let draftOmit = false
    form.batch((d) => { draftOmit = d.box.nested.leaf.$omit })
    expect(draftOmit).toBe(true)
    expect(form.getSubmitValues()).toEqual({ rows: [{ name: 'a' }] })

    // The declaration and a reaction `false` are stored, but the ancestor still wins.
    const afterParent = childRuns()
    form.batch((d) => { d.box.child.$omit = false })
    expect(childRuns()).toBeGreaterThan(afterParent)
    expect(childOmit.at(-1)).toBe(true)
    expect(form.binding('box.child').omit).toBe(true)
    expect(form.binding('box.nested.leaf').omit).toBe(true)
    expect(form.getSubmitValues()).toEqual({ rows: [{ name: 'a' }] })

    form.batch((d) => { d.box.$omit = false })
    expect(childOmit.at(-1)).toBe(false)
    expect(form.binding('box').omit).toBe(false)
    expect(form.binding('box.child').omit).toBe(false)
    expect(form.binding('box.nested.leaf').omit).toBe(false)
    expect(form.getSubmitValues()).toEqual({ box: { child: 'v', nested: { leaf: 'l' } }, rows: [{ name: 'a' }] })

    // A child's own omit still drops just that field. The parent stays submitted.
    form.batch((d) => { d.box.child.$omit = true })
    expect(form.binding('box').omit).toBe(false)
    expect(childOmit.at(-1)).toBe(true)
    expect(form.getSubmitValues()).toEqual({ box: { nested: { leaf: 'l' } }, rows: [{ name: 'a' }] })

    const childBeforeRows = childRuns()
    const rowBefore = rowRuns()
    form.batch((d) => { d.rows.$omit = true })
    expect(rowRuns()).toBeGreaterThan(rowBefore)
    expect(rowOmit.at(-1)).toBe(true)
    expect(childRuns()).toBe(childBeforeRows)
    expect(form.binding('rows').omit).toBe(true)
    expect(form.binding('rows.0.name').omit).toBe(true)
    let rowDraft = false
    form.batch((d) => { rowDraft = d.rows[0].name.$omit })
    expect(rowDraft).toBe(true)
    form.batch((d) => { d.rows[0].name.$omit = false })
    expect(form.binding('rows.0.name').omit).toBe(true)
    expect(rowOmit.at(-1)).toBe(true)
    expect(form.getSubmitValues()).toEqual({ box: { nested: { leaf: 'l' } } })
    form.batch((d) => { d.rows.$omit = false })
    expect(rowOmit.at(-1)).toBe(false)
    expect(form.binding('rows.0.name').omit).toBe(false)
    expect(form.getSubmitValues()).toEqual({ box: { nested: { leaf: 'l' } }, rows: [{ name: 'a' }] })
    expect(childRuns()).toBe(childBeforeRows)
  })

  it('edits under an omitted object or array do not count as dirty', () => {
    const form = createEngine<{ box: { child: string }; rows: { name: string }[]; keep: string }>({
      initialValues: { box: { child: 'v' }, rows: [{ name: 'a' }], keep: 'k' },
    })
    form.batch((d) => {
      d.box.$omit = true
      d.rows.$omit = true
    })
    form.setValue('box.child', 'x')
    form.setValue('rows.0.name', 'b')
    expect(form.dirty).toBe(false)
    expect(form.binding('box.child').dirty).toBe(false)
    expect(form.binding('rows.0.name').dirty).toBe(false)
    form.setValue('keep', 'changed')
    expect(form.dirty).toBe(true)
    form.setValue('keep', 'k')
    expect(form.dirty).toBe(false)
    form.batch((d) => { d.box.$omit = false })
    expect(form.dirty).toBe(true)
    expect(form.binding('box.child').dirty).toBe(true)
  })

  it('useForm({ readOnly: true }) and { disabled: true } set the root and inherit', () => {
    const readOnly = createEngine<{ a: string; box: { b: string } }>({
      initialValues: { a: '', box: { b: '' } },
      readOnly: true,
    })
    expect(readOnly.binding('').readOnly).toBe(true)
    expect(readOnly.binding('a').readOnly).toBe(true)
    expect(readOnly.binding('box.b').readOnly).toBe(true)
    readOnly.batch((d) => { d.a.$readOnly = false })
    expect(readOnly.binding('a').readOnly).toBe(false)
    expect(readOnly.binding('box.b').readOnly).toBe(true)

    const disabled = createEngine<{ a: string }>({ initialValues: { a: '' }, disabled: true })
    expect(disabled.binding('a').disabled).toBe(true)
    expect(disabled.binding('a').readOnly).toBe(false)
  })

  it('omit does not count as dirty; a hidden field does; a reaction-written field does not', () => {
    const form = createEngine<{ gone: string; temp: string; total: number }>({
      initialValues: { gone: 'a', temp: 'b', total: 0 },
      fields: { temp: { omit: true } },
      effects: [
        defineEffects<{ gone: string; temp: string; total: number }>(({ reaction }) => {
          reaction((d) => { d.total.$value = d.temp.$value.length })
        }),
      ],
    })
    form.setValue('temp', 'ccc')
    expect(form.dirty).toBe(false)
    form.batch((d) => { d.gone.$visible = false })
    form.setValue('gone', 'z')
    expect(form.dirty).toBe(true)
    form.setValue('gone', 'a')
    expect(form.dirty).toBe(false)
  })
})
