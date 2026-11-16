import { useCallback } from 'react'
import type { MoveResult } from '@shikiform/core/internal'
import type { Pos } from '@shikiform/core/internal'
import type { Draft } from '@shikiform/core/internal'
import { useRequiredForm, useScope } from '../context'
import { useDragProps, type DragProps } from './drag'
import { useWatch } from './use-watch'
import { ShikiUsageError } from '@shikiform/core/internal'

/**
 * Index of the row this component renders in (Formily `ArrayBase.useIndex`), from the surrounding `RowScope`
 * (`<ArrayField>` rows, `ArrayTable` cells included). Throws outside a row.
 */
export function useIndex(): number {
  const scope = useScope()
  if (scope.index < 0) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useIndex() must render inside an array row (<ArrayField> rows, ArrayTable cells included).')
    }
    throw new Error('useIndex() must render inside an array row')
  }
  return scope.index
}

/**
 * Value of the row this component renders in (Formily `ArrayBase.useRecord`). Reactive: re-renders when any cell of
 * this row changes, and follows the row when it moves. Throws outside a row (or tree node).
 */
export function useRecord<TRow = any>(): TRow {
  const form = useRequiredForm('useRecord() / useTreeNode()')
  const scope = useScope()
  if (scope.index < 0 && !scope.pos) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useRecord() must render inside an array row (<ArrayField> rows, ArrayTable cells included) or a tree node (<TreeField>).')
    }
    throw new Error('useRecord() must render inside an array row or tree node')
  }
  const path = scope.path
  const select = useCallback((_d: Draft<any>) => form.query(path).$value as TRow, [form, path])
  return useWatch(select)
}

/**
 * The tree node this component renders in: `path`, `pos`, `index` (last segment of `pos`), the reactive `record`,
 * plus `move(from, to)` and `dragProps(pos)` — the same node operations {@link useTree} gives, bound to the tree the
 * node belongs to (the longest registered root that contains this path). `useTree()` is the tree itself;
 * this hook is the current node (`path`, `pos`, `index`). `useIndex()` is that sibling index.
 * Render inside `<TreeField>` (which wraps each node in its row scope).
 * Throws outside a node.
 */
export function useTreeNode<TNode = any>(): {
  path: string
  pos: Pos
  index: number
  record: TNode
  /** `to` is the final `pos`. Refuses a move into the node's own descendant. */
  move: (from: Pos, to: Pos) => MoveResult
  /** HTML5 drag-and-drop props for the node at `pos` (default: this node). */
  dragProps: (pos?: Pos) => DragProps
} {
  // 先查 scope 再取 form：在 <Form> 外渲染时，错误要指向缺失的节点作用域
  const scope = useScope()
  if (!scope.pos) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useTreeNode() must render inside a tree node (<TreeField>).')
    }
    throw new Error('useTreeNode() must render inside a tree node (<TreeField>)')
  }
  const form = useRequiredForm('useRecord() / useTreeNode()')
  const record = useRecord<TNode>()
  const pos = scope.pos as Pos
  const path = scope.path
  // 最近的树根 = 向上找包含当前节点路径的最长已注册树（与 useArray() 对数组的处理对齐）
  const treePath = form.treeRoot(path) ?? path
  const move = useCallback((from: Pos, to: Pos) => form.moveTree(treePath, from, to), [form, treePath])
  const baseProps = useDragProps<Pos>(treePath, move, (at) => at.join('.'), (raw) => {
    const decoded = raw.split('.').map(Number)
    return decoded.every(Number.isInteger) ? decoded : undefined
  })
  // 默认绑定当前节点；pos 变化时重建，保证拖拽落到当前节点
  const dragProps = useCallback((at?: Pos) => baseProps(at ?? pos), [baseProps, pos.join('.')])
  return { path, pos, index: pos[pos.length - 1] ?? -1, record, move, dragProps }
}
