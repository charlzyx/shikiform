import { describe, expect, it } from 'vitest'
import { createForm } from '../src/core'

/** #8: exact declarations on template paths survive their row leaving and coming back. */
const row = () => ({ token: 'example-only', note: 'n', extra: 1 })

function make() {
  return createForm({
    initialValues: { rows: [row()] },
    fields: {
      'rows.*.token': { required: true },
      'rows.0.token': { virtual: true },
      'rows.0.note': { display: 'none' },
      'rows.0.extra': { virtual: true },
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
    expect(await form.validate()).toEqual([])
  })

  it('removeArray → pushArray re-applies the exact declarations to the new row 0', async () => {
    const form = make()
    form.removeArray('rows', 0)
    expect(form.getSubmitValues()).toEqual({ rows: [] })
    form.pushArray('rows', row())
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(form.errors).toEqual([])
    const submitted = await form.submit()
    expect(submitted).toMatchObject({ ok: true, values: { rows: [{}] } })
  })

  it('reset after emptying restores the submit shape without ghost errors', async () => {
    const form = make()
    form.removeArray('rows', 0)
    form.reset()
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    form.setValue('rows', [])
    form.reset()
    expect(form.getSubmitValues()).toEqual({ rows: [{}] })
    expect(await form.validate()).toEqual([])
    expect(form.errors).toEqual([])
  })

  it('the template still validates rows the exact declaration does not name', async () => {
    const form = make()
    form.removeArray('rows', 0)
    form.pushArray('rows', row())
    form.pushArray('rows', { token: '', note: 'x', extra: 2 })
    expect(form.getSubmitValues()).toEqual({ rows: [{}, { token: '', note: 'x', extra: 2 }] })
    const errors = await form.validate()
    expect(errors.map((error) => error.path)).toEqual(['rows.1.token'])
  })
})
