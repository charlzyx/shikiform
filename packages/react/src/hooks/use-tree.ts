import { useContext, useSyncExternalStore } from 'react'
import type { MoveResult, Pos } from '@shikiform/core/internal'
import { ShikiUsageError } from '@shikiform/core/internal'
import { TreeContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps, type DragProps } from './drag'

/** Options for a named {@link useTree}. Omitted keys keep a registration that is already there. */
export interface TreeOptions {
  childrenKey?: string
  rowKey?: string
}

/**
 * Tree handle. Subscribes to structure only. `value` is the current root array (`[]` when the stored value is not an array).
 * `move(from, to)` uses final `pos` coordinates and refuses a move into a descendant (the result says why).
 * `push` / `insert` / `remove` / `replace` edit the tree the same way: field models follow the node id.
 * `dragProps(pos)` is the HTML5 drag-and-drop props for the node at that coordinate (source and drop target);
 * dropping node A on node B is `move(A, B)`.
 */
export interface TreeHandle<TNode = unknown> {
  path: string
  value: TNode[]
  /** Append `node` at the root, or as the last child of `parentPos`. A missing children array is created. */
  push: (node: TNode, parentPos?: Pos) => void
  /** Insert `node` so it sits at `pos`. Later siblings shift. */
  insert: (pos: Pos, node: TNode) => void
  /** Remove the node at `pos`. Its field model is dropped. */
  remove: (pos: Pos) => void
  /** Replace the node at `pos`. The previous node's field model is dropped. */
  replace: (pos: Pos, node: TNode) => void
  /** `to` is the final `pos`. Refuses a move into the node's own descendant. */
  move: (from: Pos, to: Pos) => MoveResult
  /** HTML5 drag-and-drop props for the node at `pos`. Dropping A on B is `move(A, B)`. */
  dragProps: (pos: Pos) => DragProps
}

/**
 * Tree handle.
 *
 * `useTree()` is the nearest `<TreeField>` (the tree counterpart of {@link useArray}). Nested trees resolve to the inner one.
 * Outside a tree it throws.
 *
 * `useTree(name)` resolves `name` against the current scope (a repeated scope prefix throws in development) and
 * registers that path into the nearest `FieldGroup`.
 *
 * The current node is {@link useTreeNode} (`path`, `pos`, `index`). `useIndex()` is the sibling index.
 *
 * ```tsx
 * function MoveFirst() {
 *   const tree = useTree()
 *   const node = useTreeNode()
 *   return <button onClick={() => tree.move(node.pos, [0])}>移到最前</button>
 * }
 * ```
 */
export function useTree<TNode = unknown>(): TreeHandle<TNode>
export function useTree(name: string, opts?: TreeOptions): TreeHandle<unknown>
export function useTree(name?: string, opts?: TreeOptions): TreeHandle<unknown> {
  const ctx = useContext(TreeContext)
  const scope = useScope()
  if (name == null && !ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useTree() must render inside <TreeField> (a node).')
    }
    throw new Error('useTree() must render inside <TreeField>')
  }
  const form = useRequiredForm(name != null ? `useTree('${name}') / <TreeField name="${name}">` : 'useTree()')
  let path: string | undefined
  if (name != null) path = resolveName(form, scope, name)
  else path = ctx?.path
  const options = name != null ? opts : { childrenKey: ctx?.childrenKey, rowKey: ctx?.rowKey }
  useFieldGroupRegistration(name != null ? path : undefined)
  return useTreeAt(path ?? null, options)
}

/** {@link useTree} for an absolute path, without field-group registration. `null` subscribes to nothing. */
export function useTreeAt(path: string | null, opts?: TreeOptions): TreeHandle<unknown> {
  const form = useRequiredForm(path ? `the tree '${path}'` : 'useTree()')
  if (path) form.registerTree(path, opts)
  const version = useSyncExternalStore(
    (onStoreChange) => (path ? form.subscribeStructure(path, onStoreChange) : () => {}),
    () => (path ? form.getStructureVersion(path) : 0),
    () => (path ? form.getStructureVersion(path) : 0),
  )
  void version
  const value = path ? form.getValue(path as never) as unknown : undefined
  const dragProps = useDragProps<Pos>(path ?? '', (from, to) => { if (path) form.moveTree(path, from, to) }, (pos) => pos.join('.'), toPos)
  const at = path ?? ''
  return {
    path: at,
    value: Array.isArray(value) ? (value as unknown[]) : [],
    push: (node: unknown, parentPos?: Pos) => { if (path) form.pushTree(path, node, parentPos) },
    insert: (pos: Pos, node: unknown) => { if (path) form.insertTree(path, pos, node) },
    remove: (pos: Pos) => { if (path) form.removeTree(path, pos) },
    replace: (pos: Pos, node: unknown) => { if (path) form.replaceTree(path, pos, node) },
    move: (from: Pos, to: Pos): MoveResult => (path ? form.moveTree(path, from, to) : { ok: false }),
    dragProps,
  }
}

function toPos(raw: string): Pos | undefined {
  const pos = raw.split('.').map(Number)
  return pos.every(Number.isInteger) ? pos : undefined
}
