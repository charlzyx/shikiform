import { describe, expect, it } from 'vitest'
import { createForm } from '../src/core'

describe('display and pattern', () => {
  it('keeps hidden values and drops none values', async () => {
    const form = createForm<{ a: string; b: string; c: string }>({
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

  it('treats $visible false as hidden, not none', () => {
    const form = createForm<{ a: string }>({ initialValues: { a: 'x' } })
    form.batch((d) => {
      d.a.$visible = false
    })
    expect(form.binding('a').display).toBe('hidden')
    expect(form.getSubmitValues().a).toBe('x')
  })

  it('inherits pattern and restores it when cleared', () => {
    const form = createForm<{ box: { child: string } }>({ initialValues: { box: { child: 'v' } } })
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
