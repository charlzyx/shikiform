// SKU form store: one centralized reaction + Computed values.
// The reaction does NOT contain per-combination branches. It only says:
// "keep the field the user just changed; clear any other field whose value
// is no longer in the options computed from the rest of the selection."
import { createShikiStore } from './store';
import {
  availableAll,
  finalSku,
  priceRange,
  SKU_TABLE,
  type SkuSelection,
} from './sku';

const DIMS = ['color', 'price', 'config'] as const;

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
