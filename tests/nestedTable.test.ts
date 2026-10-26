import { describe, expect, it } from 'vitest';
import {
  cancelRowEdit,
  childFieldPath,
  collapseAll,
  commitDraftRow,
  expandAll,
  groupByMergedKey,
  mergedRowspan,
  renameMergedGroup,
  startRowEdit,
  toggleExpanded,
  updateDraftCell,
  validateDraftRow,
} from '../src/pro/nestedTable';
import { makeSuppliers } from '../src/examples/suppliers';

describe('expand state is transient', () => {
  it('toggle / expandAll / collapseAll never touch data', () => {
    let s = toggleExpanded(new Set(), 'sup-1');
    expect([...s]).toEqual(['sup-1']);
    s = toggleExpanded(s, 'sup-1');
    expect(s.size).toBe(0);
    expect([...expandAll(['a', 'b'])]).toEqual(['a', 'b']);
    expect(collapseAll().size).toBe(0);
  });
});

describe('nested paths are built from indices, never hand-written', () => {
  it('child field path for suppliers.1.products.2.price', () => {
    expect(childFieldPath('suppliers', 1, 'products', 2, 'price')).toBe(
      'suppliers.1.products.2.price',
    );
  });
});

describe('row edit draft: save commits, cancel rolls back, validation on commit only', () => {
  it('draft edits do not mutate the row until commit', async () => {
    const rows = makeSuppliers();
    const row = rows[0].products[0];
    let draft = startRowEdit({}, row.id, row);
    draft = updateDraftCell(draft, row.id, 'price', 1234);
    expect(row.price).not.toBe(1234);
    expect(draft[row.id].price).toBe(1234);
    const committed = commitDraftRow(rows[0].products, row.id, draft[row.id]);
    expect(committed[0].price).toBe(1234);
    expect(rows[0].products[0].price).not.toBe(1234);
    draft = cancelRowEdit(draft, row.id);
    expect(draft[row.id]).toBeUndefined();
  });
  it('draft validation runs on commit: negative price is rejected, typing is not validated here', async () => {
    const errors = await validateDraftRow(
      { sku: 'X', price: -5, stock: 3 },
      {
        sku: [{ required: true }],
        price: [{ min: 0, message: '价格不能小于 0' }],
        stock: [{ min: 0 }],
      },
      {},
      'suppliers.0.products.0',
    );
    expect(errors).toEqual({ price: ['价格不能小于 0'] });
    const ok = await validateDraftRow(
      { sku: 'X', price: 10, stock: 3 },
      { sku: [{ required: true }], price: [{ min: 0 }] },
      {},
      'suppliers.0.products.0',
    );
    expect(ok).toEqual({});
  });
});

describe('merged groups: rowspan is a computed count, group edit edits once', () => {
  it('groupByMergedKey preserves order and rowspan = group size', () => {
    const rows = [
      { color: '黑色', config: '基础版' },
      { color: '黑色', config: 'Pro' },
      { color: '红色', config: 'Max' },
    ];
    const groups = groupByMergedKey(rows, 'color');
    expect(groups).toEqual([
      { key: '黑色', rows: [rows[0], rows[1]], rowspan: 2 },
      { key: '红色', rows: [rows[2]], rowspan: 1 },
    ]);
    expect(mergedRowspan(0)).toBe(1);
  });
  it('renaming a merged group updates every row in the group, no other group', () => {
    const rows = [
      { color: '黑色', config: '基础版' },
      { color: '黑色', config: 'Pro' },
      { color: '红色', config: 'Max' },
    ];
    const renamed = renameMergedGroup(rows, 'color', '黑色', '曜石黑');
    expect(renamed.map((r) => r.color)).toEqual(['曜石黑', '曜石黑', '红色']);
    expect(rows[0].color).toBe('黑色'); // input not mutated
  });
  it('supplier demo data has varying rowspan per group', () => {
    const suppliers = makeSuppliers();
    const rowspans = suppliers.map((s) => mergedRowspan(s.products.length));
    expect(rowspans).toEqual([2, 3, 4, 2]);
  });
});
