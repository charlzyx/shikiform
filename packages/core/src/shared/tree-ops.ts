import { formatMessage, type FormMessages } from '../validation/messages'
import { getAt } from './path'

/** Index path of a tree node. Depth is `pos.length`. The last entry is the sibling index. */
export type Pos = readonly number[]

/** Stable string for a `pos`, used as a React key when a node has no id. `posKey([0, 2])` is `'0.2'`. */
export function posKey(pos: Pos): string {
  return pos.join('.')
}

/** True when both index paths are the same length and the same indexes. */
export function samePos(a: Pos, b: Pos): boolean {
  return a.length === b.length && a.every((n, i) => n === b[i])
}

/** True when `pos` is `prefix` or a node inside that subtree. */
export function isPosPrefix(prefix: Pos, pos: Pos): boolean {
  if (prefix.length > pos.length) return false
  for (let i = 0; i < prefix.length; i++) if (prefix[i] !== pos[i]) return false
  return true
}

/**
 * Data path of a node.
 * `pathOf('menus', [0, 2, 1])` → `menus.0.children.2.children.1`.
 */
export function pathOf(root: string, pos: Pos, childrenKey = 'children'): string {
  let path = root
  for (let i = 0; i < pos.length; i++) {
    path += `.${pos[i]}`
    if (i < pos.length - 1) path += `.${childrenKey}`
  }
  return path
}

/** Inverse of {@link pathOf}. Returns `undefined` when `path` is not under `root`. */
export function posOf(root: string, path: string, childrenKey = 'children'): Pos | undefined {
  if (path === root) return []
  if (!path.startsWith(root + '.')) return undefined
  const parts = path.slice(root.length + 1).split('.')
  const pos: number[] = []
  for (let i = 0; i < parts.length; i++) {
    if (i % 2 === 0) {
      if (!/^\d+$/.test(parts[i]!)) return undefined
      pos.push(Number(parts[i]))
    } else if (parts[i] !== childrenKey) {
      return undefined
    }
  }
  return pos
}

/**
 * First `pos` whose node matches `pred`, walking depth-first.
 * `childrenKey` defaults to `'children'`. Returns `undefined` when nothing matches.
 */
export function findPos(
  nodes: unknown,
  pred: (node: any, pos: Pos) => boolean,
  childrenKey = 'children',
  prefix: number[] = [],
): Pos | undefined {
  if (!Array.isArray(nodes)) return undefined
  for (let i = 0; i < nodes.length; i++) {
    const pos = [...prefix, i]
    const node = nodes[i]
    if (pred(node, pos)) return pos
    const children = node && typeof node === 'object' ? (node as Record<string, unknown>)[childrenKey] : undefined
    const nested = findPos(children, pred, childrenKey, pos)
    if (nested) return nested
  }
  return undefined
}

/** Node at `pos`, or `undefined` when the path walks off the tree. The node is untyped. */
export function getNode(nodes: unknown, pos: Pos, childrenKey = 'children'): any {
  let list = nodes as any[]
  let node: any
  for (let d = 0; d < pos.length; d++) {
    if (!Array.isArray(list)) return undefined
    node = list[pos[d]!]
    if (d < pos.length - 1) list = node?.[childrenKey]
  }
  return node
}

/** Result of {@link moveNode}. `tree` is a new array when `ok`. The input is not mutated. */
export interface TreeMoveResult {
  ok: boolean
  /** Next tree when `ok`. The input tree is not mutated. */
  tree?: any[]
  reason?: string
}

export interface CanMoveArgs {
  from: Pos
  to: Pos
  node: any
  toParent: any
}

/**
 * Move `from` so that its final coordinate is `to`.
 * `to` is the index path **after** the move (not the pre-removal insertion slot).
 * Moving a node into itself or its descendant is refused. Refusal reasons come from `messages` (`treeIntoSelf` …),
 * then the app defaults.
 */
