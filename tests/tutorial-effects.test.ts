import { describe, expect, it } from 'vitest'
import { createForm } from 'shikiform'
import { effects as visibleEffects } from '../docs/tutorial/_files/03-visible.solution'
import { effects as computedEffects } from '../docs/tutorial/_files/06-reaction.solution'
import { effects as watchStarter } from '../docs/tutorial/_files/07-watch'
import { effects as watchSolution } from '../docs/tutorial/_files/07-watch.solution'
import { effects as arrayEffects } from '../docs/tutorial/_files/08-array.solution'
import { schema } from '../docs/tutorial/_files/09-validation.solution'
import { effects as declaredEffects } from '../docs/tutorial/_files/10-declared.solution'

// Reuse the actual editable tutorial sources, not a second copy of their logic.
describe('tutorial effects use the published FormEngine contract', () => {
  it('keeps the watch exercise distinct from its solution', () => {
    const initialValues = { province: '浙江', city: '杭州' }
    const starter = createForm({ initialValues, effects: [watchStarter] })
    const solution = createForm({ initialValues, effects: [watchSolution] })
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
    const form = createForm({ initialValues: { price: 10, qty: 2, amount: 0 }, effects: [computedEffects] })
    expect(form.getValue('amount')).toBe(20)
    expect(form.binding('amount').pattern).toBe('readPretty')
    form.setValue('price', 30)
    expect(form.getValue('amount')).toBe(60)
    expect(form.getSubmitValues()).toEqual({ price: 30, qty: 2, amount: 60 })
  })

  it('omits a computed amount only when virtual is declared', () => {
    const form = createForm({
      initialValues: { price: 10, qty: 2, amount: 0 },
      effects: [computedEffects],
      fields: { amount: { virtual: true } },
    })
    expect(form.binding('amount').pattern).toBe('readPretty')
    expect(form.getSubmitValues()).toEqual({ price: 10, qty: 2 })
  })

  it('calculates each array row after adding/removing and submits every derived total', () => {
    const form = createForm({
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
    const same = createForm({
      initialValues: { items: [{ id: 'row-2', name: '新行', price: 0, qty: 1, total: 0 }] },
      effects: [arrayEffects],
    })
    expect(same.getValue('items.0.total')).toBe(0)
    // An equal reaction write returns before `computed` is set, so readPretty is unchanged.
    expect(same.binding('items.0.total').pattern).toBe('editable')
    expect(same.getSubmitValues()).toEqual({ items: [{ id: 'row-2', name: '新行', price: 0, qty: 1, total: 0 }] })
    form.binding('items.0.price').onChange(undefined)
    expect(form.getValue('items.0.total')).toBe(0)
  })

  it('runs the actual Zod tutorial schema directly, without a resolver adapter', async () => {
    const form = createForm({ initialValues: { name: 'Ada', email: 'bad', age: 17 }, validate: schema })
    expect(await form.validate()).toEqual(expect.arrayContaining([
      { path: 'email', messages: ['邮箱格式不对'] },
      { path: 'age', messages: ['需要年满 18'] },
    ]))
    form.setValue('email', 'ada@example.com')
    form.setValue('age', 18)
    expect(await form.submit()).toEqual({ ok: true, values: { name: 'Ada', email: 'ada@example.com', age: 18 } })
  })

  it('$visible = false drops the email from validation and submit, and keeps the value for later', async () => {
    const form = createForm({
      initialValues: { contact: false, email: '' },
      effects: [visibleEffects],
      fields: { email: { required: true } },
    })
    expect(form.binding('email').display).toBe('none')
    expect(await form.submit()).toEqual({ ok: true, values: { contact: false } })
    form.setValue('contact', true)
    expect((await form.submit()).ok).toBe(false)
    form.setValue('email', 'ada@example.com')
    expect(await form.submit()).toEqual({ ok: true, values: { contact: true, email: 'ada@example.com' } })
  })

  it('validates the invitation rule even before its input is mounted', async () => {
    const form = createForm({ initialValues: { more: false, nickname: '', code: '' }, effects: [declaredEffects] })
    expect(await form.validate()).toEqual([{ path: 'code', messages: ['邀请码必填'] }])
    form.setValue('code', 'INVITE')
    expect(await form.validate()).toEqual([])
  })
})
