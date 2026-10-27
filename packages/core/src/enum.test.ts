import { describe, expect, it } from 'vitest';
import { EnumSource } from './index';

describe('enum', () => {
  it('caches async loads by cacheKey and dedupes in-flight calls', async () => {
    let calls = 0;
    const source = EnumSource.from<{ id: string }>(
      async (params) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        return [{ label: params.id, value: params.id }];
      },
      { cacheKey: (params) => params.id, staleTime: 1000 },
    );
    const bound = source.with({ id: 'hz' });
    const [first, second] = await Promise.all([bound.load(), bound.load()]);
    expect(first).toEqual([{ label: 'hz', value: 'hz' }]);
    expect(second).toEqual(first);
    expect(calls).toBe(1);
    const again = await bound.load();
    expect(again).toEqual(first);
    expect(calls).toBe(1);
    const other = await source.with({ id: 'gz' }).load();
    expect(other[0].value).toBe('gz');
    expect(calls).toBe(2);
  });
});
