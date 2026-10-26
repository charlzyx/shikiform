// Query form + Table (PLAN 3.4, ProTable / QueryFilter pattern only —
// no Antd code, no Antd dependency). Pure logic, fully unit-testable.
import { createShikiStore } from './store';

export interface QueryRow {
  id: string;
  name: string;
  provider: string;
  model: string;
  status: 'active' | 'disabled' | 'pending';
  created: string; // YYYY-MM-DD
  price: number;
}

export const PROVIDER_MODELS: Record<string, string[]> = {
  OpenAI: ['gpt-5', 'gpt-5-mini', 'o4-mini'],
  Anthropic: ['claude-sonnet', 'claude-opus'],
  DeepSeek: ['deepseek-chat', 'deepseek-reasoner'],
  通义: ['qwen-max', 'qwen-plus'],
};

export const ALL_MODELS = [...new Set(Object.values(PROVIDER_MODELS).flat())];
export const ALL_STATUSES = ['active', 'disabled', 'pending'] as const;

/** Models available for a provider — same data-driven idea as SKU. */
export function availableModels(provider: string | undefined): string[] {
  if (!provider) return ALL_MODELS;
  return PROVIDER_MODELS[provider] ?? [];
}

/** Deterministic mock rows (no Math.random, tests stay stable). */
export function makeQueryRows(count = 48): QueryRow[] {
  const providers = Object.keys(PROVIDER_MODELS);
  const rows: QueryRow[] = [];
  for (let i = 0; i < count; i++) {
    const provider = providers[i % providers.length];
    const models = PROVIDER_MODELS[provider];
    const model = models[i % models.length];
    const status = ALL_STATUSES[i % ALL_STATUSES.length];
    const day = String(1 + (i % 28)).padStart(2, '0');
    rows.push({
      id: `row-${String(i + 1).padStart(3, '0')}`,
      name: `供应商配置 ${i + 1}`,
      provider,
      model,
      status,
      created: `2026-10-${day}`,
      price: 99 + ((i * 37) % 900),
    });
  }
  return rows;
}

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

export function applyQuery(rows: QueryRow[], params: QueryParams): QueryRow[] {
  return rows.filter((r) => {
    if (params.keyword && !(r.name.includes(params.keyword) || r.id.includes(params.keyword))) return false;
    if (params.provider && r.provider !== params.provider) return false;
    if (params.model && r.model !== params.model) return false;
    if (params.status && r.status !== params.status) return false;
    if (params.dateStart && r.created < params.dateStart) return false;
    if (params.dateEnd && r.created > params.dateEnd) return false;
    return true;
  });
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

/** Query store: provider -> model linkage is a centralized reaction. */
export function createQueryStore() {
  return createShikiStore({
    initialValues: {},
    excludeFromSubmit: [],
    reactions: [
      (ctx) => {
        const provider = ctx.get('provider') as string | undefined;
        const model = ctx.get('model') as string | undefined;
        if (model && provider && !availableModels(provider).includes(model)) {
          ctx.setValue('model', undefined);
        }
        if (model && !provider) {
          // model without provider is allowed (it filters by model alone)
        }
      },
    ],
  });
}
