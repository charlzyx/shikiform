// Query-table demo data + demo-specific filtering/store.
// NOT library code: not exported by core/index.ts or pro/index.ts.
// Generic query/table logic (transform, merge, paginate, grid) lives in
// src/pro/query.ts; this file only supplies the provider/model rows.
import { createShikiStore } from '../core/store';
import type { QueryParams } from '../pro/query';

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

/** Models available for a provider — data-driven linkage on this demo table. */
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
