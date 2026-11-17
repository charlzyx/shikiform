import { useCallback, useContext, useSyncExternalStore } from 'react'
import type { Draft, MoveResult, Pos } from '@shikiform/core/internal'
import { ShikiUsageError } from '@shikiform/core/internal'
import { TreeContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps, type DragProps } from './drag'
import { useWatch } from './use-watch'

/** Options for a named {@link useTreeField}. Omitted keys keep a registration that is already there. */
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
/** Edits on one tree. `path` is the tree root. Field models follow the node id. */
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
 * `useTreeField()` inside a node: the current node plus the same tree edits.
 * `path` / `pos` / `index` / `record` are this node. `treePath` / `value` are the enclosing tree.
 * `dragProps()` with no argument targets this node.
 */
export interface TreeNodeHandle<TNode = unknown> extends TreeHandle<TNode> {
  /** This node's path (`items.0.children.1`), not the tree root. */
  path: string
  pos: Pos
  index: number
  record: TNode
  /** The tree root this node belongs to. */
  treePath: string
  dragProps: (pos?: Pos) => DragProps
}

/**
 * One tree hook.
 *
 * `useTreeField(name)` resolves `name` against the current scope and returns the tree
 * (`path` is the root). It registers that path into the nearest `FieldGroup`.
 *
 * `useTreeField()` takes the nearest `<TreeField>` node: `path`, `pos`, `index`, `record`,
 * and the tree's `push` / `insert` / `remove` / `replace` / `move` / `dragProps`.
 * Outside a node it throws.
 */
export function useTreeField<TNode = unknown>(): TreeNodeHandle<TNode>
export function useTreeField(name: string, opts?: TreeOptions): TreeHandle<unknown>
export function useTreeField(name?: string, opts?: TreeOptions): TreeHandle<unknown> | TreeNodeHandle<unknown> {
  const ctx = useContext(TreeContext)
  const scope = useScope()
  if (name == null && !scope.pos) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useTreeField() must render inside a tree node (<TreeField>).')
    }
    throw new Error('useTreeField() must render inside a tree node (<TreeField>)')
  }
  const form = useRequiredForm(name != null ? `useTreeField('${name}') / <TreeField name="${name}">` : 'useTreeField()')
  const treePath = name != null ? resolveName(form, scope, name) : (ctx?.path ?? form.treeRoot(scope.path) ?? scope.path)
  const options = name != null ? opts : { childrenKey: ctx?.childrenKey, rowKey: ctx?.rowKey }
  useFieldGroupRegistration(name != null ? treePath : undefined)
  // A node does not subscribe to the whole tree. TreeField (the named hook) repaints structure;
  // this node re-renders when its own record or position changes, so a sibling move leaves it mounted.
  const tree = useTreeAt(treePath, options, name != null)
  const nodePath = name == null ? scope.path : ''
  const record = useWatch(useCallback((d: Draft<any>) => (nodePath ? form.query(nodePath).$value : undefined), [form, nodePath]))
  const pos = scope.pos as Pos | undefined
  const nodeDrag = useCallback((at?: Pos) => tree.dragProps(at ?? pos ?? []), [tree.dragProps, pos])
  if (name != null) return tree
  return {
    ...tree,
    path: scope.path,
    treePath: tree.path,
    pos: pos ?? [],
    index: pos ? (pos[pos.length - 1] ?? scope.index) : scope.index,
    record,
    dragProps: nodeDrag,
  }
}

/**
 * {@link useTreeField} for an absolute path, without field-group registration. `null` subscribes to nothing.
 * `subscribe` is false for the current node: structure paints from the named tree hook, and this call
 * only reads the value at render time.
 */
export function useTreeAt(path: string | null, opts?: TreeOptions, subscribe = true): TreeHandle<unknown> {
  const form = useRequiredForm(path ? `the tree '${path}'` : 'useTreeField()')
  if (path) form.registerTree(path, opts)
  const version = useSyncExternalStore(
    (onStoreChange) => (path && subscribe ? form.subscribeStructure(path, onStoreChange) : () => {}),
    () => (path && subscribe ? form.getStructureVersion(path) : 0),
    () => (path && subscribe ? form.getStructureVersion(path) : 0),
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