export function moveNode(
  nodes: any[],
  from: Pos,
  to: Pos,
  childrenKey = 'children',
  canMove?: (args: CanMoveArgs) => string | null | undefined,
  messages?: Partial<FormMessages>,
): TreeMoveResult {
  const refuse = (key: 'treeEmptyPos' | 'treeIntoSelf' | 'treeSourceMissing' | 'treeTargetMissing'): TreeMoveResult => ({
    ok: false,
    reason: formatMessage(messages, key, { from, to }),
  })
  if (!from.length || !to.length) return refuse('treeEmptyPos')
  if (isPosPrefix(from, to)) return refuse('treeIntoSelf')
  const node = getNode(nodes, from, childrenKey)
  if (node == null) return refuse('treeSourceMissing')
  const parentPos = to.slice(0, -1)
  if (parentPos.length && isPosPrefix(from, parentPos)) return refuse('treeIntoSelf')
  if (canMove) {
    const toParent = parentPos.length ? getNode(nodes, parentPos, childrenKey) : null
    const reason = canMove({ from, to, node, toParent })
    if (reason) return { ok: false, reason }
  }
  const removed = removeNode(nodes, from, childrenKey)
  if (!removed) return refuse('treeSourceMissing')
  const parentList = parentListOf(removed.tree, to, childrenKey)
  if (!parentList) return refuse('treeTargetMissing')
  const index = Math.min(Math.max(to[to.length - 1]!, 0), parentList.length)
  parentList.splice(index, 0, removed.node)
  return { ok: true, tree: removed.tree }
}

/**
 * Insert `node` so it sits at `pos` (siblings at that index and after shift).
 * A missing `children` array on an existing parent is created. Returns `undefined` when `pos` is empty or the parent is missing.
 * The input tree is not mutated.
 */
export function insertNode(nodes: any[], pos: Pos, node: unknown, childrenKey = 'children'): any[] | undefined {
  if (!pos.length) return undefined
  const tree = cloneNodes(nodes)
  const parent = ensureParentList(tree, pos, childrenKey)
  if (!parent) return undefined
  const index = Math.min(Math.max(pos[pos.length - 1]!, 0), parent.length)
  parent.splice(index, 0, node)
  return tree
}

/**
 * Append `node` at the root, or as the last child of `parentPos`.
 * A missing `children` array on an existing parent is created. Returns `undefined` when `parentPos` does not name a node.
 * The input tree is not mutated.
 */
export function pushNode(nodes: any[], node: unknown, parentPos: Pos | undefined, childrenKey = 'children'): any[] | undefined {
  const tree = cloneNodes(nodes)
  if (!parentPos?.length) {
    tree.push(node)
    return tree
  }
  const parent = getNode(tree, parentPos, childrenKey)
  if (!parent || typeof parent !== 'object') return undefined
  const list = (parent as Record<string, unknown>)[childrenKey]
  if (Array.isArray(list)) list.push(node)
  else if (list == null) (parent as Record<string, unknown>)[childrenKey] = [node]
  else return undefined
  return tree
}

/** Remove the node at `pos`. Returns `undefined` when `pos` is empty or does not name a node. The input tree is not mutated. */
export function deleteNode(nodes: any[], pos: Pos, childrenKey = 'children'): any[] | undefined {
  return removeNode(nodes, pos, childrenKey)?.tree
}

/** Replace the node at `pos`. Returns `undefined` when `pos` does not name a node. The input tree is not mutated. */
export function replaceNode(nodes: any[], pos: Pos, node: unknown, childrenKey = 'children'): any[] | undefined {
  if (!pos.length) return undefined
  const tree = cloneNodes(nodes)
  const parent = parentListOf(tree, pos, childrenKey)
  if (!parent) return undefined
  const index = pos[pos.length - 1]!
  if (index < 0 || index >= parent.length) return undefined
  parent[index] = node
  return tree
}

function removeNode(
  nodes: any[],
  pos: Pos,
  childrenKey: string,
): { tree: any[]; node: any } | undefined {
  const tree = cloneNodes(nodes)
  const parent = parentListOf(tree, pos, childrenKey)
  if (!parent) return undefined
  const index = pos[pos.length - 1]!
  if (index < 0 || index >= parent.length) return undefined
  const [node] = parent.splice(index, 1)
  return { tree, node }
}

/** Parent list of `pos`, creating a missing children array when the parent node exists. */
function ensureParentList(nodes: any[], pos: Pos, childrenKey: string): any[] | undefined {
  if (pos.length === 1) return nodes
  const parent = getNode(nodes, pos.slice(0, -1), childrenKey)
  if (!parent || typeof parent !== 'object') return undefined
  const list = (parent as Record<string, unknown>)[childrenKey]
  if (Array.isArray(list)) return list
  if (list != null) return undefined
  const created: unknown[] = []
  ;(parent as Record<string, unknown>)[childrenKey] = created
  return created
}

