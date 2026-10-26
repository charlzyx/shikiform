// Query form + Table (PLAN 3.4, ProTable / QueryFilter pattern only —
// no Antd code, no Antd dependency). Pure logic, fully unit-testable.
// Generic pattern logic only: no provider/model data, no mock rows here.
// Business rows live in src/examples/queryRows.ts.

export interface QueryFormValues {
  keyword?: string;
  provider?: string;
  model?: string;
  status?: string;
  dateRange?: [string, string];
  tags?: string[];
}

export interface QueryParams {
  keyword?: string;
  provider?: string;
  model?: string;
  status?: string;
  dateStart?: string;
  dateEnd?: string;
  tags?: string[];
}

/**
 * Submit transform: empty values omitted, date range split into
 * start/end, multi-select passed through as-is.
 */
export function transformQuery(values: QueryFormValues): QueryParams {
  const out: QueryParams = {};
  if (values.keyword) out.keyword = values.keyword;
  if (values.provider) out.provider = values.provider;
  if (values.model) out.model = values.model;
  if (values.status) out.status = values.status;
  if (values.tags && values.tags.length > 0) out.tags = values.tags;
  const [start, end] = values.dateRange ?? [];
  if (start) out.dateStart = start;
  if (end) out.dateEnd = end;
  return out;
}

/** Column-header filter and query form merge into ONE param object. */
export function mergeParams(
  formParams: QueryParams,
  columnFilter: Partial<QueryParams>,
): QueryParams {
  const merged = { ...formParams };
  for (const [k, v] of Object.entries(columnFilter)) {
    if (v === undefined || v === '') delete merged[k as keyof QueryParams];
    else (merged as Record<string, unknown>)[k] = v;
  }
  return merged;
}

export function paginate<T>(
  rows: T[],
  page: number,
  pageSize: number,
): { pageRows: T[]; total: number; totalPages: number; page: number } {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { pageRows: rows.slice(start, start + pageSize), total, totalPages, page: safePage };
}

/**
 * Formly-style Grid: columns are computed from container width / breakpoint,
 * never hand-written per field.
 * <600: 1 col, <900: 2, <1200: 3, else 4. min field width is implicit in this.
 */
export function gridColumns(containerWidth: number): number {
  if (containerWidth < 600) return 1;
  if (containerWidth < 900) return 2;
  if (containerWidth < 1200) return 3;
  return 4;
}

/**
 * Query/Reset buttons occupy the remaining cells of the last row.
 * If the last row is already full, buttons start a new row spanning all cols.
 * visibleCount changes (collapse / show-hide / add-remove) => recompute.
 */
export function buttonSpan(visibleCount: number, cols: number): number {
  const rem = visibleCount % cols;
  return rem === 0 ? cols : cols - rem;
}
