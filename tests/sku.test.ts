import { describe, expect, it } from 'vitest';
import { createSkuStore } from '../src/core/skuStore';
import { availableAll, finalSku, SKU_TABLE } from '../src/core/sku';

function fresh() {
  const store = createSkuStore();
  const s = () => store.getState();
  const c = () =>
    s().computed as unknown as {
      available: Record<string, Array<string | number>>;
      finalSku: { id: string; price: number; stock: number } | null;
      priceRange: { min: number; max: number } | null;
    };
  return { store, s, c };
}

describe('SKU available options (data-driven, no per-combination if/else)', () => {
  it('no selection: all options available', () => {
    const avail = availableAll(SKU_TABLE, {});
    expect(avail.color.sort()).toEqual(['白色', '红色', '黑色']);
    expect([...avail.price].sort((a, b) => (a as number) - (b as number))).toEqual([999, 1499, 1799, 1999]);
    expect(avail.config.sort()).toEqual(['Max', 'Pro', '基础版']);
  });

  it('color -> price/config: red only allows 1799/1999 and Pro/Max', () => {
    const avail = availableAll(SKU_TABLE, { color: '红色' });
    expect(avail.price).toEqual([1799, 1999]);
    expect(avail.config.sort()).toEqual(['Max', 'Pro']);
  });

  it('price -> color/config: 999 only allows basic config', () => {
    const avail = availableAll(SKU_TABLE, { price: 999 });
    expect(avail.config).toEqual(['基础版']);
    expect(avail.color.sort()).toEqual(['白色', '黑色']);
  });
});

describe('SKU store: any order, reverse, invalid clearing, final SKU', () => {
  it('color first, then price, then config -> final SKU', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('color', '黑色');
    store.getState().setValue('price', 1499);
    store.getState().setValue('config', 'Pro');
    expect(c().finalSku).toMatchObject({ id: 'black-pro', price: 1499, stock: 5 });
    expect(s().values).toEqual({ color: '黑色', price: 1499, config: 'Pro' });
  });

  it('reverse order: price first, then color, then config', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('price', 1799);
    // price 1799 forces color=red, config=Pro as the only options
    expect(c().available.color).toEqual(['红色']);
    expect(c().available.config).toEqual(['Pro']);
    store.getState().setValue('color', '红色');
    store.getState().setValue('config', 'Pro');
    expect(c().finalSku).toMatchObject({ id: 'red-pro', price: 1799, stock: 4 });
  });

  it('config first: Max forces price 1999', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('config', 'Max');
    expect(c().available.price).toEqual([1999]);
    store.getState().setValue('price', 1999);
    store.getState().setValue('color', '红色');
    expect(c().finalSku).toMatchObject({ id: 'red-max', price: 1999, stock: 6 });
  });

  it('invalid old selection is cleared, last change kept', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('color', '红色');
    store.getState().setValue('config', 'Pro');
    // Now change color to 白色: white+Pro exists, so config stays.
    store.getState().setValue('color', '白色');
    expect(s().values.config).toBe('Pro');
    // Now change config to Max, then change color to a value that has no Max?
    // Every color has a Max, so instead: set price 999 (only basic) after Pro.
    // Last change (price) is kept, conflicting config is cleared.
    store.getState().setValue('price', 999);
    expect(s().values.price).toBe(999);
    expect(s().values.config).toBeUndefined();
  });

  it('partial selection gives a price range, not a final SKU', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('color', '黑色');
    expect(c().finalSku).toBeNull();
    expect(c().priceRange).toEqual({ min: 999, max: 1999 });
  });

  it('out-of-stock final SKU is reported, not hidden', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('color', '白色');
    store.getState().setValue('price', 999);
    store.getState().setValue('config', '基础版');
    expect(c().finalSku).toMatchObject({ id: 'white-basic', stock: 0 });
  });

  it('submit values contain only the three dimensions, no computed fields', () => {
    const { store, s, c } = fresh();
    store.getState().setValue('color', '黑色');
    store.getState().setValue('price', 999);
    store.getState().setValue('config', '基础版');
    expect(s().getSubmitValues()).toEqual({ color: '黑色', price: 999, config: '基础版' });
    expect(s().cycleError).toBeNull();
  });
});
