import { describe, expect, it } from 'vitest';
import { createFormValidator, type ValidationTarget } from '../src/core/validation';

function target(values: Record<string, unknown>): ValidationTarget & {
  errors: Record<string, string[]>;
  validating: Record<string, boolean>;
} {
  const errors: Record<string, string[]> = {};
  const validating: Record<string, boolean> = {};
  return {
    errors,
    validating,
    getValues: () => values,
    setFieldErrors: (path, list) => {
      errors[path] = list;
    },
    setFieldValidating: (path, v) => {
      validating[path] = v;
    },
  };
}

describe('createFormValidator: JSX-declared rules, centralized execution', () => {
  it('onBlur runs default-trigger rules, onChange does not by default', async () => {
    const t = target({ name: '' });
    const v = createFormValidator(t);
    expect(await v.validatePath('name', [{ required: true }], 'onChange')).toEqual([]);
    expect(t.errors.name).toBeUndefined();
    expect(await v.validatePath('name', [{ required: true }], 'onBlur')).toEqual(['必填']);
    expect(t.errors.name).toEqual(['必填']);
  });

  it('async stale result never overwrites a newer one', async () => {
    const t = target({ name: 'a' });
    const v = createFormValidator(t);
    const slow = v.validatePath(
      'name',
      [
        {
          validator: async () => {
            await new Promise((r) => setTimeout(r, 30));
            return 'slow-error';
          },
        },
      ],
      'onBlur',
    );
    const fast = v.validatePath(
      'name',
      [
        {
          validator: async () => null,
        },
      ],
      'onBlur',
    );
    await Promise.all([slow, fast]);
    expect(t.errors.name).toEqual([]);
    expect(t.validating.name).toBe(false);
  });

  it('validateAll aggregates by path and skips hidden paths', async () => {
    const t = target({ a: '', b: '' });
    const v = createFormValidator(t);
    const out = await v.validateAll(
      { a: [{ required: true }], b: [{ required: true }] },
      'onSubmit',
      new Set(['b']),
    );
    expect(out).toEqual({ a: ['必填'] });
    expect(t.errors.b).toBeUndefined();
  });

  it('cross-field validator reads record and root from the same snapshot', async () => {
    const t = target({ start: '2026-10-20', end: '2026-10-10' });
    const v = createFormValidator(t);
    const out = await v.validatePath(
      'end',
      [
        {
          validator: (value, ctx) =>
            (value as string) > (ctx.root.start as string) ? null : '结束日期必须晚于开始日期',
        },
      ],
      'onSubmit',
    );
    expect(out).toEqual(['结束日期必须晚于开始日期']);
  });
});
