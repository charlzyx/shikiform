// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, Form, createForm, defineEffects } from '../src'
import { FormItem, Input } from '../src/antd'
import { createEngine } from '../src/core/engine/create'

const weak = (value: unknown) => (/\d/.test(String(value)) && /[a-z]/i.test(String(value)) ? null : '建议同时包含字母和数字')

afterEach(cleanup)

describe("Rule.level: 'warning'", () => {
  it('reports to $warnings / binding.warnings, not errors, and never blocks submit', async () => {
    const form = createEngine({
      initialValues: { password: '123456' },
      fields: { password: { rules: [{ minLength: 6 }, { validator: weak, level: 'warning' }] } },
    })
    await form.validate()
    expect(form.errors).toEqual([])
    expect(form.binding('password').warnings).toEqual(['建议同时包含字母和数字'])
    let seen: string[] = []
    form.batch((d) => { seen = d.password.$warnings })
    expect(seen).toEqual(['建议同时包含字母和数字'])
    expect(form.canSubmit).toBe(true)
    expect(await form.submit()).toEqual({ ok: true, values: { password: '123456' } })
    form.setValue('password', 'abc123')
    await form.validate()
    expect(form.binding('password').warnings).toEqual([])
  })

  it('a warning-level built-in check and an error-level rule on the same field stay separate', async () => {
    const form = createEngine({
      initialValues: { name: 'ab' },
      fields: { name: { rules: [{ minLength: 5, level: 'warning', message: '最好 5 个字符以上' }, { maxLength: 1, message: '太长' }] } },
    })
    const result = await form.submit()
    expect(result.ok).toBe(false)
    expect(form.binding('name').errors).toEqual(['太长'])
    expect(form.binding('name').warnings).toEqual(['最好 5 个字符以上'])
  })

  it('async warning validators resolve into warnings; a rejection is a warning too', async () => {
    const form = createEngine({
      initialValues: { a: 'x', b: 'y' },
      fields: {
        a: { rules: { validator: async () => '慢一点的提醒', level: 'warning' } },
        b: { rules: { validator: async () => { throw new Error('net') }, level: 'warning' } },
      },
    })
    const result = await form.submit()
    expect(result.ok).toBe(true)
    expect(form.binding('a').warnings).toEqual(['慢一点的提醒'])
    expect(form.binding('b').warnings).toEqual(['net'])
  })

  it('reset and clearErrors drop warnings; display none clears them', async () => {
    const form = createEngine({ initialValues: { a: '1' }, fields: { a: { rules: { validator: weak, level: 'warning' } } } })
    await form.validate()
    expect(form.binding('a').warnings).toHaveLength(1)
    form.reset()
    expect(form.binding('a').warnings).toEqual([])
    await form.validate()
    form.clearErrors()
    expect(form.binding('a').warnings).toEqual([])
    await form.validate()
    form.batch((d) => { d.a.$visible = false })
    await form.validate()
    expect(form.binding('a').warnings).toEqual([])
  })

  it('a reaction reading $warnings re-runs when they change', async () => {
    const form = createEngine({
      initialValues: { a: '1', hint: '' },
      fields: { a: { rules: { validator: weak, level: 'warning' } } },
      effects: [defineEffects<{ a: string; hint: string }>(({ reaction }) => {
        reaction((d) => { d.hint.$value = d.a.$warnings.join(',') })
      })],
    })
    await form.validate()
    expect(form.getValue('hint')).toBe('建议同时包含字母和数字')
    form.setValue('a', 'a1')
    await form.validate()
    expect(form.getValue('hint')).toBe('')
  })

  it('FormItem shows the warning with antd warning status', async () => {
    const form = createForm({ initialValues: { password: '123' } })
    const view = render(
      <Form form={form}>
        <Field name="password" title="密码" rules={{ validator: weak, level: 'warning' }} decorator={[FormItem]} component={[Input]} />
      </Form>,
    )
    await act(async () => { await form.validate() })
    expect(view.container.querySelector('.ant-form-item-has-warning')).not.toBeNull()
    expect(view.container.textContent).toContain('建议同时包含字母和数字')
  })
})
