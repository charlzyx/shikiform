import { getAt } from './path';
import type { Pos } from './types';

export function posKey(pos: Pos): string {
  return pos.join('-');
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i]);
}

/** True when `pos` starts with `prefix` (equal counts as a prefix). */
export function isPosPrefix(prefix: Pos, pos: Pos): boolean {
  if (pos.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== pos[i]) return false;
  return true;
}

/** True when `pos` is strictly inside `ancestor` (a descendant, not the node itself). */
export function isPosInside(ancestor: Pos, pos: Pos): boolean {
  return pos.length > ancestor.length && isPosPrefix(ancestor, pos);
}

export function pathOf(base: string, pos: Pos, childrenKey = 'children'): string {
  let path = base;
  for (let i = 0; i < pos.length; i++) {
    path = path ? `${path}.${pos[i]}` : String(pos[i]);
    if (i < pos.length - 1) path = `${path}.${childrenKey}`;
  }
  return path;
}

export function posFromPath(path: string, childrenKey = 'children'): number[] | undefined {
  if (!path) return undefined;
  const parts = path.split('.');
  let i = 0;
  while (i < parts.length && !/^\d+$/.test(parts[i])) {
    if (parts[i] === childrenKey) return undefined;
    i++;
  }
  if (i >= parts.length) return undefined;
  const pos: number[] = [];
  for (; i < parts.length; i++) {
    if (!/^\d+$/.test(parts[i])) return undefined;
    pos.push(Number(parts[i]));
    if (i + 1 < parts.length) {
      if (parts[i + 1] !== childrenKey) return undefined;
      i++;
    }
  }
  return pos;
}

export function findPos<T>(
  nodes: readonly T[] | undefined,
  pred: (node: T, pos: Pos) => boolean,
  childrenKey = 'children',
): number[] | undefined {
  if (!Array.isArray(nodes)) return undefined;
  const walk = (list: readonly any[], prefix: number[]): number[] | undefined => {
    for (let i = 0; i < list.length; i++) {
      const pos = [...prefix, i];
      const node = list[i];
      if (pred(node, pos)) return pos;
      const children = node?.[childrenKey];
      if (Array.isArray(children)) {
        const found = walk(children, pos);
        if (found) return found;
      }
    }
    return undefined;
  };
  return walk(nodes, []);
}

function parentList(nodes: any[], pos: Pos, childrenKey: string): { list: any[]; index: number } {
  let list = nodes;
  for (let depth = 0; depth < pos.length - 1; depth++) {
    const node = list[pos[depth]];
    if (node == null || typeof node !== 'object') {
      throw new Error(`Cannot move through missing node at ${posKey(pos.slice(0, depth + 1))}`);
    }
    if (!Array.isArray(node[childrenKey])) node[childrenKey] = [];
    list = node[childrenKey];
  }
  return { list, index: pos[pos.length - 1] };
}

/**
 * Move a node so that its position in the resulting tree is `to`.
 * `to` is the final coordinate (the engine removes the node first, then inserts).
 * Moving a node into itself or its descendant throws.
 */
export function moveTree<T>(nodes: T[], from: Pos, to: Pos, childrenKey = 'children'): T[] {
  if (samePos(from, to)) return nodes;
  // `to` is the coordinate after the source is removed. A prefix match is a descendant
  // only when that node already exists under the source; otherwise it is the final slot
  // (for example [0] → [0, 0] makes the moved node the first child of whoever lands at 0).
  if (isPosInside(from, to) && getNode(nodes, to, childrenKey) !== undefined) {
    throw new Error(`Cannot move a node into its own descendant: ${posKey(from)} → ${posKey(to)}`);
  }
  const clone = nodes.map((node) => cloneNode(node)) as T[];
  const { list, index } = parentList(clone as any[], from, childrenKey);
  if (index < 0 || index >= list.length) {
    throw new Error(`Move source does not exist: ${posKey(from)}`);
  }
  const [node] = list.splice(index, 1);
  const dest = parentList(clone as any[], to, childrenKey);
  if (dest.index < 0 || dest.index > dest.list.length) {
    throw new Error(`Move target is out of range: ${posKey(to)}`);
  }
  dest.list.splice(dest.index, 0, node);
  return clone;
}

function cloneNode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => cloneNode(item));
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as object)) out[key] = cloneNode((value as Record<string, unknown>)[key]);
    return out;
  }
  return value;
}

export function getNode<T>(nodes: readonly T[] | undefined, pos: Pos, childrenKey = 'children'): T | undefined {
  return getAt(nodes, pathOf('', pos, childrenKey)) as T | undefined;
}

export function listPositions(nodes: unknown, childrenKey = 'children', prefix: number[] = []): number[][] {
  if (!Array.isArray(nodes)) return [];
  const out: number[][] = [];
  nodes.forEach((node, index) => {
    const pos = [...prefix, index];
    out.push(pos);
    const children = node && typeof node === 'object' ? (node as Record<string, unknown>)[childrenKey] : undefined;
    out.push(...listPositions(children, childrenKey, pos));
  });
  return out;
}

export function structureSig(value: unknown, childrenKey = 'children'): string {
  if (!Array.isArray(value)) return '';
  return value
    .map((node) => {
      const children = node && typeof node === 'object' ? (node as Record<string, unknown>)[childrenKey] : undefined;
      return `(${structureSig(children, childrenKey)})`;
    })
    .join('|');
}

/** Final position after indent: become the last child of the previous sibling. */
export function indentTarget(nodes: unknown, pos: Pos, childrenKey = 'children'): number[] | null {
  if (!pos.length) return null;
  const index = pos[pos.length - 1];
  if (index <= 0) return null;
  const parentPos = pos.slice(0, -1);
  const prev = getNode(nodes as any[], [...parentPos, index - 1], childrenKey) as Record<string, unknown> | undefined;
  const childCount = Array.isArray(prev?.[childrenKey]) ? (prev![childrenKey] as unknown[]).length : 0;
  return [...parentPos, index - 1, childCount];
}

/** Final position after outdent: become the next sibling of the parent. */
export function outdentTarget(pos: Pos): number[] | null {
  if (pos.length < 2) return null;
  const parentPos = pos.slice(0, -1);
  const parentIndex = parentPos[parentPos.length - 1];
  return [...parentPos.slice(0, -1), parentIndex + 1];
}