function parentListOf(nodes: any[], pos: Pos, childrenKey: string): any[] | undefined {
  if (pos.length === 1) return nodes
  const parent = getNode(nodes, pos.slice(0, -1), childrenKey)
  const list = parent?.[childrenKey]
  return Array.isArray(list) ? list : undefined
}

function cloneNodes(nodes: any[]): any[] {
  if (typeof structuredClone === 'function') return structuredClone(nodes)
  return JSON.parse(JSON.stringify(nodes))
}

/** Where each row id sits, using `rowKey` (default `id`). */
export function locateIds(
  nodes: unknown,
  root: string,
  childrenKey: string,
  rowKey: string,
  prefix: number[] = [],
  out = new Map<string, string>(),
): Map<string, string> {
  if (!Array.isArray(nodes)) return out
  nodes.forEach((node, i) => {
    const pos = [...prefix, i]
    const path = pathOf(root, pos, childrenKey)
    const id = node && typeof node === 'object' ? (node as Record<string, unknown>)[rowKey] : undefined
    if (id != null) out.set(String(id), path)
    const children = node && typeof node === 'object' ? (node as Record<string, unknown>)[childrenKey] : undefined
    if (Array.isArray(children)) locateIds(children, root, childrenKey, rowKey, pos, out)
  })
  return out
}

/**
 * Every node as `{ id, pos, path }`.
 * `id` is `rowKey` when the node has one, otherwise {@link posKey}.
 * `path` is the index path from {@link pathOf}.
 */
export function listPositions(
  nodes: unknown,
  root: string,
  childrenKey: string,
  rowKey: string,
  prefix: number[] = [],
  out: { id: string; pos: number[]; path: string }[] = [],
): { id: string; pos: number[]; path: string }[] {
  if (!Array.isArray(nodes)) return out
  nodes.forEach((node, i) => {
    const pos = [...prefix, i]
    const path = pathOf(root, pos, childrenKey)
    const raw = node && typeof node === 'object' ? (node as Record<string, unknown>)[rowKey] : undefined
    const id = raw == null ? posKey(pos) : String(raw)
    out.push({ id, pos, path })
    const children = node && typeof node === 'object' ? (node as Record<string, unknown>)[childrenKey] : undefined
    if (Array.isArray(children)) listPositions(children, root, childrenKey, rowKey, pos, out)
  })
  return out
}

/** Final index of each old index after `move(from, to)` with final-index semantics. */
export function mapMoveIndex(index: number, from: number, to: number): number {
  if (index === from) return to
  if (from < to && index > from && index <= to) return index - 1
  if (from > to && index >= to && index < from) return index + 1
  return index
}

export function readRowId(row: unknown, index: number, rowKey?: string): string {
  if (row && typeof row === 'object') {
    const rec = row as Record<string, unknown>
    if (rowKey && rec[rowKey] != null) return String(rec[rowKey])
    if (rec.id != null) return String(rec.id)
  }
  return `#${index}`
}

export function scopeOf(path: string): {
  recordPath: string
  arrayPath: string
  index: number
  parentPath: string
} {
  const parts = path ? path.split('.') : []
  for (let i = parts.length - 1; i >= 0; i--) {
    if (!/^\d+$/.test(parts[i]!)) continue
    const index = Number(parts[i])
    const arrayPath = parts.slice(0, i).join('.')
    const recordPath = parts.slice(0, i + 1).join('.')
    let parent = ''
    for (let j = i - 1; j >= 0; j--) {
      if (/^\d+$/.test(parts[j]!)) {
        parent = parts.slice(0, j + 1).join('.')
        break
      }
    }
    if (!parent) {
      const dot = arrayPath.lastIndexOf('.')
      parent = dot >= 0 ? arrayPath.slice(0, dot) : ''
    }
    return { recordPath, arrayPath, index, parentPath: parent }
  }
  const dot = path.lastIndexOf('.')
  return { recordPath: dot >= 0 ? path.slice(0, dot) : '', arrayPath: '', index: -1, parentPath: '' }
}

export function valueAt(root: unknown, path: string): unknown {
  return getAt(root, path)
}
