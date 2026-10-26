// Deterministic demo data: supplier -> products.
// NOT library code: not exported by core/index.ts or pro/index.ts.
// The generic nested-table helpers live in src/pro/nestedTable.ts.
import type { ChildRow, ParentRow } from '../pro/nestedTable';

export interface Product extends ChildRow {
  sku: string;
  price: number;
  stock: number;
}
export interface Supplier extends ParentRow {
  name: string;
  region: string;
  products: Product[];
}

export function makeSuppliers(): Supplier[] {
  const regions = ['华东', '华北', '华南'];
  const out: Supplier[] = [];
  for (let i = 0; i < 4; i++) {
    const products: Product[] = [];
    const count = 2 + (i % 3); // 2,3,4,2 — rowspan varies per group
    for (let j = 0; j < count; j++) {
      products.push({
        id: `sup-${i + 1}-prod-${j + 1}`,
        sku: `SKU-${i + 1}-${j + 1}`,
        price: 99 + ((i * 53 + j * 37) % 900),
        stock: (i * 7 + j * 3) % 20,
      });
    }
    out.push({
      id: `sup-${i + 1}`,
      name: `供应商 ${i + 1}`,
      region: regions[i % regions.length],
      products,
    });
  }
  return out;
}
