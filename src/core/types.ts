// Shiki core: unified Field tree, address vs path, record/array scope.
// Framework-free. Only stable APIs. No React here at all.
export type FieldKind =
  | 'field'
  | 'object'
  | 'array'
  | 'tree'
  | 'void'
  | 'transient'
  | 'computed';

export interface FieldNode {
  id: string;
  kind: FieldKind;
  /** UI-tree address, e.g. "provider.apiKey" — includes VoidField. */
  address: string;
  /** Data path, e.g. "provider.apiKey" — excludes VoidField. null for void/computed. */
  path: string | null;
  name: string;
  visible: boolean;
  disabled: boolean;
  errors: string[];
  children: FieldNode[];
}

export function createNode(
  kind: FieldKind,
  name: string,
  address: string,
  opts: Partial<FieldNode> = {},
): FieldNode {
  return {
    id: address || name || 'root',
    kind,
    address,
    // void / computed carry no submit path by default
    path: kind === 'void' || kind === 'computed' ? null : address || null,
    name,
    visible: true,
    disabled: false,
    errors: [],
    children: [],
    ...opts,
  };
}

/** Get a nested value by dot path. Returns undefined for missing paths. */
export function getByPath(values: Record<string, unknown>, path: string): unknown {
  if (!path) return values;
  return path.split('.').reduce<unknown>((cur, key) => {
    if (cur === null || typeof cur !== 'object') return undefined;
    return (cur as Record<string, unknown>)[key];
  }, values);
}

/** Immutable-ish set helper used inside Immer drafts (mutates draft). Handles arrays by index. */
export function setByPathDraft(
  draft: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const keys = path.split('.');
  let cur: unknown = draft;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    const nextKey = keys[i + 1];
    const parent = cur as Record<string, unknown>;
    if (Array.isArray(parent)) {
      const idx = Number(k);
      if (parent[idx] === null || typeof parent[idx] !== 'object') {
        parent[idx] = /^\d+$/.test(nextKey) ? [] : {};
      }
      cur = parent[idx];
    } else {
      if (parent[k] === null || typeof parent[k] !== 'object') {
        parent[k] = /^\d+$/.test(nextKey) ? [] : {};
      }
      cur = parent[k];
    }
  }
  const last = keys[keys.length - 1];
  if (Array.isArray(cur)) cur[Number(last)] = value;
  else (cur as Record<string, unknown>)[last] = value;
}

export function deleteByPathDraft(draft: Record<string, unknown>, path: string): void {
  const keys = path.split('.');
  let cur: Record<string, unknown> = draft;
  for (let i = 0; i < keys.length - 1; i++) {
    const next = cur[keys[i]];
    if (next === null || typeof next !== 'object') return;
    cur = next as Record<string, unknown>;
  }
  delete cur[keys[keys.length - 1]];
}

/**
 * Scope resolution (PLAN 2.4): structural, not string-based at runtime.
 * record = nearest parent object of `fieldPath` (its parent path's value).
 * array  = nearest array ancestor (first array segment when walking up).
 * For a Tree node, the node itself is an object, so record is that node.
 */
export function recordPathOf(fieldPath: string): string {
  const idx = fieldPath.lastIndexOf('.');
  return idx === -1 ? '' : fieldPath.slice(0, idx);
}

export function recordOf(
  values: Record<string, unknown>,
  fieldPath: string,
): Record<string, unknown> {
  const p = recordPathOf(fieldPath);
  const v = p ? getByPath(values, p) : values;
  return v !== null && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}

/** Tree guard: a node must never move into its own descendant (PLAN 2.2). */
export function isDescendantPath(ancestor: string, candidate: string): boolean {
  return candidate === ancestor || candidate.startsWith(ancestor + '.');
}

export function assertNotMovingIntoDescendant(from: string, toParent: string): void {
  if (isDescendantPath(from, toParent)) {
    throw new Error(`Shiki Tree: cannot move "${from}" into its own descendant "${toParent}"`);
  }
}
