// Generic data-driven many-to-many linkage. No per-combination if/else,
// no business data, no business names: a "combination" is just a row whose
// fields are the dimensions. The SKU table and SKU names live in src/examples/sku.ts, not here.
//   available(dim) = distinct values of dim among rows matching
//   the current selections of the OTHER dimensions.
// A final combination / numeric range are Computed from the same table.
export type Combination = Record<string, string | number>;

export type CombinationSelection = Partial<Combination>;

function matches(
  row: Combination,
  selection: CombinationSelection,
  except?: string,
): boolean {
  return Object.keys(selection).every((dim) => {
    if (dim === except) return true;
    const v = selection[dim];
    return v === undefined || v === '' || row[dim] === v;
  });
}

/** Distinct values of `dim` among rows matching all OTHER selections. */
export function availableOptions(
  table: Combination[],
  selection: CombinationSelection,
  dim: string,
): Array<string | number> {
  const seen = new Set<string | number>();
  const out: Array<string | number> = [];
  for (const row of table) {
    if (!matches(row, selection, dim)) continue;
    const v = row[dim];
    if (v !== undefined && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

export function availableAll(
  table: Combination[],
  selection: CombinationSelection,
  dims: string[],
): Record<string, Array<string | number>> {
  const out: Record<string, Array<string | number>> = {};
  for (const dim of dims) out[dim] = availableOptions(table, selection, dim);
  return out;
}

/** Exact row when every dimension is selected, otherwise null. */
export function finalCombination(
  table: Combination[],
  selection: CombinationSelection,
  dims: string[],
): Combination | null {
  if (dims.some((dim) => selection[dim] === undefined)) return null;
  return table.find((row) => matches(row, selection)) ?? null;
}

/** Numeric range of `field` among rows matching the current (partial) selection. */
export function numericRange(
  table: Combination[],
  selection: CombinationSelection,
  field: string,
): { min: number; max: number } | null {
  const values = table
    .filter((row) => matches(row, selection))
    .map((row) => row[field])
    .filter((v): v is number => typeof v === 'number');
  if (values.length === 0) return null;
  return { min: Math.min(...values), max: Math.max(...values) };
}
