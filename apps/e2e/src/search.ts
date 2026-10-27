import type { ShikiForm } from '@shikiform/react';

/** Snapshot the draft fields, reset to page 1, and bump the fetch counter. */
export function commitSearch(form: ShikiForm, fields: string[]): void {
  form.batch((draft) => {
    const d = draft as any;
    const query: Record<string, unknown> = {};
    for (const field of fields) {
      let cursor: any = d;
      for (const part of field.split('.')) cursor = cursor[part];
      query[field] = cursor.$value;
    }
    d.submitted.$value = query;
    d.page.$value = 1;
    d.selectedKeys.$value = [];
    d.searchSeq.$value = Number(d.searchSeq.$value ?? 0) + 1;
  });
}

/** Restore the initial draft, then bump searchSeq so the table refetches the empty query. */
export function resetSearch(form: ShikiForm): void {
  const next = Number(form.getValue('searchSeq') ?? 0) + 1;
  form.reset();
  form.setValue('searchSeq', next);
}
