import { describe, expect, it } from 'vitest'
import { effects as visibleEffects } from '../docs-site/src/content/docs/tutorial/_files/04-state.solution'
import { effects as computedEffects } from '../docs-site/src/content/docs/tutorial/_files/06-reaction.solution'
import { effects as watchStarter } from '../docs-site/src/content/docs/tutorial/_files/08-watch'
import { effects as watchSolution } from '../docs-site/src/content/docs/tutorial/_files/08-watch.solution'
import { effects as arrayEffects } from '../docs-site/src/content/docs/tutorial/_files/07-array.solution'
import { schema } from '../docs-site/src/content/docs/tutorial/_files/09-rules.solution'
import { effects as declaredEffects } from '../docs-site/src/content/docs/tutorial/_files/10-declared.solution'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

// Reuse the actual editable tutorial sources, not a second copy of their logic.
describe('tutorial effects use the published FormEngine contract', () => {
  it('keeps the watch exercise distinct from its solution', () => {
    const initialValues = { province: '浙江', city: '杭州' }
    const starter = createEngine({ initialValues, effects: [watchStarter] })
    const solution = createEngine({ initialValues, effects: [watchSolution] })
    expect(starter.getValue('city')).toBe('')
    expect(solution.getValue('city')).toBe('杭州')
    solution.setValue('province', '广东')
    expect(solution.getValue('city')).toBe('')
    solution.setValue('city', '广州')
    expect(solution.getValue('city')).toBe('广州')
    solution.setValue('province', '')
    expect(solution.getValue('city')).toBe('')
    expect(solution.binding('city').disabled).toBe(true)
  })

  it('derives a read-pretty amount and still submits it', () => {
    const form = createEngine({ initialValues: { price: 10, qty: 2, amount: 0 }, effects: [computedEffects] })
    expect(form.getValue('amount')).toBe(20)
    expect(form.binding('amount').pattern).toBe('readPretty')
    form.setValue('price', 30)
    expect(form.getValue('amount')).toBe(60)
    expect(form.getSubmitValues()).toEqual({ price: 30, qty: 2, amount: 60 })
  })

  it('omits a computed amount only when virtual is declared', () => {
    const form = createEngine({
      initialValues: { price: 10, qty: 2, amount: 0 },
      effects: [computedEffects],
      fields: { amount: { display: 'virtual' } },
    })
    expect(form.binding('amount').pattern).toBe('readPretty')
    expect(form.getSubmitValues()).toEqual({ price: 10, qty: 2 })
  })

  it('calculates each array row after adding/removing and submits every derived total', () => {
    const form = createEngine({
      initialValues: { items: [{ id: 'row-1', name: '贴纸', price: 2, qty: 4, total: 0 }] },
      effects: [arrayEffects],
    })
    expect(form.getValue('items.0.total')).toBe(8)
    form.pushArray('items', { id: 'row-2', name: '卡片', price: 3, qty: 5, total: 0 })
    expect(form.getValue('items.1.total')).toBe(15)
    form.setValue('items.0.qty', 6)
    expect(form.getValue('items.0.total')).toBe(12)
    expect(form.getValue('items.1.total')).toBe(15)
    form.removeArray('items', 0)
    expect(form.getValue('items.0.id')).toBe('row-2')
    expect(form.getValue('items.0.total')).toBe(15)
    expect(form.getSubmitValues()).toEqual({ items: [{ id: 'row-2', name: '卡片', price: 3, qty: 5, total: 15 }] })
    const same = createEngine({
      initialValues: { items: [{ id: 'row-2', name: '新行', price: 0, qty: 1, total: 0 }] },
      effects: [arrayEffects],
    })
    expect(same.getValue('items.0.total')).toBe(0)
    // A reaction-written field is computed even when the derived value equals the initial one.
    expect(same.binding('items.0.total').pattern).toBe('readPretty')
    expect(same.getSubmitValues()).toEqual({ items: [{ id: 'row-2', name: '新行', price: 0, qty: 1, total: 0 }] })
    form.binding('items.0.price').onChange(undefined)
    expect(form.getValue('items.0.total')).toBe(0)
  })

  it('runs the actual Zod tutorial schema directly, without a resolver adapter', async () => {
    const form = createEngine<{ name: string; email: string; age: number | null }>({
      initialValues: { name: 'Ada', email: 'bad', age: 17 },
      validate: schema,
      // Same required flags as the tutorial answer. Empty is their job; the schema lets '' and null through.
      fields: {
        name: { required: true, rules: { minLength: 2, message: '至少 2 个字' } },
        email: { required: true },
        age: { required: true },
      },
    })
    const messages = (path: string) => form.errors.find((error) => error.path === path)?.messages
    await fieldErrorsOf(form.validate())
    expect(messages('email')).toEqual(['邮箱格式不对'])
    expect(messages('age')).toEqual(['需要年满 18'])
    form.setValue('email', '')
    form.setValue('age', null)
    await fieldErrorsOf(form.validate())
    expect(messages('email')).toEqual(['必填'])
    expect(messages('age')).toEqual(['必填'])
    expect(form.errors.flatMap((error) => error.messages).join('\n')).not.toMatch(/Invalid input|expected number/)
    form.setValue('age', 0)
    await fieldErrorsOf(form.validate())
    expect(messages('age')).toEqual(['需要年满 18'])
    form.setValue('name', '')
    await fieldErrorsOf(form.validate())
    expect(messages('name')).toEqual(['必填'])
    form.setValue('name', 'A')
    await fieldErrorsOf(form.validate())
    expect(messages('name')).toEqual(['至少 2 个字'])
    form.setValue('name', 'Ada')
    form.setValue('email', 'ada@example.com')
    form.setValue('age', 18)
    expect(await form.submit()).toEqual({ name: 'Ada', email: 'ada@example.com', age: 18 })
  })

  it('$visible = false drops the email from validation and submit, and keeps the value for later', async () => {
    const form = createEngine({
      initialValues: { contact: false, email: '' },
      effects: [visibleEffects],
      fields: { email: { required: true } },
    })
    expect(form.binding('email').display).toBe('none')
    expect(await form.submit()).toEqual({ contact: false })
    form.setValue('contact', true)
    await expect(form.submit()).rejects.toEqual(expect.any(Array))
    form.setValue('email', 'ada@example.com')
    expect(await form.submit()).toEqual({ contact: true, email: 'ada@example.com' })
  })

  it('validates the invitation rule even before its input is mounted', async () => {
    const form = createEngine({ initialValues: { more: false, nickname: '', code: '' }, effects: [declaredEffects] })
    expect(await fieldErrorsOf(form.validate())).toEqual([{ path: 'code', messages: ['邀请码必填'] }])
    form.setValue('code', 'INVITE')
    expect(await fieldErrorsOf(form.validate())).toEqual([])
  })
})
