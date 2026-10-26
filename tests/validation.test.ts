import { describe, expect, it, vi } from 'vitest';
import {
  CELL_COMMIT_TRIGGER,
  createAsyncValidatorRunner,
  groupErrorsByParent,
  rulesForTrigger,
  shouldValidate,
  validateField,
  validateForm,
} from '../src/core/validation';

describe('validation sync rules', () => {
  it('required / min / max / length / pattern, empty non-required skips the rest', async () => {
    const values = {};
    expect(await validateField('', [{ required: true }], values, 'name')).toEqual(['必填']);
    expect(await validateField('', [{ minLength: 3 }], values, 'name')).toEqual([]);
    expect(await validateField('ab', [{ minLength: 3 }], values, 'name')).toEqual(['长度不能小于 3']);
    expect(await validateField(5, [{ min: 10 }], values, 'price')).toEqual(['不能小于 10']);
    expect(await validateField('abc', [{ pattern: /^\d+$/ }], values, 'code')).toEqual(['格式不正确']);
  });
  it('cross-field: confirm reads record (sibling) without an absolute path', async () => {
    const values = { password: 'abc123', confirm: 'xyz' };
    const errors = await validateField('xyz', [
      {
        validator: (v, ctx) => (v === ctx.record.password ? null : '两次密码不一致'),
      },
    ], values, 'confirm');
    expect(errors).toEqual(['两次密码不一致']);
    const ok = await validateField('abc123', [
      { validator: (v, ctx) => (v === ctx.record.password ? null : '两次密码不一致') },
    ], values, 'confirm');
    expect(ok).toEqual([]);
  });
  it('cross-field via root: a child can read a global value', async () => {
    const values = { globalMax: 100, suppliers: [{ price: 150 }] };
    const errors = await validateField(150, [
      { validator: (v, ctx) => ((v as number) <= (ctx.root.globalMax as number) ? null : '超过全局上限') },
    ], values, 'suppliers.0.price');
    expect(errors).toEqual(['超过全局上限']);
  });
});

describe('validation timing', () => {
  it('default rule fires onBlur and onSubmit, not onChange', () => {
    expect(shouldValidate(undefined, 'onChange')).toBe(false);
    expect(shouldValidate(undefined, 'onBlur')).toBe(true);
    expect(shouldValidate(undefined, 'onSubmit')).toBe(true);
    expect(shouldValidate('onChange', 'onChange')).toBe(true);
    expect(rulesForTrigger([{ trigger: 'onChange' }, {}], 'onChange').length).toBe(1);
  });
  it('table cells validate only on commit', () => {
    expect(CELL_COMMIT_TRIGGER).toBe('onSubmit');
  });
});

describe('validation async: stale discard + debounce', () => {
  it('an older async result never overwrites a newer one', async () => {
    const runner = createAsyncValidatorRunner();
    let release!: (v: string | null) => void;
    const slow = new Promise<string | null>((r) => {
      release = r;
    });
    const validator = vi.fn(async () => slow);
    const slowP = runner.run('a', [{ validator }], {}, 'name');
    const fast = await runner.run('b', [{ validator: async () => null }], {}, 'name');
    expect(fast.stale).toBe(false);
    release('旧结果报错');
    const slowResult = await slowP;
    expect(slowResult.stale).toBe(true);
    expect(slowResult.errors).toEqual([]);
  });
  it('debounce runs only the last value in the window', async () => {
    const runner = createAsyncValidatorRunner({ debounceMs: 10 });
    const validator = vi.fn(async (v: unknown) => (v === 'bad' ? 'bad' : null));
    const p1 = runner.run('bad', [{ validator }], {}, 'name');
    const p2 = runner.run('ok', [{ validator }], {}, 'name');
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(validator).toHaveBeenCalledTimes(1);
    expect(r1.stale).toBe(true);
    expect(r2).toEqual({ stale: false, errors: [] });
  });
});

describe('validateForm: hidden skipped, resolver appended, errors grouped by row', async () => {
  it('hidden paths are skipped; resolver errors append without replacing core errors', async () => {
    const values = { a: '', b: '' };
    const out = await validateForm(
      values,
      { a: [{ required: true }], b: [{ required: true }] },
      {
        hiddenPaths: new Set(['b']),
        resolver: async () => ({ a: ['外部校验：格式不对'] }),
      },
    );
    expect(out).toEqual({ a: ['必填', '外部校验：格式不对'] });
  });
  it('groupErrorsByParent groups child errors under their row', () => {
    const grouped = groupErrorsByParent({
      'suppliers.0.products.1.price': ['不能小于 0'],
      'suppliers.0.name': ['必填'],
    });
    expect(grouped['suppliers.0.products.1']).toEqual({ price: ['不能小于 0'] });
    expect(grouped['suppliers.0']).toEqual({ name: ['必填'] });
  });
});
