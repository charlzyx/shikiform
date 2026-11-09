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

  it('display virtual renders in the binding, validates, omits the subtree, and ignores dirty', async () => {
    const form = createEngine<{ confirm: string; box: { email: string; keep: string }; note: string }>({
      initialValues: { confirm: '', box: { email: '', keep: 'k' }, note: 'n' },
      fields: { confirm: { display: 'virtual', required: true } },
    })
    expect(form.binding('confirm').display).toBe('virtual')
    expect(form.dirty).toBe(false)
    form.setValue('confirm', 'x')
    expect(form.dirty).toBe(false)
    form.setValue('note', 'changed')
    expect(form.dirty).toBe(true)
    form.setValue('note', 'n')
    expect(form.getSubmitValues()).toEqual({ box: { email: '', keep: 'k' }, note: 'n' })
    form.setValue('confirm', '')
    expect((await form.submit()).ok).toBe(false)

    form.batch((d) => { d.box.$display = 'virtual' })
    expect(form.binding('box.email').display).toBe('virtual')
    form.batch((d) => {
      expect(d.box.email.$display).toBe('virtual')
      expect(d.box.email.$visible).toBe(false)
      expect(d.box.email.$hidden).toBe(false)
    })
    expect(form.getSubmitValues()).toEqual({ note: 'n' })
    form.setValue('box', { email: 'a@b.co', keep: 'other' })
    expect(form.dirty).toBe(false)
  })

  it('stacks hidden and virtual, and none wins over both', async () => {
    const form = createEngine<{ box: { secret: string; shown: string }; other: string }>({
      initialValues: { box: { secret: '', shown: '' }, other: 'o' },
      fields: {
        'box.secret': { display: 'virtual', required: true },
        'box.shown': { required: true },
      },
    })
    form.batch((d) => { d.box.$display = 'hidden' })
    expect(form.binding('box.secret').display).toBe('hidden')
    expect(form.binding('box.shown').display).toBe('hidden')
    form.batch((d) => {
      expect(d.box.secret.$display).toBe('hidden')
      expect(d.box.secret.$hidden).toBe(true)
      expect(d.box.secret.$visible).toBe(false)
    })
    // Hidden parent + virtual child: still validated, not submitted. The sibling hidden field is submitted.
    expect((await form.validate()).map((error) => error.path).sort()).toEqual(['box.secret', 'box.shown'])
    expect(form.getSubmitValues()).toEqual({ box: { shown: '' }, other: 'o' })

    form.batch((d) => { d.box.$display = 'none' })
    expect(form.binding('box.secret').display).toBe('none')
    expect(await form.validate()).toEqual([])
    expect(form.getSubmitValues()).toEqual({ other: 'o' })
    expect(form.getValue('box.secret')).toBe('')
  })

  it('a virtual parent hides submit for a hidden child, which still validates', async () => {
    const form = createEngine<{ box: { name: string } }>({
      initialValues: { box: { name: '' } },
      fields: { box: { display: 'virtual' }, 'box.name': { display: 'hidden', required: true } },
    })
    // hidden outranks virtual on the read, but the parent's virtual still omits the subtree.
    expect(form.binding('box.name').display).toBe('hidden')
    expect((await form.validate()).map((error) => error.path)).toEqual(['box.name'])
    expect(form.getSubmitValues()).toEqual({})
  })

  it('toggles $display = virtual from a reaction', async () => {
    type V = { need: boolean; confirm: string }
    const form = createEngine<V>({
      initialValues: { need: true, confirm: '' },
      fields: { confirm: { required: true } },
      effects: [
        defineEffects<V>(({ reaction }) => {
          reaction((d) => { d.confirm.$display = d.need.$value ? 'virtual' : 'visible' })
        }),
      ],
    })
    expect(form.binding('confirm').display).toBe('virtual')
    expect((await form.submit()).ok).toBe(false)
    form.setValue('need', false)
    expect(form.binding('confirm').display).toBe('visible')
    expect(form.getSubmitValues()).toEqual({ need: false, confirm: '' })
    form.setValue('need', true)
    expect(form.getSubmitValues()).toEqual({ need: true })
  })

  it('$visible = true restores the declaration instead of forcing visible', () => {
    const form = createEngine<{ email: string; plain: string }>({
      initialValues: { email: 'a@b.co', plain: 'p' },
      fields: { email: { display: 'hidden' } },
    })
    form.batch((d) => { d.email.$visible = false })
    expect(form.binding('email').display).toBe('none')
    form.batch((d) => { d.email.$visible = true })
    expect(form.binding('email').display).toBe('hidden')
    expect(form.getSubmitValues()).toEqual({ email: 'a@b.co', plain: 'p' })
    // No reaction overlay: true does not override a declared hidden.
    form.batch((d) => { d.email.$visible = true })
    expect(form.binding('email').display).toBe('hidden')
  })

  it('$hidden = false clears hidden only', () => {
    const none = createEngine<{ a: string }>({ initialValues: { a: 'x' } })
    none.batch((d) => { d.a.$display = 'none' })
    none.batch((d) => { d.a.$hidden = false })
    expect(none.binding('a').display).toBe('none')

    const virtual = createEngine<{ a: string }>({ initialValues: { a: 'x' }, fields: { a: { display: 'virtual' } } })
    virtual.batch((d) => { d.a.$hidden = false })
    expect(virtual.binding('a').display).toBe('virtual')
    virtual.batch((d) => { d.a.$hidden = true })
    expect(virtual.binding('a').display).toBe('hidden')
    expect(virtual.getSubmitValues()).toEqual({ a: 'x' })
    virtual.batch((d) => { d.a.$hidden = false })
    expect(virtual.binding('a').display).toBe('virtual')
    expect(virtual.getSubmitValues()).toEqual({})

    const declared = createEngine<{ a: string }>({ initialValues: { a: 'x' }, fields: { a: { display: 'hidden' } } })
    declared.batch((d) => { d.a.$hidden = false })
    expect(declared.binding('a').display).toBe('visible')
  })

  it('none still counts as dirty; virtual does not', () => {
    const form = createEngine<{ gone: string; temp: string }>({
      initialValues: { gone: 'a', temp: 'b' },
      fields: { gone: { display: 'none' }, temp: { display: 'virtual' } },
    })
    form.setValue('temp', 'c')
    expect(form.dirty).toBe(false)
    form.setValue('gone', 'z')
    expect(form.dirty).toBe(true)
    form.setValue('gone', 'a')
    expect(form.dirty).toBe(false)
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
