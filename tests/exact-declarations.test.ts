import { describe, expect, it } from 'vitest'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

/** #8: exact declarations on template paths survive their row leaving and coming back. */
const row = () => ({ token: 'example-only', note: 'n', extra: 1 })

function make() {
  return createEngine({
    initialValues: { rows: [row()] },
    fields: {
      'rows.*.token': { required: true },
      'rows.0.token': { display: 'virtual' },
      'rows.0.note': { display: 'none' },
      'rows.0.extra': { display: 'virtual' },
    },
  })
}

describe('exact declarations on template paths (#8)', () => {
  it('setValue empty → refill keeps virtual / display none out of the payload', async () => {
    const form = make()
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    form.setValue('rows', [])
    form.setValue('rows', [row()])
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(await fieldErrorsOf(form.validate())).toEqual([])
  })

  it('removeArray → pushArray re-applies the exact declarations to the new row 0', async () => {
    const form = make()
    form.removeArray('rows', 0)
    expect(form.getSubmitValues()).toEqual({ rows: [] })
    form.pushArray('rows', row())
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(form.errors).toEqual([])
    const submitted = await form.submit()
    expect(submitted).toMatchObject({ rows: [{}] })
  })

  it('reset after emptying restores the submit shape without ghost errors', async () => {
    const form = make()
    form.removeArray('rows', 0)
    form.reset()
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    form.setValue('rows', [])
    form.reset()
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    expect(form.errors).toEqual([])
  })

  it('the template still validates rows the exact declaration does not name', async () => {
    const form = make()
    form.removeArray('rows', 0)
    form.pushArray('rows', row())
    form.pushArray('rows', { token: '', note: 'x', extra: 2 })
    expect(form.getSubmitValues()).toEqual({ rows: [{}, { token: '', note: 'x', extra: 2 }] })
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.map((error) => error.path)).toEqual(['rows.1.token'])
  })
})

/** Decision 2026-10-30: an exact-path declaration stays on its path when rows move. */
describe('exact declarations stay on their path on move / swap / insert', () => {
  const rows = () => [
    { id: 'a', token: 'A', note: 'na' },
    { id: 'b', token: 'B', note: 'nb' },
    { id: 'c', token: 'C', note: 'nc' },
  ]
  function make3() {
    return createEngine({
      initialValues: { rows: rows() },
      fields: {
        'rows.0.token': { display: 'virtual' },
        'rows.0.note': { display: 'none', title: 'First note' },
      },
    })
  }

  it('moveArray: the declaration stays at rows.0, the moved row loses it', () => {
    const form = make3()
    form.moveArray('rows', 0, 2)
    expect(form.getSubmitValues()).toEqual({
      rows: [{ id: 'b' }, { id: 'c', token: 'C', note: 'nc' }, { id: 'a', token: 'A', note: 'na' }],
    })
    expect(form.query('rows.0.note').$title).toBe('First note')
    expect(form.query('rows.2.note').$title).toBeUndefined()
    expect(form.query('rows.2.note').$display).toBe('visible')
  })

  it('swapArray: the declaration stays on rows.0', () => {
    const form = make3()
    form.swapArray('rows', 0, 1)
    expect(form.getSubmitValues()).toEqual({
      rows: [{ id: 'b' }, { id: 'a', token: 'A', note: 'na' }, { id: 'c', token: 'C', note: 'nc' }],
    })
  })

  it('insertArray at 0: the new row sits on the declared path', () => {
    const form = make3()
    form.insertArray('rows', 0, { id: 'z', token: 'Z', note: 'nz' })
    expect(form.getSubmitValues().rows[0]).toEqual({ id: 'z' })
    expect(form.getSubmitValues().rows[1]).toEqual({ id: 'a', token: 'A', note: 'na' })
  })

  it('exact rules stay on the path; the moved row keeps only the template rules', async () => {
    const form = createEngine({
      initialValues: { rows: [{ id: 'a', token: '' }, { id: 'b', token: '' }] },
      fields: { 'rows.0.token': { required: true } },
    })
    form.moveArray('rows', 0, 1)
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.map((error) => error.path)).toEqual(['rows.0.token'])
  })

  it('wildcard declarations still apply to every row after a move', () => {
    const form = createEngine({ initialValues: { rows: rows() }, fields: { 'rows.*.token': { display: 'virtual' } } })
    form.moveArray('rows', 0, 2)
    expect(form.getSubmitValues()).toEqual({ rows: [{ id: 'b', note: 'nb' }, { id: 'c', note: 'nc' }, { id: 'a', note: 'na' }] })
  })

  it('moveTree: a declaration on an exact node path stays there', () => {
    const form = createEngine({
      initialValues: { menus: [{ id: 'm1', name: 'one', children: [] }, { id: 'm2', name: 'two', children: [] }] },
      fields: { 'menus.0.name': { display: 'virtual' } },
    })
    form.registerTree('menus')
    form.moveTree('menus', [0], [1])
    expect(form.getSubmitValues()).toEqual({
      menus: [{ id: 'm2', children: [] }, { id: 'm1', name: 'one', children: [] }],
    })
  })
})
