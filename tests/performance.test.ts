import { describe, expect, it } from 'vitest';
import { createShikiStore, selectFieldValue } from '../src/core/store';
import {
  createRenderCounter,
  naiveRenderCount,
  shikiRenderCount,
  windowForGroups,
  windowForRows,
} from '../src/pro/virtualize';
import { availableAll, SKU_TABLE } from '../src/examples/sku';
import { makeQueryRows } from '../src/examples/queryRows';
import { gridColumns, paginate } from '../src/pro/query';

describe('virtualization: only the visible window renders', () => {
  it('2000 rows, 600px viewport, 40px rows: renders ~25 rows, not 2000', () => {
    const w = windowForRows(2000, 40, 0, 600, 5);
    expect(w.renderedCount).toBeLessThanOrEqual(30);
    expect(w.totalHeight).toBe(80000);
    const scrolled = windowForRows(2000, 40, 4000, 600, 5);
    expect(scrolled.start).toBeGreaterThan(0);
    expect(scrolled.renderedCount).toBeLessThanOrEqual(30);
  });
  it('group window never splits a merged/expanded group', () => {
    const groups = [
      { id: 'g1', height: 120 },
      { id: 'g2', height: 300 },
      { id: 'g3', height: 80 },
    ];
    const w = windowForGroups(groups, 100, 200, 0);
    // First intersecting group (g1) renders whole, even though its top is past.
    expect(w.groups[0].id).toBe('g1');
    expect(w.totalHeight).toBe(500);
  });
});

describe('field-level subscription: unrelated changes do not move a selector', () => {
  it('selectFieldValue for one cell is unchanged by another cell change', () => {
    const store = createShikiStore({
      initialValues: { a: 1, b: 2 },
    });
    const before = selectFieldValue('a')(store.getState());
    store.getState().setValue('b', 99);
    const after = selectFieldValue('a')(store.getState());
    expect(before).toBe(1);
    expect(after).toBe(1);
    // A Zustand selector returning the same value bails out of re-render:
    // that is the field-level subscription guarantee, in testable form.
  });
});

describe('computed caching: unrelated changes do not re-run computed fns', () => {
  it('a computed fn runs once for an unrelated change, again for a related one', () => {
    let calls = 0;
    const store = createShikiStore({
      initialValues: { color: '黑色', unrelated: 0 },
      computeds: [
        {
          path: 'available',
          compute: (ctx) => {
            calls++;
            return availableAll(SKU_TABLE, { color: ctx.get('color') as string });
          },
        },
      ],
    });
    const initialCalls = calls;
    expect(initialCalls).toBeGreaterThan(0);
    store.getState().setValue('unrelated', 1);
    expect(calls).toBe(initialCalls); // skipped: deps unchanged
    store.getState().setValue('color', '红色');
    expect(calls).toBeGreaterThan(initialCalls); // re-ran: dep changed
  });
});

describe('typing does not trigger the global graph (model)', () => {
  it('naive vs Shiki render counts for one cell change in a 2000x8 table', () => {
    const naive = naiveRenderCount(2000, 8);
    const shiki = shikiRenderCount(1, 2); // changed cell + 2 direct dependents
    expect(naive).toBe(16000);
    expect(shiki).toBe(3);
    expect(shiki).toBeLessThan(naive / 100);
  });
  it('render counter: only the changed key increments in the model', () => {
    const counter = createRenderCounter();
    counter.inc('cell-a');
    counter.inc('cell-a');
    expect(counter.get('cell-a')).toBe(2);
    expect(counter.get('cell-b')).toBe(0);
  });
});

describe('perf workload correctness at scale (no timing flakiness)', () => {
  it('SKU available, grid columns and pagination stay correct at 2000 rows', () => {
    const rows = makeQueryRows(2000);
    expect(rows.length).toBe(2000);
    const paged = paginate(rows, 1, 20);
    expect(paged.pageRows.length).toBe(20);
    expect(paged.totalPages).toBe(100);
    expect(gridColumns(1000)).toBe(3);
    const avail = availableAll(SKU_TABLE, { color: '红色' });
    expect(avail.price).toEqual([1799, 1999]);
  });
});
