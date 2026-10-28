export interface Product {
  id: string
  name: string
  price: number
  active: boolean
}

export interface Supplier {
  id: string
  name: string
  level: 'A' | 'B' | 'C'
  products: Product[]
}

export interface FlatRow {
  id: string
  supplierIndex: number
  /** null is a parent-only row, not a product at a synthetic array index. */
  productIndex: number | null
  supplierId: string
  lead: boolean
}

export function supplierRows(suppliers: readonly Supplier[], onlyActive: boolean): FlatRow[] {
  return suppliers.flatMap((supplier, supplierIndex) => {
    const rows: FlatRow[] = []
    supplier.products.forEach((product, productIndex) => {
      if (onlyActive && !product.active) return
      rows.push({ id: product.id, supplierIndex, productIndex, supplierId: supplier.id, lead: rows.length === 0 })
    })
    // Keep the parent's editor and first-product action reachable, including
    // when a filter hides all of its products. Do not register a phantom product.
    return rows.length ? rows : [{
      id: `empty:${supplier.id}`, supplierIndex, productIndex: null, supplierId: supplier.id, lead: true,
    }]
  })
}

/** IDs are allocated once per addition, never from the current index or length. */
export function newSupplier(): Supplier {
  return { id: `supplier-${crypto.randomUUID()}`, name: '', level: 'B', products: [] }
}

export function newProduct(): Product {
  return { id: `product-${crypto.randomUUID()}`, name: '新产品', price: 1, active: true }
}
