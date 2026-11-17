import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

const atLeastOne = (value: unknown) => (Array.isArray(value) && value.length ? null : '至少一行')

describe('array path recheck after a row change', () => {
  it('leaves the array quiet until validate, then clears only that path when push fixes it', async () => {
    const form = createEngine<{ rows: { name: string }[]; note: string }>({
      initialValues: { rows: [{ name: '' }], note: '' },
      fields: {
        rows: { rules: { validator: atLeastOne } },
        'rows.*.name': { required: true },
        note: { required: true },
      },
    })
    form.pushArray('rows', { name: 'new' })
    expect(form.binding('rows').errors).toEqual([])
    expect(form.binding('rows.0.name').errors).toEqual([])

    await fieldErrorsOf(form.validate())
    expect(form.binding('rows').errors).toEqual([])
    expect(form.binding('rows.0.name').errors).toEqual(['必填'])
    expect(form.binding('rows.1.name').errors).toEqual([])
    expect(form.binding('note').errors).toEqual(['必填'])

    form.removeArray('rows', 1)
    form.removeArray('rows', 0)
    await fieldErrorsOf(form.validate())
    expect(form.binding('rows').errors).toEqual(['至少一行'])
    expect(form.binding('note').errors).toEqual(['必填'])

    form.pushArray('rows', { name: '' })
    expect(form.binding('rows').errors).toEqual([])
    expect(form.binding('rows.0.name').errors).toEqual([])
    expect(form.binding('note').errors).toEqual(['必填'])

    form.removeArray('rows', 0)
    expect(form.binding('rows').errors).toEqual([])
    expect(form.binding('note').errors).toEqual(['必填'])
  })

  it('drops a server error on the array when a row is pushed, and keeps a sibling', () => {
    const form = createEngine<{ rows: { name: string }[]; note: string }>({
      initialValues: { rows: [], note: '' },
    })
    form.setErrors({ rows: '服务器拒绝', note: '备注不行' })
    expect(form.binding('rows').errors).toEqual(['服务器拒绝'])
    form.pushArray('rows', { name: 'a' })
    expect(form.binding('rows').errors).toEqual([])
    expect(form.binding('note').errors).toEqual(['备注不行'])
  })

  it('rechecks a schema on the array path without validating the new row', async () => {
    const form = createEngine<{ tags: string[] }>({
      initialValues: { tags: [] },
      fields: { tags: { rules: z.array(z.string()).min(1, '至少一个') } },
    })
    await fieldErrorsOf(form.validate())
    expect(form.binding('tags').errors).toEqual(['至少一个'])
    form.pushArray('tags', 'a')
    await Promise.resolve()
    await Promise.resolve()
    expect(form.binding('tags').errors).toEqual([])
  })

  it('keeps a nested array error on the row that moved', async () => {
    const form = createEngine<{ members: { phones: { no: string }[] }[] }>({
      initialValues: { members: [{ phones: [] }, { phones: [{ no: '1' }] }] },
      fields: {
        'members.*.phones': { rules: { validator: atLeastOne } },
      },
    })
    await fieldErrorsOf(form.validate())
    expect(form.binding('members.0.phones').errors).toEqual(['至少一行'])
    expect(form.binding('members.1.phones').errors).toEqual([])
    form.moveArray('members', 0, 1)
    expect(form.binding('members.0.phones').errors).toEqual([])
    expect(form.binding('members.1.phones').errors).toEqual(['至少一行'])
  })
})
