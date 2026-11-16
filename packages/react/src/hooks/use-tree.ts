import { useContext, useSyncExternalStore } from 'react'
import type { MoveResult, Pos } from '@shikiform/core/internal'
import { ShikiUsageError } from '@shikiform/core/internal'
import { TreeContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps, type DragProps } from './drag'

/** Options shared by {@link useTreeField} and the nearest-tree context. */
export interface TreeOptions {
  childrenKey?: string
  rowKey?: string
}

/**
 * Tree handle. `move(from, to)` uses final `pos` coordinates and refuses a move into a descendant (the result says why).
 * `dragProps(pos)` is the HTML5 drag-and-drop props for the node at that coordinate (source and drop target);
 * dropping node A on node B is `move(A, B)`, so cross-parent moves keep the node id and its field state.
 * Subscribes to structure only. `value` is the current root array (`[]` when the stored value is not an array).
 */
export interface TreeHandle<TNode = unknown> {
  path: string
  value: TNode[]
  /** `to` is the final `pos`. Refuses a move into the node's own descendant. */
  move: (from: Pos, to: Pos) => MoveResult
  /** HTML5 drag-and-drop props for the node at `pos`. Dropping A on B is `move(A, B)`. */
  dragProps: (pos: Pos) => DragProps
}

/**
 * Tree handle for `name`, resolved against the current scope (a repeated scope prefix throws in development).
 * Registers the path into the nearest `FieldGroup`. Same handle {@link useTree} returns inside `<TreeField>`.
 */
export function useTreeField(name: string, opts?: TreeOptions): TreeHandle<unknown> {
  const form = useRequiredForm(`useTreeField('${name}') / <TreeField name="${name}">`)
  const scope = useScope()
  const path = resolveName(form, scope, name)
  useFieldGroupRegistration(path)
  return useTreeAt(path, opts)
}

/**
 * The nearest enclosing tree, no name needed (the tree counterpart of {@link useArray}): inside `<TreeField>`,
 * the same handle {@link useTreeField} returns for that tree. Nested trees resolve to the inner one.
 * Throws outside a tree.
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
export function useTree<TNode = unknown>(): TreeHandle<TNode> {
  const ctx = useContext(TreeContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useTree() must render inside <TreeField> (a node).')
    }
    throw new Error('useTree() must render inside <TreeField>')
  }
  return useTreeAt(ctx.path, { childrenKey: ctx.childrenKey, rowKey: ctx.rowKey }) as TreeHandle<TNode>
}

/** {@link useTreeField} for an absolute path, without field-group registration. */
export function useTreeAt(path: string, opts?: TreeOptions): TreeHandle<unknown> {
  const form = useRequiredForm(`the tree '${path}'`)
  form.registerTree(path, opts)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribeStructure(path, onStoreChange),
    () => form.getStructureVersion(path),
    () => form.getStructureVersion(path),
  )
  void version
  const value = form.getValue(path as never) as unknown
  const dragProps = useDragProps<Pos>(path, (from, to) => form.moveTree(path, from, to), (pos) => pos.join('.'), toPos)
  return {
    path,
    value: Array.isArray(value) ? (value as unknown[]) : [],
    move: (from: Pos, to: Pos): MoveResult => form.moveTree(path, from, to),
    dragProps,
  }
}

function toPos(raw: string): Pos | undefined {
  const pos = raw.split('.').map(Number)
  return pos.every(Number.isInteger) ? pos : undefined
}
