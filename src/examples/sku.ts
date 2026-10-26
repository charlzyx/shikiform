// SKU demo data + demo store. NOT library code: this file is not exported
// by core/index.ts or pro/index.ts, and core/pro never import it.
// The linkage algorithm lives in src/core/linkage.ts; this file only
// supplies the SKU table and thin wrappers that bind it to its dimensions.
import { createShikiStore } from '../core/store';
import {
  availableAll as coreAvailableAll,
  finalCombination,
  numericRange,
  type Combination,
} from '../core/linkage';

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

const DIMS: SkuDimension[] = ['color', 'price', 'config'];

function asTable(table: Sku[]): Combination[] {
  return table as unknown as Combination[];
}

export function availableAll(
  table: Sku[],
  selection: SkuSelection,
): Record<SkuDimension, Array<string | number>> {
  return coreAvailableAll(asTable(table), selection, [...DIMS]) as Record<
    SkuDimension,
    Array<string | number>
  >;
}

export function finalSku(table: Sku[], selection: SkuSelection): Sku | null {
  return finalCombination(asTable(table), selection, [...DIMS]) as Sku | null;
}

export function priceRange(
  table: Sku[],
  selection: SkuSelection,
): { min: number; max: number } | null {
  return numericRange(asTable(table), selection, 'price');
}

export const ALL_COLORS = [...new Set(SKU_TABLE.map((s) => s.color))];
export const ALL_PRICES = [...new Set(SKU_TABLE.map((s) => s.price))].sort((a, b) => a - b);
export const ALL_CONFIGS = [...new Set(SKU_TABLE.map((s) => s.config))];

// SKU form store: one centralized reaction + Computed values.
// The reaction does NOT contain per-combination branches. It only says:
// "keep the field the user just changed; clear any other field whose value
// is no longer in the options computed from the rest of the selection."
function selectionFrom(ctx: { get: (p: string) => unknown }): SkuSelection {
  const sel: SkuSelection = {};
  for (const d of DIMS) {
    const v = ctx.get(d);
    if (v !== undefined && v !== '') sel[d] = v as string | number;
  }
  return sel;
}

export function createSkuStore() {
  return createShikiStore({
    initialValues: {},
    excludeFromSubmit: [],
    reactions: [
      (ctx) => {
        const sel = selectionFrom(ctx);
        for (const dim of DIMS) {
          if (dim === ctx.lastChanged) continue;
          const v = sel[dim];
          if (v === undefined) continue;
          const avail = availableAll(SKU_TABLE, sel)[dim];
          if (!avail.includes(v)) ctx.setValue(dim, undefined);
        }
      },
    ],
    computeds: [
      {
        path: 'available',
        compute: (ctx) => availableAll(SKU_TABLE, selectionFrom(ctx)),
      },
      {
        path: 'finalSku',
        compute: (ctx) => finalSku(SKU_TABLE, selectionFrom(ctx)),
      },
      {
        path: 'priceRange',
        compute: (ctx) => priceRange(SKU_TABLE, selectionFrom(ctx)),
      },
    ],
  });
}

export type SkuStore = ReturnType<typeof createSkuStore>;
