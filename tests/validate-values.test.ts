import { describe, expect, it } from 'vitest'
import { createForm } from '@shikiform/core'

type Values = {
  name: string
  secret: string
  user: { city: string; token: string; address: { zip: string; code: string } }
  rows: { name: string; qty: number; secret: string }[]
}

const initial: Values = {
  name: 'Ada',
  secret: 'hide',
  user: { city: 'sh', token: 'tok', address: { zip: '200000', code: 'c' } },
  rows: [
    { name: 'a', qty: 1, secret: 'x' },
    { name: 'b', qty: 2, secret: 'y' },
  ],
}

function form() {
  return createForm({
    initialValues: initial,
    fields: {
      secret: { omit: true },
      'user.token': { omit: true },
      'user.address.code': { omit: true },
      'rows.*.secret': { omit: true },
    },
  })
}

describe('validate resolves submit-shaped values', () => {
  it('validate() resolves getSubmitValues(), with omit removed', async () => {
    const engine = form()
    const values = await engine.validate()
    expect(values).toEqual(engine.getSubmitValues())
    expect(values).toEqual({
      name: 'Ada',
      user: { city: 'sh', address: { zip: '200000' } },
      rows: [
        { name: 'a', qty: 1 },
        { name: 'b', qty: 2 },
      ],
    })
    expect(values).not.toBe(engine.values)
    expect(values).not.toBe(engine.getSubmitValues())
    expect(values.user).not.toBe(engine.values.user)
    expect(values.rows).not.toBe(engine.values.rows)
    expect(values.rows[0]).not.toBe(engine.values.rows[0])
    values.user.city = 'changed'
    values.rows[0]!.name = 'changed'
    expect(engine.getValue('user.city')).toBe('sh')
    expect(engine.getValue('rows.0.name')).toBe('a')
  })

  it('validate(path) resolves that value, strips omitted descendants, and keeps an omitted path', async () => {
    const engine = form()
    const user = await engine.validate('user')
    expect(user).toEqual({ city: 'sh', address: { zip: '200000' } })
    expect(user).not.toBe(engine.getValue('user'))
    expect(user.address).not.toBe(engine.getValue('user.address'))
    user.city = 'changed'
    user.address.zip = 'changed'
    expect(engine.getValue('user.city')).toBe('sh')
    expect(engine.getValue('user.address.zip')).toBe('200000')

    expect(await engine.validate('name')).toBe('Ada')
    expect(await engine.validate('user.city')).toBe('sh')
    expect(await engine.validate('secret')).toBe('hide')
    expect(await engine.validate('user.token')).toBe('tok')
    expect(await engine.validate('rows.0')).toEqual({ name: 'a', qty: 1 })
    expect(await engine.validate('rows')).toEqual([
      { name: 'a', qty: 1 },
      { name: 'b', qty: 2 },
    ])
    const row = await engine.validate('rows.0')
    expect(row).not.toBe(engine.getValue('rows.0'))
  })

  it('validate([paths]) resolves only those paths, nested, cloned, with omit applied', async () => {
    const engine = form()
    const picked = await engine.validate(['name', 'user.city', 'rows.0.name'])
    expect(picked).toEqual({ name: 'Ada', user: { city: 'sh' }, rows: [{ name: 'a' }] })
    expect(picked.user).not.toBe(engine.getValue('user'))
    picked.user.city = 'changed'
    expect(engine.getValue('user.city')).toBe('sh')

    expect(await engine.validate(['user'])).toEqual({ user: { city: 'sh', address: { zip: '200000' } } })
    expect(await engine.validate(['secret', 'user.token'])).toEqual({ secret: 'hide', user: { token: 'tok' } })
    expect(await engine.validate(['rows.1.name'])).toEqual({ rows: [undefined, { name: 'b' }] })
    expect(await engine.validate(['rows.0.name', 'rows.1.secret'])).toEqual({
      rows: [{ name: 'a' }, { secret: 'y' }],
    })
    expect(await engine.validate([])).toEqual({})
  })

  it('an omitted path keeps descendants that are omitted only by inheritance', async () => {
    const engine = createForm({
      initialValues: { title: 't', editor: { name: '墨水', price: 8, draft: 'x' } },
      fields: { editor: { omit: true }, 'editor.draft': { omit: true } },
    })
    expect(await engine.validate()).toEqual({ title: 't' })
    expect(await engine.validate('editor')).toEqual({ name: '墨水', price: 8 })
    expect(await engine.validate(['editor.name', 'title'])).toEqual({ editor: { name: '墨水' }, title: 't' })
    const editor = await engine.validate('editor')
    expect(editor).not.toBe(engine.getValue('editor'))
  })

  it('a missing path resolves undefined and does not invent a live object', async () => {
    const engine = createForm<Record<string, string>>({ initialValues: { name: 'Ada' } })
    expect(await engine.validate('gone')).toBeUndefined()
    expect(await engine.validate(['gone', 'name'])).toEqual({ gone: undefined, name: 'Ada' })
  })

  it('rejection is unchanged: FieldError[] for rules, the original throw for a form-level validate', async () => {
    const engine = createForm({
      initialValues: { name: '', city: '' },
      fields: { name: { required: true }, city: { required: true } },
    })
    const both = [
      { path: 'name', messages: ['必填'] },
      { path: 'city', messages: ['必填'] },
    ]
    await expect(engine.validate()).rejects.toEqual(both)
    await expect(engine.validate(['name', 'city'])).rejects.toEqual(both)
    await expect(engine.validate('city')).rejects.toEqual([{ path: 'city', messages: ['必填'] }])
    engine.setValue('name', 'Ada')
    expect(await engine.validate('name')).toBe('Ada')
    expect(await engine.validate(['name'])).toEqual({ name: 'Ada' })
    expect(await engine.validate([])).toEqual({})

    const boom = new Error('schema down')
    const broken = createForm({
      initialValues: { name: 'Ada' },
      validate: () => { throw boom },
    })
    await expect(broken.validate()).rejects.toBe(boom)
    await expect(broken.validate('name')).rejects.toBe(boom)
    await expect(broken.validate(['name'])).rejects.toBe(boom)
    await expect(broken.validate([])).rejects.toBe(boom)
  })
})
