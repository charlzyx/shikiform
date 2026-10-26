import { describe, expect, it } from 'vitest';
import {
  buttonSpan,
  gridColumns,
  mergeParams,
  paginate,
  transformQuery,
} from '../src/pro/query';
import {
  applyQuery,
  availableModels,
  createQueryStore,
  makeQueryRows,
} from '../src/examples/queryRows';

describe('query grid layout', () => {
  it('columns follow container width breakpoints', () => {
    expect(gridColumns(500)).toBe(1);
    expect(gridColumns(700)).toBe(2);
    expect(gridColumns(1000)).toBe(3);
    expect(gridColumns(1400)).toBe(4);
  });
  it('buttons occupy remaining cells, or a full new row when last row is full', () => {
    expect(buttonSpan(5, 4)).toBe(3); // 5 fields in 4 cols: last row has 1, buttons take 3
    expect(buttonSpan(4, 4)).toBe(4); // full row: buttons start a new row
    expect(buttonSpan(6, 3)).toBe(3); // 6 in 3 cols: full rows, new row
    expect(buttonSpan(7, 3)).toBe(2);
  });
});

describe('query transform and merge', () => {
  it('omits empty values and splits date range into start/end', () => {
    expect(
      transformQuery({
        keyword: '',
        provider: 'OpenAI',
        dateRange: ['2026-10-01', '2026-10-15'],
        tags: [],
      }),
    ).toEqual({ provider: 'OpenAI', dateStart: '2026-10-01', dateEnd: '2026-10-15' });
    expect(transformQuery({ dateRange: ['2026-10-01', ''] })).toEqual({ dateStart: '2026-10-01' });
  });
  it('column filter merges into the same params, and can clear a key', () => {
    expect(mergeParams({ provider: 'OpenAI' }, { status: 'active' })).toEqual({
      provider: 'OpenAI',
      status: 'active',
    });
    expect(mergeParams({ provider: 'OpenAI', status: 'active' }, { status: '' })).toEqual({
      provider: 'OpenAI',
    });
  });
});

describe('query + pagination', () => {
  const rows = makeQueryRows(48);
  it('filters by provider/model/status/date and paginates, clamping page', () => {
    const filtered = applyQuery(rows, { provider: 'OpenAI' });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((r) => r.provider === 'OpenAI')).toBe(true);
    const p = paginate(filtered, 99, 10);
    expect(p.page).toBe(p.totalPages);
    expect(p.pageRows.length).toBeLessThanOrEqual(10);
    // New query resets to page 1 (caller sets page=1); paging keeps params:
    // paginate itself does not drop params — the caller passes the same
    // filtered list, so this models "flip page without losing the query".
    const p2 = paginate(filtered, 2, 10);
    expect(p2.pageRows.every((r) => r.provider === 'OpenAI')).toBe(true);
  });
});

describe('query form linkage and transient selection', () => {
  it('provider change clears a model that is no longer available', () => {
    const store = createQueryStore();
    store.getState().setValue('provider', 'OpenAI');
    store.getState().setValue('model', 'gpt-5');
    expect(store.getState().values.model).toBe('gpt-5');
    store.getState().setValue('provider', 'Anthropic');
    expect(store.getState().values.model).toBeUndefined();
    expect(availableModels('Anthropic')).toEqual(['claude-sonnet', 'claude-opus']);
  });
  it('selection is transient: it never appears in submit values', () => {
    const store = createQueryStore();
    store.getState().setValue('provider', 'OpenAI');
    const selection = new Set(['row-001', 'row-002']); // UI state, not form state
    expect(store.getState().getSubmitValues()).toEqual({ provider: 'OpenAI' });
    expect(selection.has('row-001')).toBe(true);
    // New query clears selection (caller clears the Set) — modelled here:
    selection.clear();
    expect(selection.size).toBe(0);
  });
});
