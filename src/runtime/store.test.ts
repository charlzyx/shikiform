import { describe, expect, it } from 'vitest';
import { ShikiCycleError, createForm, defineEffects } from './store';

describe('teaching runtime', () => {
  it('submits values and drops virtual fields', async () => {
    const form = createForm({
      initialValues: { name: '', password: '', confirmPassword: '' },
    });
    form.mountField('name', () => ({}));
    form.mountField('password', () => ({}));
    form.mountField('confirmPassword', () => ({ virtual: true }));
    form.setValue('name', 'Ada');
    form.setValue('password', 'secret12');
    form.setValue('confirmPassword', 'secret12');
    let payload: any;
    const errors = await form.submit((values) => {
      payload = values;
    });
    expect(errors).toEqual([]);
    expect(payload).toEqual({ name: 'Ada', password: 'secret12' });
  });

  it('validates on blur, not on change, by default', () => {
    const form = createForm({
      initialValues: { email: '' },
      validateTrigger: ['onBlur', 'onSubmit'],
    });
    form.mountField('email', () => ({ rules: [{ required: true, message: '必填' }, { format: 'email', message: '邮箱格式不对' }] }));
    form.setValue('email', 'nope');
    expect(form.getFieldSnap('email').errors).toEqual([]);
    form.blur('email');
    expect(form.getFieldSnap('email').errors).toEqual(['邮箱格式不对']);
  });

  it('hides with $visible, keeps the value, and skips validation', async () => {
    const effects = defineEffects<{ show: boolean; email: string }>(({ autorun }) => {
      autorun((d) => {
        d.email.$visible = !!d.show.$value;
      });
    });
    const form = createForm({
      initialValues: { show: false, email: 'ada@example.com' },
      effects: [effects],
    });
    form.mountField('email', () => ({ rules: [{ required: true }] }));
    expect(form.getFieldSnap('email').visible).toBe(false);
    expect(form.getValue('email')).toBe('ada@example.com');
    expect(await form.submit()).toEqual([]);
    form.setValue('show', true);
    expect(form.getFieldSnap('email').visible).toBe(true);
    form.setValue('email', '');
    const errors = await form.submit();
    expect(errors.map((error) => error.path)).toContain('email');
  });

  it('inherits pattern until a child sets its own', () => {
    const form = createForm({ initialValues: { address: { city: '杭州' } } });
    form.mountField('address', () => ({ pattern: 'readPretty' }));
    form.mountField('address.city', () => ({}));
    expect(form.getFieldSnap('address.city').pattern).toBe('readPretty');
    const effects = defineEffects(({ autorun }) => {
      autorun((d) => {
        d.address.city.$pattern = 'editable';
      });
    });
    const next = createForm({
      initialValues: { address: { city: '杭州' } },
      effects: [effects],
    });
    next.mountField('address', () => ({ pattern: 'readPretty' }));
    next.mountField('address.city', () => ({}));
    expect(next.getFieldSnap('address.city').pattern).toBe('editable');
  });

  it('writes computed $value from autorun and omits it on submit', async () => {
    const effects = defineEffects(({ autorun }) => {
      autorun((d) => {
        d.amount.$value = (d.price.$value || 0) * (d.qty.$value || 0);
      });
    });
    const form = createForm({
      initialValues: { price: 10, qty: 2, amount: 0 },
      effects: [effects],
    });
    expect(form.getValue('amount')).toBe(20);
    expect(form.getFieldSnap('amount').pattern).toBe('readPretty');
    form.setValue('qty', 3);
    expect(form.getValue('amount')).toBe(30);
    let payload: any;
    await form.submit((values) => {
      payload = values;
    });
    expect(payload).toEqual({ price: 10, qty: 3 });
  });

  it('keeps a computed field when virtual is explicitly false', async () => {
    const effects = defineEffects(({ autorun }) => {
      autorun((d) => {
        d.payable.$value = d.price.$value || 0;
      });
    });
    const form = createForm({
      initialValues: { price: 8, payable: 0 },
      effects: [effects],
      fields: { payable: { virtual: false } },
    });
    let payload: any;
    await form.submit((values) => {
      payload = values;
    });
    expect(payload).toEqual({ price: 8, payable: 8 });
  });

  it('does not run watch on init, then clears the child when the source changes', () => {
    const effects = defineEffects(({ autorun, watch }) => {
      autorun((d) => {
        d.city.$disabled = !d.province.$value;
      });
      watch(
        (d) => d.province,
        (d) => {
          d.city.$value = undefined;
        },
      );
    });
    const form = createForm({
      initialValues: { province: '浙江', city: '杭州' },
      effects: [effects],
    });
    expect(form.getValue('city')).toBe('杭州');
    expect(form.getFieldSnap('city').pattern).toBe('editable');
    form.setValue('province', '广东');
    expect(form.getValue('city')).toBeUndefined();
    expect(form.getFieldSnap('city').pattern).toBe('editable');
  });

  it('computes each array row and strips computed cells', async () => {
    const effects = defineEffects(({ autorun }) => {
      autorun.each(
        (d) => d.items,
        (row) => {
          row.total.$value = (row.price.$value || 0) * (row.qty.$value || 0);
        },
      );
    });
    const form = createForm({
      initialValues: { items: [{ id: 'a', price: 2, qty: 4, total: 0 }] },
      effects: [effects],
    });
    expect(form.getValue('items.0.total')).toBe(8);
    form.push('items', { id: 'b', price: 5, qty: 1, total: 0 });
    expect(form.getValue('items.1.total')).toBe(5);
    form.setValue('items.0.qty', 3);
    expect(form.getValue('items.0.total')).toBe(6);
    let payload: any;
    await form.submit((values) => {
      payload = values;
    });
    expect(payload.items[0]).toEqual({ id: 'a', price: 2, qty: 3 });
    expect(payload.items[1]).toEqual({ id: 'b', price: 5, qty: 1 });
  });

  it('merges a resolver into field errors', async () => {
    const form = createForm({
      initialValues: { age: 10 },
      resolver: () => ({ age: '需要年满 18' }),
    });
    form.mountField('age', () => ({}));
    const errors = await form.submit();
    expect(errors).toEqual([{ path: 'age', messages: ['需要年满 18'] }]);
  });

  it('validates declared $rules when the field is unmounted, and JSX rules only while mounted', async () => {
    const effects = defineEffects(({ autorun }) => {
      autorun((d) => {
        d.code.$rules = [{ required: true, message: '邀请码必填' }];
      });
    });
    const form = createForm({
      initialValues: { nickname: '', code: '' },
      effects: [effects],
      fields: { code: {} },
    });
    let errors = await form.submit();
    expect(errors.map((error) => error.path)).toEqual(['code']);
    const unmount = form.mountField('nickname', () => ({ rules: [{ required: true, message: '昵称必填' }] }));
    errors = await form.submit();
    expect(errors.map((error) => error.path).sort()).toEqual(['code', 'nickname']);
    unmount();
    errors = await form.submit();
    expect(errors.map((error) => error.path)).toEqual(['code']);
  });

  it('throws when autorun does not converge', () => {
    const effects = defineEffects(({ autorun }) => {
      autorun((d) => {
        d.a.$value = (d.b.$value || 0) + 1;
      });
      autorun((d) => {
        d.b.$value = (d.a.$value || 0) + 1;
      });
    });
    expect(() => createForm({ initialValues: { a: 0, b: 0 }, effects: [effects] })).toThrow(ShikiCycleError);
  });
});
