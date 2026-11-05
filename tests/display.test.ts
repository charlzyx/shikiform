import { describe, expect, it } from 'vitest'
import { defineEffects } from '../src/core'
import { createEngine } from '../src/core/engine/create'

describe('display and pattern', () => {
  it('keeps hidden values and drops none values', async () => {
    const form = createEngine<{ a: string; b: string; c: string }>({
      initialValues: { a: 'keep', b: 'drop', c: '' },
    })
    form.batch((d) => {
      d.a.$display = 'hidden'
      d.a.$required = true
      d.b.$display = 'none'
      d.b.$required = true
      d.c.$required = true
    })
    const errors = await form.validate()
    expect(errors.map((error) => error.path)).toContain('c')
    expect(errors.map((error) => error.path)).not.toContain('b')
    expect(errors.map((error) => error.path)).not.toContain('a')
    const submitted = form.getSubmitValues()
    expect(submitted.a).toBe('keep')
    expect(submitted).not.toHaveProperty('b')
    expect(form.binding('a').display).toBe('hidden')
  })

  it('treats $visible false as none (Formily visible): not validated, not submitted, value kept', async () => {
    const form = createEngine<{ a: string; b: string }>({ initialValues: { a: 'x', b: '' } })
    form.batch((d) => {
      d.a.$visible = false
      d.b.$visible = false
      d.b.$required = true
    })
    expect(form.binding('a').display).toBe('none')
    expect(form.getSubmitValues()).toEqual({})
    expect(await form.submit()).toEqual({ ok: true, values: {} })
    form.batch((d) => {
      d.a.$visible = true
      d.b.$visible = true
    })
    expect(form.binding('a').display).toBe('visible')
    expect(form.getValue('a')).toBe('x')
    expect((await form.submit()).ok).toBe(false)
  })

  it('treats $hidden true as hidden (Formily hidden): still validated and submitted', async () => {
    const form = createEngine<{ a: string; b: string }>({ initialValues: { a: 'x', b: '' } })
    form.batch((d) => {
      d.a.$hidden = true
      d.b.$hidden = true
      d.b.$required = true
    })
    expect(form.binding('a').display).toBe('hidden')
    expect(form.getSubmitValues()).toEqual({ a: 'x', b: '' })
    expect(await form.submit()).toMatchObject({ ok: false, errors: [{ path: 'b' }] })
    form.batch((d) => {
      d.b.$hidden = false
    })
    expect(form.binding('b').display).toBe('visible')
  })

  it('reads $visible / $hidden from the effective (inherited) display', () => {
    const form = createEngine<{ box: { child: string }; other: string }>({ initialValues: { box: { child: 'v' }, other: '' } })
    const seen: unknown[] = []
    form.batch((d) => {
      d.box.$hidden = true
    })
    form.batch((d) => {
      seen.push(d.box.child.$visible, d.box.child.$hidden, d.box.child.$display)
    })
    form.batch((d) => {
      d.box.$visible = false
    })
    form.batch((d) => {
      seen.push(d.box.child.$visible, d.box.child.$hidden, d.box.child.$display)
    })
    expect(seen).toEqual([false, true, 'hidden', false, false, 'none'])
  })

  it('issue #31: a conditionally visible required field neither blocks submit nor leaks its value', async () => {
    type V = { kind: 'person' | 'company'; name: string; taxId: string }
    const form = createEngine<V>({
      initialValues: { kind: 'company', name: 'x', taxId: '' },
      effects: [
        defineEffects<V>(({ reaction }) => {
          reaction((d) => {
            d.taxId.$visible = d.kind.$value === 'company'
            d.taxId.$required = true
          })
        }),
      ],
    })
    expect((await form.submit()).ok).toBe(false)
    form.setValue('taxId', 'T-123')
    form.setValue('kind', 'person')
    expect(await form.submit()).toEqual({ ok: true, values: { kind: 'person', name: 'x' } })
    form.setValue('kind', 'company')
    expect(await form.submit()).toEqual({ ok: true, values: { kind: 'company', name: 'x', taxId: 'T-123' } })
  })

  it('inherits pattern and restores it when cleared', () => {
    const form = createEngine<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
    form.batch((d) => {
      d.box.$pattern = 'readOnly'
    })
    expect(form.binding('box.child').pattern).toBe('readOnly')
    form.batch((d) => {
      d.box.child.$pattern = 'editable'
    })
    expect(form.binding('box.child').pattern).toBe('editable')
    form.batch((d) => {
      d.box.child.$pattern = undefined
    })
    expect(form.binding('box.child').pattern).toBe('readOnly')
  })
})
