import { describe, expect, it } from 'vitest'
import { cloneSkus, DIMS, paintGroupColor, skuPickerEffects, type Dim, type SkuSelection } from '../playground/skus'
import { createEngine } from '../packages/core/src/engine/create'

function picker() {
  return createEngine<SkuSelection>({
    initialValues: { qty: 1, skuId: '', priceText: '—', stock: null },
    effects: [skuPickerEffects],
  })
}

function options(form: ReturnType<typeof picker>, dim: 'color' | 'storage' | 'edition') {
  return form.query(dim).$enum as { label: string; value: string; disabled?: boolean }[]
}

describe('sku picker', () => {
  it('resolves one sku in any order and the reverse order', () => {
    const forward = picker()
    forward.setValue('storage', '128G')
    forward.setValue('color', '黑色')
    forward.setValue('edition', '标准版')
    expect(forward.getValue('skuId')).toBe('B-128-STD')
    expect(forward.getValue('priceText')).toBe('¥999')
    expect(forward.getValue('stock')).toBe(12)

    const reverse = picker()
    reverse.setValue('edition', 'Pro')
    reverse.setValue('storage', '256G')
    reverse.setValue('color', '白色')
    expect(reverse.getValue('skuId')).toBe('W-256-PRO')
    expect(reverse.getValue('priceText')).toBe('¥1499')
    expect(reverse.getValue('stock')).toBe(8)
  })

  it('clears a dimension that conflicts with the one just edited', () => {
    const form = picker()
    form.setValue('color', '黑色')
    form.setValue('storage', '128G')
    form.setValue('edition', '标准版')
    form.setValue('color', '红色')
    expect(form.getValue('color')).toBe('红色')
    expect(form.getValue('storage')).toBeUndefined()
    expect(form.getValue('edition')).toBeUndefined()
    expect(form.getValue('skuId')).toBe('R-512-MAX')
    expect(form.getValue('priceText')).toBe('¥1999')
    expect(form.getValue('stock')).toBe(5)
  })

  it.each([
    ['color', '红色', ['红色', undefined, undefined], 'R-512-MAX'],
    ['storage', '256G', ['黑色', '256G', undefined], 'B-256-PRO'],
    ['edition', 'Pro', ['黑色', undefined, 'Pro'], 'B-256-PRO'],
  ] as const)('keeps %s switchable after a complete selection', (dim, value, selection, skuId) => {
    const form = picker()
    form.setValue('storage', '128G')
    form.setValue('color', '黑色')
    form.setValue('edition', '标准版')

    // These are the actual rendered radio choices, not a write that bypasses the UI.
    expect(options(form, dim).find((option) => option.value === value)).toMatchObject({ disabled: false })
    form.setValue(dim, value)
    expect(DIMS.map((key) => form.getValue(key))).toEqual(selection)
    expect(form.getValue('skuId')).toBe(skuId)
  })

  it('can switch away and back while keeping contextually sold-out choices disabled', () => {
    const form = picker()
    const choose = (dim: Dim, value: string) => {
      expect(options(form, dim).find((option) => option.value === value)).toMatchObject({ disabled: false })
      form.setValue(dim, value)
    }
    choose('color', '黑色')
    choose('storage', '128G')
    choose('edition', '标准版')
    // White has other in-stock SKUs, but white/128G/standard is sold out.
    expect(options(form, 'color').find((option) => option.value === '白色')?.disabled).toBe(true)
    choose('color', '红色')
    choose('storage', '512G')
    choose('edition', 'Max')
    choose('color', '黑色')
    expect(DIMS.map((key) => form.getValue(key))).toEqual(['黑色', undefined, undefined])
    expect(form.getValue('priceText')).toBe('¥999 ~ ¥1499')
    choose('edition', 'Pro')
    choose('storage', '256G')
    expect(form.getValue('skuId')).toBe('B-256-PRO')
    expect(form.getValue('stock')).toBe(3)
  })

  it('disables a value whose matching rows are all out of stock and shows a price range', () => {
    const form = picker()
    form.setValue('color', '黑色')
    expect(form.getValue('skuId')).toBe('')
    expect(form.getValue('priceText')).toBe('¥999 ~ ¥1499')
    expect(form.getValue('stock')).toBeNull()

    form.setValue('color', '白色')
    expect(options(form, 'edition').find((option) => option.value === '标准版')?.disabled).toBe(true)
    expect(options(form, 'storage').find((option) => option.value === '128G')?.disabled).toBe(true)
    expect(options(form, 'edition').find((option) => option.value === 'Pro')?.disabled).toBe(false)
  })

  it('caps quantity at the matched stock', async () => {
    const form = picker()
    form.setValue('color', '黑色')
    form.setValue('storage', '256G')
    form.setValue('edition', 'Pro')
    form.setValue('qty', 9)
    const errors = await form.validate('qty')
    expect(errors.some((error) => error.messages.some((message) => message.includes('库存仅剩 3')))).toBe(true)
  })

  it('paints a color group without moving price off the sku', () => {
    const rows = cloneSkus()
    rows[0]!.price = 888
    const next = paintGroupColor(rows, '黑色', '曜石')
    expect(next.filter((row) => row.color === '曜石')).toHaveLength(2)
    expect(next.find((row) => row.skuId === 'B-128-STD')).toMatchObject({ price: 888, stock: 12 })
    expect(next.find((row) => row.skuId === 'W-256-PRO')?.color).toBe('白色')
    expect(next.find((row) => row.skuId === 'B-128-STD')?.skuId).toBe('B-128-STD')
  })
})
