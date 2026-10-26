import { describe, expect, it, vi } from 'vitest';
import {
  Enum,
  createLazyTree,
  findOption,
  flattenOptions,
  isValueAvailable,
  labelPathOf,
  mergeTreeChildren,
  validateEnumValue,
  type EnumOption,
} from '../src/core/enum';

const STATIC: EnumOption[] = [
  { label: '黑色', value: 'black' },
  { label: '白色', value: 'white', disabled: true },
  { label: '红色', value: 'red', color: 'error' },
];

describe('Enum static', () => {
  it('find / flatten / validate: disabled is rejected, unknown is rejected', () => {
    expect(findOption(STATIC, 'red')?.label).toBe('红色');
    expect(flattenOptions(STATIC).map((o) => o.value)).toEqual(['black', 'white', 'red']);
    expect(validateEnumValue('black', STATIC)).toBeNull();
    expect(validateEnumValue('white', STATIC)).toBe('该选项已禁用');
    expect(validateEnumValue('nope', STATIC)).toBe('值不在可选范围内');
    expect(validateEnumValue('', STATIC)).toBeNull(); // empty is required's job
    expect(isValueAvailable('black', ['black', 'red'])).toBe(true);
    expect(isValueAvailable('white', ['black', 'red'])).toBe(false);
  });
});

describe('Enum async: cache, dedupe, stale discard', () => {
  it('identical params hit cache, concurrent identical calls share one loader call', async () => {
    const loader = vi.fn(async (params?: Record<string, unknown>) => [
      { label: `P-${params?.provider ?? ''}`, value: 'x' },
    ]);
    const def = Enum.from(loader);
    const [a, b] = await Promise.all([def.load({ provider: 'A' }), def.load({ provider: 'A' })]);
    expect(a).toEqual(b);
    expect(loader).toHaveBeenCalledTimes(1);
    await def.load({ provider: 'A' });
    expect(loader).toHaveBeenCalledTimes(1); // cached
    expect(def.cached({ provider: 'A' })?.[0].label).toBe('P-A');
  });

  it('stale result does not poison the cache', async () => {
    let releaseSlow!: (v: EnumOption[]) => void;
    const slow = new Promise<EnumOption[]>((r) => {
      releaseSlow = r;
    });
    const loader = vi.fn(async (params?: Record<string, unknown>) => {
      if (params?.q === 'slow') return slow;
      return [{ label: 'fast', value: 'fast' }];
    });
    const def = Enum.from(loader);
    const slowP = def.load({ q: 'slow' });
    const fast = await def.load({ q: 'fast' });
    expect(fast[0].label).toBe('fast');
    releaseSlow([{ label: 'slow', value: 'slow' }]);
    const slowResult = await slowP;
    expect(slowResult[0].label).toBe('slow'); // caller still gets its own result
    expect(def.cached({ q: 'slow' })).toBeUndefined(); // but cache was not poisoned
    expect(def.cached({ q: 'fast' })?.[0].label).toBe('fast');
  });

  it('debounce collapses rapid calls to the last params', async () => {
    const loader = vi.fn(async (params?: Record<string, unknown>) => [
      { label: `Q-${params?.q}`, value: 'x' },
    ]);
    const def = Enum.from(loader, { debounceMs: 10 });
    const p1 = def.load({ q: 'a' });
    const p2 = def.load({ q: 'b' });
    const p3 = def.load({ q: 'c' });
    const results = await Promise.all([p1, p2, p3]);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith({ q: 'c' });
    expect(results.every((r) => r[0].label === 'Q-c')).toBe(true);
  });
});

describe('Enum lazy tree', () => {
  const loader = async (parent: EnumOption | null): Promise<EnumOption[]> => {
    if (parent === null) return [{ label: '华东', value: 'east' }, { label: '华北', value: 'north' }];
    if (parent.value === 'east') return [{ label: '上海', value: 'sh' }, { label: '杭州', value: 'hz' }];
    return [];
  };
  it('mergeTreeChildren is pure and places children at the right path', () => {
    const tree: EnumOption[] = [{ label: '华东', value: 'east' }];
    const merged = mergeTreeChildren(tree, ['east'], [{ label: '上海', value: 'sh' }]);
    expect(tree[0].children).toBeUndefined();
    expect(merged[0].children?.[0].label).toBe('上海');
    expect(labelPathOf(merged, ['east', 'sh'])).toEqual(['华东', '上海']);
  });
  it('createLazyTree loads root then children on demand', async () => {
    const t = createLazyTree(loader);
    await t.loadRoot();
    expect(t.getTree().map((o) => o.value)).toEqual(['east', 'north']);
    await t.loadChildren(['east']);
    expect(t.getTree()[0].children?.map((o) => o.value)).toEqual(['sh', 'hz']);
  });
});
