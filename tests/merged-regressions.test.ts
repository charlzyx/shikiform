import { describe, expect, it } from 'vitest'
import { newProduct, newSupplier, supplierRows, type Supplier } from '../playground/merged-model'
import { createEngine } from '../src/core/engine/create'

const suppliers = (): Supplier[] => [
  { id: 'sA', name: 'A', level: 'C', products: [
    { id: 'p1', name: '一', price: 10, active: true },
    { id: 'p2', name: '二', price: 20, active: false },
  ] },
  { id: 'sB', name: 'B', level: 'A', products: [{ id: 'p3', name: '三', price: 5, active: true }] },
]

describe('merged supplier rows', () => {
  it('keeps an empty supplier editable, then replaces its placeholder with the first product', () => {
    const values = suppliers()
    const added = newSupplier()
    values.push(added)
    expect(supplierRows(values, false).at(-1)).toMatchObject({
      supplierId: added.id, supplierIndex: 2, productIndex: null, lead: true,
    })
    added.name = '新供应商'
    added.products.push(newProduct())
    expect(supplierRows(values, false).at(-1)).toMatchObject({
      id: added.products[0]!.id, supplierId: added.id, productIndex: 0, lead: true,
    })
    expect(values[2]!.products).toHaveLength(1)
  })

  it('retains a parent-only row when every product is filtered, without changing data', () => {
    const values = suppliers()
    values[0]!.products[0]!.active = false
    const before = structuredClone(values)
    expect(supplierRows(values, true)).toEqual([
      { id: 'empty:sA', supplierIndex: 0, productIndex: null, supplierId: 'sA', lead: true },
      { id: 'p3', supplierIndex: 1, productIndex: 0, supplierId: 'sB', lead: true },
    ])
    expect(values).toEqual(before)
    expect(supplierRows(values, false).map(row => [row.id, row.lead])).toEqual([
      ['p1', true], ['p2', false], ['p3', true],
    ])
  })

  it('allocates unique, stable IDs across repeated additions and suppliers', () => {
    const values = suppliers()
    values[0]!.products.push(newProduct(), newProduct())
    values[1]!.products.push(newProduct())
    values.push(newSupplier(), newSupplier())
    const ids = values.flatMap(supplier => [supplier.id, ...supplier.products.map(product => product.id)])
    expect(new Set(ids).size).toBe(ids.length)
    const rows = supplierRows(values, false)
    expect(supplierRows(values, false)).toEqual(rows)
    expect(new Set(rows.map(row => row.id)).size).toBe(rows.length)
  })

  it('does not move an invalid product error to a newly added product in the same or another group', async () => {
    const form = createEngine({ initialValues: { suppliers: suppliers() } })
    const first = newProduct()
    form.pushArray('suppliers.0.products', first)
    form.setValue('suppliers.0.products.2.price', 1001)
    form.mountJsxField('suppliers.0.products.2.price', {
      rules: [{ validator: (value, ctx) => ctx.parent?.level === 'C' && Number(value) > 1000 ? '超过 1000' : null }],
    })
    await form.validate('suppliers.0.products.2.price')
    expect(form.errors).toEqual([{ path: 'suppliers.0.products.2.price', messages: ['超过 1000'] }])
    form.pushArray('suppliers.0.products', newProduct())
    form.pushArray('suppliers.1.products', newProduct())
    expect(form.getValue('suppliers.0.products.2.id')).toBe(first.id)
    expect(form.getValue('suppliers.0.products.3.price')).toBe(1)
    expect(form.getValue('suppliers.1.products.1.price')).toBe(1)
    expect(form.errors).toEqual([{ path: 'suppliers.0.products.2.price', messages: ['超过 1000'] }])
    form.moveArray('suppliers', 0, 1)
    expect(form.errors).toEqual([{ path: 'suppliers.1.products.2.price', messages: ['超过 1000'] }])
  })
})
