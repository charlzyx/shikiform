import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

describe('declared fields and unmounted rules', () => {
  it('validates a declared field that was never mounted', async () => {
    const form = createEngine<{ name: string; code: string }>({
      initialValues: { name: 'ada', code: '' },
      fields: {
        name: { required: true },
        code: { required: true },
      },
    })
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.map((error) => error.path)).toEqual(['code'])
  })

  it('keeps registerField rules after a JSX rule is released', async () => {
    const form = createEngine<{ code: string }>({ initialValues: { code: 'ab' } })
    form.registerField('code', { required: true })
    form.mountJsxField('code', { rules: [{ minLength: 3, message: '太短' }] })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.messages).flat()).toContain('太短')
    form.releaseJsxField('code')
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    form.setValue('code', '')
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['code'])
  })

  it('drops JSX-only rules on release', async () => {
    const form = createEngine<{ note: string }>({ initialValues: { note: '' } })
    form.mountJsxField('note', { required: true })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['note'])
    form.releaseJsxField('note')
    expect(await fieldErrorsOf(form.validate())).toEqual([])
  })

  it('does not let JSX rules or unmount replace $rules', async () => {
    const form = createEngine<{ title: string }>({ initialValues: { title: 'abcd' } })
    form.batch((d) => {
      d.title.$rules = [{ minLength: 4, message: '至少四字' }]
    })
    form.mountJsxField('title', { rules: [{ maxLength: 1, message: '太长' }] })
    expect(await fieldErrorsOf(form.validate())).toEqual([])
    form.releaseJsxField('title')
    form.setValue('title', 'abc')
    expect((await fieldErrorsOf(form.validate())).map((error) => error.messages).flat()).toContain('至少四字')
  })

  it('applies an item template to every row, including ones that are not mounted', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }, { name: 'ada' }, { name: '' }] },
      fields: { 'rows.*.name': { required: true } },
    })
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.map((error) => error.path).sort()).toEqual(['rows.0.name', 'rows.2.name'])
  })

  it('gives a pushed row the item template', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.pushArray('rows', { name: '' })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['rows.0.name'])
  })

  it('lets an exact path and $rules win over the item template', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }, { name: 'abc' }] },
      fields: {
        'rows.*.name': { required: true, rules: [{ minLength: 4, message: '太短' }] },
        'rows.0.name': { required: false, rules: [] },
      },
      effects: [
        defineEffects<{ rows: { name: string }[] }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row, { index }) => {
              if (index === 1) row.name.$rules = [{ maxLength: 10, message: '太长' }]
            },
          )
        }),
      ],
    })
    expect(await fieldErrorsOf(form.validate())).toEqual([])
  })

  it('restores the item template when a JSX rule unmounts', async () => {
    const form = createEngine<{ rows: { qty: string }[] }>({
      initialValues: { rows: [{ qty: '' }, { qty: '' }] },
      fields: { 'rows.*.qty': { required: true } },
    })
    form.mountJsxField('rows.0.qty', { required: false, rules: [{ maxLength: 2, message: '太长' }] })
    form.setValue('rows.0.qty', 'abcd')
    const mounted = await fieldErrorsOf(form.validate())
    expect(mounted.find((error) => error.path === 'rows.0.qty')?.messages).toEqual(['太长'])
    expect(mounted.map((error) => error.path)).toContain('rows.1.qty')
    form.releaseJsxField('rows.0.qty')
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path)).toEqual(['rows.1.qty'])
    form.setValue('rows.0.qty', '')
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path).sort()).toEqual(['rows.0.qty', 'rows.1.qty'])
  })

  it('covers every row when reaction.each writes $rules', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }, { name: '' }, { name: 'ok' }] },
      effects: [
        defineEffects<{ rows: { name: string }[] }>(({ reaction }) => {
          reaction.each(
            (d) => d.rows,
            (row) => {
              row.name.$required = true
            },
          )
        }),
      ],
    })
    expect((await fieldErrorsOf(form.validate())).map((error) => error.path).sort()).toEqual(['rows.0.name', 'rows.1.name'])
  })

  it('still validates hidden declared fields and skips none, including descendants', async () => {
    const form = createEngine<{
      nick: string
      ghost: string
      box: { items: { name: string }[] }
    }>({
      initialValues: { nick: '', ghost: 'secret', box: { items: [{ name: '' }] } },
      fields: {
        nick: { required: true },
        ghost: { required: true },
        'box.items.*.name': { required: true },
      },
    })
    form.batch((d) => {
      d.nick.$visible = false
      d.ghost.$visible = false; d.ghost.$omit = true
      d.box.$visible = false; d.box.$omit = true
    })
    const errors = await fieldErrorsOf(form.validate())
    expect(errors.map((error) => error.path)).toEqual([])
    const submitted = form.getSubmitValues()
    expect(submitted.nick).toBe('')
    expect(submitted).not.toHaveProperty('ghost')
    expect(submitted.box).toBeUndefined()
  })
})
