import { describe, expect, it } from 'vitest';
import { createForm, defineEffects, ShikiConflictError, ShikiCycleError } from './index';

describe('reactions', () => {
  it('tracks reads and ignores unchanged writes', () => {
    let runs = 0;
    const form = createForm({
      initialValues: { type: 'ollama', apiKey: 'secret' },
      effects: [
        defineEffects<{ type: string; apiKey: string }>(({ autorun }) => {
          autorun((d) => {
            runs += 1;
            d.apiKey.$visible = d.type.$value !== 'ollama';
          });
        }),
      ],
    });
    expect(form.getDisplay('apiKey')).toBe('hidden');
    expect(runs).toBe(1);
    form.setValue('apiKey', 'secret');
    expect(runs).toBe(1);
    form.setValue('type', 'openai');
    expect(form.getDisplay('apiKey')).toBe('visible');
    expect(form.getValue('apiKey')).toBe('secret');
    expect(runs).toBe(2);
  });

  it('computes row totals with autorun.each and does not submit them by default', () => {
    const form = createForm({
      initialValues: {
        items: [
          { price: 2, qty: 4, total: 0 },
          { price: 1, qty: 5, total: 0 },
        ],
      },
      effects: [
        defineEffects<{ items: { price: number; qty: number; total: number }[] }>(({ autorun }) => {
          autorun.each(
            (d) => d.items,
            (row) => {
              const total = Number(row.price.$value) * Number(row.qty.$value);
              row.total.$value = total;
            },
          );
        }),
      ],
    });
    expect(form.getValue('items.0.total')).toBe(8);
    expect(form.getValue('items.1.total')).toBe(5);
    form.setValue('items.1.qty', 7);
    expect(form.getValue('items.1.total')).toBe(7);
    expect(form.getValue('items.0.total')).toBe(8);
    form.push('items', { price: 3, qty: 3, total: 0 });
    expect(form.getValue('items.2.total')).toBe(9);
    expect(form.getSubmitValues().items[0]).not.toHaveProperty('total');
  });

  it('walks every tree node and exposes pos', () => {
    const seen: string[] = [];
    const form = createForm({
      initialValues: {
        menus: [
          { title: 'A', children: [{ title: 'A1', children: [] }] },
          { title: 'B', children: [] },
        ],
      },
      effects: [
        defineEffects<{ menus: { title: string; children: unknown[]; label?: string }[] }>(({ autorun }) => {
          autorun.walk(
            (d) => d.menus,
            (node) => {
              const pos = node.$pos as number[];
              seen.push(pos.join('.'));
              node.label.$value = `${node.title.$value}:${pos.join('-')}`;
            },
          );
        }),
      ],
    });
    expect(seen.sort()).toEqual(['0', '0.0', '1']);
    expect(form.getValue('menus.0.label')).toBe('A:0');
    expect(form.getValue('menus.0.children.0.label')).toBe('A1:0-0');
    form.setValue('menus.1.title', 'Bee');
    expect(form.getValue('menus.1.label')).toBe('Bee:1');
  });

  it('runs watch on change, not on init, including multi-source selectors', () => {
    const log: string[] = [];
    const form = createForm({
      initialValues: { keyword: '', status: '', page: 4 },
      effects: [
        defineEffects<{ keyword: string; status: string; page: number }>(({ watch }) => {
          watch(
            (d) => d.keyword,
            (d) => {
              log.push('keyword');
              d.page.$value = 1;
            },
          );
          watch(
            (d) => [d.keyword.$value, d.status.$value],
            () => {
              log.push('either');
            },
          );
        }),
      ],
    });
    expect(log).toEqual([]);
    expect(form.getValue('page')).toBe(4);
    form.setValue('status', 'open');
    expect(log).toEqual(['either']);
    expect(form.getValue('page')).toBe(4);
    form.setValue('keyword', 'row');
    expect(form.getValue('page')).toBe(1);
    expect(log).toEqual(['either', 'keyword', 'either']);
  });

  it('batches writes into one notification', () => {
    const form = createForm({ initialValues: { a: 0, b: 0 } });
    let notifications = 0;
    form.subscribe(() => {
      notifications += 1;
    });
    form.batch((d) => {
      d.a.$value = 1;
      d.b.$value = 2;
    });
    expect(form.values).toMatchObject({ a: 1, b: 2 });
    expect(notifications).toBe(1);
  });

  it('treats a whole-array read as a dependency on the array', () => {
    let runs = 0;
    const form = createForm({
      initialValues: { items: [{ n: 1 }], count: 0 },
      effects: [
        defineEffects<{ items: { n: number }[]; count: number }>(({ autorun }) => {
          autorun((d) => {
            runs += 1;
            d.count.$value = d.items.$value.length;
          });
        }),
      ],
    });
    expect(runs).toBe(1);
    form.setValue('items.0.n', 2);
    expect(runs).toBe(2);
    expect(form.getValue('count')).toBe(1);
  });

  it('rejects two autoruns writing the same state', () => {
    expect(() =>
      createForm({
        initialValues: { a: 0 },
        effects: [
          defineEffects<{ a: number }>(({ autorun }) => {
            autorun((d) => {
              d.a.$value = 1;
            });
            autorun((d) => {
              d.a.$value = 2;
            });
          }),
        ],
      }),
    ).toThrow(ShikiConflictError);
  });

  it('reports a cycle when reactions never settle', () => {
    expect(() =>
      createForm({
        initialValues: { a: 0, b: 0 },
        effects: [
          defineEffects<{ a: number; b: number }>(({ autorun }) => {
            autorun((d) => {
              d.a.$value = Number(d.b.$value) + 1;
            });
            autorun((d) => {
              d.b.$value = Number(d.a.$value) + 1;
            });
          }),
        ],
      }),
    ).toThrow(ShikiCycleError);
  });

  it('copies a row into its own reaction instance', () => {
    const form = createForm({
      initialValues: { items: [{ id: 'a', price: 2, qty: 4, total: 0 }] },
      effects: [
        defineEffects<{ items: { id: string; price: number; qty: number; total: number }[] }>(({ autorun }) => {
          autorun.each(
            (d) => d.items,
            (row) => {
              row.total.$value = Number(row.price.$value) * Number(row.qty.$value);
            },
          );
        }),
      ],
    });
    expect(form.getValue('items.0.total')).toBe(8);
    form.copyArrayItem('items', 0);
    expect(form.getValue('items.1.id')).toBe('a-copy');
    expect(form.getValue('items.1.total')).toBe(8);
    form.setValue('items.1.qty', 3);
    expect(form.getValue('items.1.total')).toBe(6);
    expect(form.getValue('items.0.total')).toBe(8);
    expect(form.getValue('items.0.qty')).toBe(4);
  });

  it('passes a module handle without giving the module the form root', () => {
    function priceRules(row: { price: { $value: number }; qty: { $value: number }; total: { $value: number } }) {
      row.total.$value = Number(row.price.$value) * Number(row.qty.$value);
    }
    const form = createForm({
      initialValues: { line: { price: 5, qty: 2, total: 0 } },
      effects: [
        defineEffects<{ line: { price: number; qty: number; total: number } }>(({ autorun }) => {
          autorun((d) => priceRules(d.line));
        }),
      ],
    });
    expect(form.getValue('line.total')).toBe(10);
  });
});
