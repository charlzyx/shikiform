// SKU: data-driven many-to-many linkage. No per-combination if/else.
// One generic algorithm works for any order of selection:
//   available(dim) = distinct values of dim among SKUs matching
//   the current selections of the OTHER dimensions.
// Final SKU / price / stock are Computed from the same table.
export type SkuDimension = 'color' | 'price' | 'config';

export interface Sku {
  id: string;
  color: string;
  config: string;
  price: number;
  stock: number;
}

export const SKU_TABLE: Sku[] = [
  { id: 'black-basic', color: '黑色', config: '基础版', price: 999, stock: 12 },
  { id: 'black-pro', color: '黑色', config: 'Pro', price: 1499, stock: 5 },
  { id: 'black-max', color: '黑色', config: 'Max', price: 1999, stock: 0 },
  { id: 'white-basic', color: '白色', config: '基础版', price: 999, stock: 0 },
  { id: 'white-pro', color: '白色', config: 'Pro', price: 1499, stock: 8 },
  { id: 'white-max', color: '白色', config: 'Max', price: 1999, stock: 3 },
  { id: 'red-pro', color: '红色', config: 'Pro', price: 1799, stock: 4 },
  { id: 'red-max', color: '红色', config: 'Max', price: 1999, stock: 6 },
];

export type SkuSelection = Partial<Record<SkuDimension, string | number>>;

function skuValue(sku: Sku, dim: SkuDimension): string | number {
  return dim === 'color' ? sku.color : dim === 'config' ? sku.config : sku.price;
}

function matches(sku: Sku, selection: SkuSelection, except?: SkuDimension): boolean {
  return (Object.keys(selection) as SkuDimension[]).every((dim) => {
    if (dim === except) return true;
    const v = selection[dim];
    return v === undefined || v === '' || skuValue(sku, dim) === v;
  });
}

/** Distinct values of `dim` among SKUs matching all OTHER selections. */
export function availableOptions(
  table: Sku[],
  selection: SkuSelection,
  dim: SkuDimension,
): Array<string | number> {
  const seen = new Set<string | number>();
  const out: Array<string | number> = [];
  for (const sku of table) {
    if (!matches(sku, selection, dim)) continue;
    const v = skuValue(sku, dim);
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function availableAll(
  table: Sku[],
  selection: SkuSelection,
): Record<SkuDimension, Array<string | number>> {
  return {
    color: availableOptions(table, selection, 'color'),
    price: availableOptions(table, selection, 'price'),
    config: availableOptions(table, selection, 'config'),
  };
}

/** Exact SKU when every dimension is selected, otherwise null. */
export function finalSku(table: Sku[], selection: SkuSelection): Sku | null {
  if (selection.color === undefined || selection.price === undefined || selection.config === undefined) {
    return null;
  }
  return table.find((s) => matches(s, selection)) ?? null;
}

/** Price range among SKUs matching the current (partial) selection. */
export function priceRange(
  table: Sku[],
  selection: SkuSelection,
): { min: number; max: number } | null {
  const prices = table.filter((s) => matches(s, selection)).map((s) => s.price);
  if (prices.length === 0) return null;
  return { min: Math.min(...prices), max: Math.max(...prices) };
}

export const ALL_COLORS = [...new Set(SKU_TABLE.map((s) => s.color))];
export const ALL_PRICES = [...new Set(SKU_TABLE.map((s) => s.price))].sort((a, b) => a - b);
export const ALL_CONFIGS = [...new Set(SKU_TABLE.map((s) => s.config))];
