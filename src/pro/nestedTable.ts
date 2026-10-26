// Row-expand nested table (PLAN 3.4): Array<Object<Array<Object>>>.
// Semantics, in one place, so the React component is only a view:
// - Parent rows are Array<Object>; each parent Object holds a child Array.
// - Expand state, row selection and edit drafts are TRANSIENT: they are
//   never submitted, never cleared by collapsing, never rebuilt on paging.
// - A child field's record is its child row object; a parent field's record
//   is the parent row object. No absolute path like
//   'suppliers.0.products.2.price' is ever written by a reaction — helpers
//   below build those paths from (parentIndex, childIndex, field) only.
// - Editing: a row is edited from a transient draft. Save commits the draft
//   (and only then validates, onSubmit timing); Cancel discards the draft.
// - Merged + expanded + edit = full editor: group rows by a merged key,
//   rowspan = group size (a Computed), the merged cell edits the group key
//   once, and each group expands to its own editable child table.
import { validateField, type Rule } from '../core/validation';
import { setByPathDraft } from '../core/types';

export interface ChildRow {
  id: string;
  [key: string]: unknown;
}
export interface ParentRow {
  id: string;
  [key: string]: unknown;
}

/** Transient expand state: a set of expanded parent ids. Pure helpers. */
export type ExpandState = ReadonlySet<string>;

export function toggleExpanded(state: ExpandState, id: string): ExpandState {
  const next = new Set(state);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
export function expandAll(ids: string[]): ExpandState {
  return new Set(ids);
}
export function collapseAll(): ExpandState {
  return new Set();
}

/** Path builders — the ONLY place absolute nested paths are assembled. */
export function parentPath(arrayName: string, parentIndex: number): string {
  return `${arrayName}.${parentIndex}`;
}
export function childPath(
  arrayName: string,
  parentIndex: number,
  childArrayName: string,
  childIndex: number,
): string {
  return `${arrayName}.${parentIndex}.${childArrayName}.${childIndex}`;
}
export function childFieldPath(
  arrayName: string,
  parentIndex: number,
  childArrayName: string,
  childIndex: number,
  field: string,
): string {
  return `${childPath(arrayName, parentIndex, childArrayName, childIndex)}.${field}`;
}

/** Rowspan Computed for a merged parent cell: visible child count. */
export function mergedRowspan(visibleChildCount: number): number {
  return Math.max(1, visibleChildCount);
}

/** Group rows by a merged key (e.g. merged colour). Order of first appearance
 *  is preserved; each group knows its rowspan. */
export function groupByMergedKey<T>(
  rows: T[],
  keyField: string,
): Array<{ key: string; rows: T[]; rowspan: number }> {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const key = String((row as Record<string, unknown>)[keyField] ?? '');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  return [...groups.entries()].map(([key, groupRows]) => ({
    key,
    rows: groupRows,
    rowspan: mergedRowspan(groupRows.length),
  }));
}

/** Rename a merged group key once: every row in the group changes together,
 *  because the merged cell edits the group, not a single row copy. */
export function renameMergedGroup<T>(
  rows: T[],
  keyField: string,
  oldKey: string,
  newKey: string,
): T[] {
  return rows.map((r) =>
    String((r as Record<string, unknown>)[keyField] ?? '') === oldKey
      ? ({ ...r, [keyField]: newKey } as T)
      : r,
  );
}

// ---- Row edit drafts (transient) ----

export type RowDraft = Record<string, Record<string, unknown>>; // rowId -> draft values

export function startRowEdit(draft: RowDraft, rowId: string, row: object): RowDraft {
  return { ...draft, [rowId]: { ...(row as Record<string, unknown>) } };
}
export function updateDraftCell(
  draft: RowDraft,
  rowId: string,
  field: string,
  value: unknown,
): RowDraft {
  const cur = draft[rowId];
  if (!cur) return draft;
  return { ...draft, [rowId]: { ...cur, [field]: value } };
}
export function cancelRowEdit(draft: RowDraft, rowId: string): RowDraft {
  const next = { ...draft };
  delete next[rowId];
  return next;
}

/** Validate a draft row on commit only. Returns per-field errors; empty = ok.
 *  `rowPath` must be an index path (e.g. `suppliers.0.products.1`), never
 *  an id path: the draft row is placed at that path in a copy of `values`,
 *  so a rule reading `ctx.record` sees the draft row itself, and `ctx.root`
 *  sees the whole form with the draft row in place. */
export async function validateDraftRow(
  draftRow: Record<string, unknown>,
  rulesByField: Record<string, Rule[]>,
  values: Record<string, unknown>,
  rowPath: string,
): Promise<Record<string, string[]>> {
  const valuesWithRow: Record<string, unknown> = { ...values };
  setByPathDraft(valuesWithRow, rowPath, draftRow);
  const out: Record<string, string[]> = {};
  for (const [field, rules] of Object.entries(rulesByField)) {
    const errors = await validateField(
      draftRow[field],
      rules.filter((r) => !r.trigger || r.trigger === 'onSubmit'),
      valuesWithRow,
      `${rowPath}.${field}`,
    );
    if (errors.length > 0) out[field] = errors;
  }
  return out;
}

/** Commit a draft row into a parent/child array (immutable). Returns the
 *  new array; caller is responsible for having validated first. */
export function commitDraftRow<T extends Record<string, unknown>>(
  rows: T[],
  rowId: string,
  draftRow: Record<string, unknown>,
): T[] {
  return rows.map((r) => (r.id === rowId ? ({ ...r, ...draftRow } as T) : r));
}
