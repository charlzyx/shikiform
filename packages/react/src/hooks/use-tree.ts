import type { Draft, MoveResult, Pos } from '@shikiform/core/internal'
import { deepEqual, ShikiUsageError } from '@shikiform/core/internal'
import { useCallback, useContext, useMemo, useRef, useSyncExternalStore } from '../compat/react-compat'
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
 * Edits on one tree. Field models follow the node id.
 * `path` is always the thing this handle points at: the tree root for `useTreeField(name)`, the current node for `useTreeField()`.
 * `treePath` is always the tree root (same as `path` on a root handle).
 * `errors` / `warnings` are that path's own messages, not descendant fields.
 * `value` is the current root array (`[]` when the stored value is not an array).
 * `move(from, to)` uses final `pos` coordinates and refuses a move into a descendant (the result says why).
 * `dragProps(pos)` is the HTML5 drag-and-drop props for the node at that coordinate; dropping A on B is `move(A, B)`.
 * The edit methods and `dragProps` keep one identity per form + path; the handle object is new each render.
 */
export interface TreeHandle<TNode = unknown> {
  /** What this handle points at. Root handle: the tree root. Node handle: the current node. */
  path: string
  /** The tree root. Equal to `path` on a root handle. */
  treePath: string
  /** This path's own messages. Descendant fields are not included. */
  errors: readonly string[]
  warnings: readonly string[]
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
 * `path` is this node's path (`items.0.children.1`). `treePath` is the tree root.
 * `errors` / `warnings` are this node's own messages. `value` is the enclosing tree.
 * `dragProps()` with no argument targets this node.
 */
export interface TreeNodeHandle<TNode = unknown> extends TreeHandle<TNode> {
  /** This node's path, not the tree root. */
  path: string
  pos: Pos
  index: number
  record: TNode
  treePath: string
  dragProps: (pos?: Pos) => DragProps
}

/**
 * One tree hook.
 *
 * `useTreeField(name)` resolves `name` against the current scope and returns the tree.
 * `path` and `treePath` are both the root. It registers that path into the nearest `FieldGroup`.
 *
 * `useTreeField()` takes the nearest `<TreeField>` node: `path` is the node, `treePath` is the root,
 * plus `pos`, `index`, `record`, and the tree's `push` / `insert` / `remove` / `replace` / `move` / `dragProps`.
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
  // A node does not subscribe to the whole tree. `<TreeField>` repaints structure and keeps
  // unchanged sibling elements; this node re-renders when its own record or position changes.
  const tree = useTreeAt(treePath, options, name != null)
  const nodePath = name == null ? scope.path : ''
  const own = useOwnMessages(nodePath || null)
  const record = useWatch(useCallback((d: Draft<any>) => (nodePath ? form.query(nodePath).$value : undefined), [form, nodePath]))
  const pos = scope.pos as Pos | undefined
  const posRef = useRef(pos)
  posRef.current = pos
  const nodeDrag = useCallback((at?: Pos) => tree.dragProps(at ?? posRef.current ?? []), [tree.dragProps])
  if (name != null) return tree
  return {
    ...tree,
    path: scope.path,
    treePath: tree.treePath,
    errors: own.errors,
    warnings: own.warnings,
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
  const messages = useOwnMessages(subscribe ? path : null)
  const at = path ?? ''
  // One identity per form + path (design/API-CONVENTIONS.md §1).
  const ops = useMemo(() => ({
    push: (node: unknown, parentPos?: Pos) => { if (path) form.pushTree(path, node, parentPos) },
    insert: (pos: Pos, node: unknown) => { if (path) form.insertTree(path, pos, node) },
    remove: (pos: Pos) => { if (path) form.removeTree(path, pos) },
    replace: (pos: Pos, node: unknown) => { if (path) form.replaceTree(path, pos, node) },
    move: (from: Pos, to: Pos): MoveResult => (path ? form.moveTree(path, from, to) : { ok: false }),
  }), [form, path])
  return {
    path: at,
    treePath: at,
    errors: messages.errors,
    warnings: messages.warnings,
    value: Array.isArray(value) ? (value as unknown[]) : [],
    ...ops,
    dragProps,
  }
}

/** This path's own messages. Subscribes to that path only, so a descendant edit does not re-render. */
function useOwnMessages(path: string | null): { errors: readonly string[]; warnings: readonly string[] } {
  const form = useRequiredForm(path ? `the tree '${path}'` : 'useTreeField()')
  const cache = useRef(NO_MESSAGES)
  const read = () => {
    if (!path) return NO_MESSAGES
    const binding = form.binding(path)
    const prev = cache.current
    if (deepEqual(prev.errors, binding.errors) && deepEqual(prev.warnings, binding.warnings)) return prev
    const next = { errors: binding.errors, warnings: binding.warnings }
    cache.current = next
    return next
  }
  return useSyncExternalStore(
    (onStoreChange) => (path ? form.subscribePath(path, onStoreChange) : () => {}),
    read,
    read,
  )
}

const NO_MESSAGES = { errors: [] as readonly string[], warnings: [] as readonly string[] }

function toPos(raw: string): Pos | undefined {
  const pos = raw.split('.').map(Number)
  return pos.every(Number.isInteger) ? pos : undefined
}
