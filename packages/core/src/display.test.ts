import { describe, expect, it } from 'vitest';
import { createForm, defineEffects } from './index';

describe('display, pattern, submit', () => {
  it('keeps hidden values and still validates them', async () => {
    const form = createForm({
      initialValues: { email: '', name: 'Ada' },
      fields: {
        email: { rules: [{ required: true, message: '请填写邮箱' }] },
      },
      effects: [
        defineEffects<{ email: string; name: string }>(({ autorun }) => {
          autorun((d) => {
            d.email.$display = 'hidden';
          });
        }),
      ],
    });
    expect(form.getDisplay('email')).toBe('hidden');
    expect(form.values).toMatchObject({ email: '', name: 'Ada' });
    const result = await form.submit();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ path: 'email', messages: ['请填写邮箱'] });
    expect(form.getSubmitValues()).toMatchObject({ email: '', name: 'Ada' });
  });

  it('drops display:none values and skips their rules', async () => {
    const form = createForm({
      initialValues: { email: '', name: 'Ada' },
      fields: {
        email: { rules: [{ required: true, message: '请填写邮箱' }] },
      },
    });
    form.batch((d) => {
      d.email.$display = 'none';
    });
    expect(form.getValue('email')).toBeUndefined();
    expect(form.values).toEqual({ name: 'Ada' });
    const result = await form.submit();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values).toEqual({ name: 'Ada' });
  });

  it('cascades none from a parent and keeps a hidden parent validating', async () => {
    const form = createForm({
      initialValues: { account: { name: '' }, note: 'x' },
      fields: {
        'account.name': { rules: [{ required: true, message: '请填写姓名' }] },
      },
    });
    form.batch((d) => {
      d.account.$display = 'hidden';
    });
    expect(form.getDisplay('account.name')).toBe('hidden');
    expect((await form.submit()).ok).toBe(false);
    form.batch((d) => {
      d.account.$display = 'none';
    });
    expect(form.getDisplay('account.name')).toBe('none');
    const result = await form.submit();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.values).toEqual({ note: 'x' });
  });

  it('$visible false is hidden, so the value is kept', () => {
    const form = createForm({
      initialValues: { apiKey: 'sk' },
      effects: [
        defineEffects<{ apiKey: string }>(({ autorun }) => {
          autorun((d) => {
            d.apiKey.$visible = false;
          });
        }),
      ],
    });
    expect(form.getDisplay('apiKey')).toBe('hidden');
    expect(form.getSubmitValues()).toEqual({ apiKey: 'sk' });
  });

  it('inherits pattern and restores it when the override is cleared', () => {
    const form = createForm({
      initialValues: { box: { name: 'n' } },
    });
    form.batch((d) => {
      d.box.$pattern = 'readPretty';
      d.box.name.$pattern = 'editable';
    });
    expect(form.getPattern('box.name')).toBe('editable');
    expect(form.getPattern('box')).toBe('readPretty');
    form.batch((d) => {
      d.box.name.$pattern = undefined;
    });
    expect(form.getPattern('box.name')).toBe('readPretty');
    form.batch((d) => {
      d.box.name.$disabled = true;
    });
    expect(form.getPattern('box.name')).toBe('disabled');
    form.batch((d) => {
      d.box.name.$disabled = false;
    });
    expect(form.getPattern('box.name')).toBe('editable');
  });

  it('omits virtual fields, aggregates subtree errors, and keeps $errors read-only', async () => {
    const form = createForm({
      initialValues: { password: 'secret', confirm: '', address: { city: '' } },
      fields: {
        confirm: { virtual: true, rules: [{ required: true, message: '请确认' }] },
        'address.city': { rules: [{ required: true, message: '请填写城市' }] },
      },
    });
    const result = await form.submit();
    expect(result.ok).toBe(false);
    expect(form.getSubmitValues()).toEqual({ password: 'secret', address: { city: '' } });
    const subtree = form.read((d) => d.address.$errors as string[]);
    expect(subtree).toContain('请填写城市');
    expect(() => form.batch((d: any) => { d.address.city.$errors = []; })).toThrow(/read-only/);
  });

  it('discards a stale async validation result', async () => {
    const pending: Array<(message: string | null) => void> = [];
    const form = createForm({
      initialValues: { name: 'old' },
      fields: {
        name: {
          rules: [
            {
              validator: () =>
                new Promise<string | null>((resolve) => {
                  pending.push(resolve);
                }),
            },
          ],
        },
      },
    });
    const first = form.validate('name');
    await Promise.resolve();
    form.setValue('name', 'new');
    const second = form.validate('name');
    await Promise.resolve();
    expect(pending).toHaveLength(2);
    pending[0]('stale');
    pending[1](null);
    await first;
    await second;
    expect(form.errors).toEqual([]);
  });

  it('merges form-level validate without letting it replace field rules', async () => {
    const form = createForm({
      initialValues: { password: 'a', confirm: 'b' },
      fields: {
        password: { rules: [{ required: true }] },
      },
      validate: (values) => (values.password !== values.confirm ? { confirm: '两次密码不一致' } : undefined),
    });
    const result = await form.submit();
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map((error) => error.path).sort()).toEqual(['confirm']);
    }
  });
});
