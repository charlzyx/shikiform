import { useCallback } from 'react'
import type { Pos } from '../../core/shared/tree-ops'
import type { Draft } from '../../core/types'
import { useFormContext, useScope } from '../context'
import { useWatch } from './use-watch'

/**
 * Index of the row this component renders in (Formily `ArrayBase.useIndex`), from the surrounding `RowScope`
 * (`<ArrayField>`, `ArrayTable`, `ProArrayTable` rows). Throws outside a row.
 */
export function useIndex(): number {
  const scope = useScope()
  if (scope.index < 0) throw new Error('useIndex() must render inside an array row (<ArrayField>, ArrayTable, ProArrayTable)')
  return scope.index
}

/**
 * Value of the row this component renders in (Formily `ArrayBase.useRecord`). Reactive: re-renders when any cell of
 * this row changes, and follows the row when it moves. Throws outside a row (or tree node).
 */
export function useRecord<TRow = any>(): TRow {
  const form = useFormContext()
  const scope = useScope()
  if (scope.index < 0 && !scope.pos) throw new Error('useRecord() must render inside an array row or tree node')
  const path = scope.path
  const select = useCallback((_d: Draft<any>) => form.query(path).$value as TRow, [form, path])
  return useWatch(select)
}

/**
 * The tree node this component renders in: `path`, `pos`, `index` (last segment of `pos`), and the reactive `record`.
 * A tree's nodes are rendered by the caller; wrap each node in `<RowScope path pos>` to provide it.
 * Throws outside a node.
 */
export function useTreeNode<TNode = any>(): { path: string; pos: Pos; index: number; record: TNode } {
  const scope = useScope()
  if (!scope.pos) throw new Error('useTreeNode() must render inside a tree node: wrap it in <RowScope path={…} pos={…}>')
  const record = useRecord<TNode>()
  const pos = scope.pos as Pos
  return { path: scope.path, pos, index: pos[pos.length - 1] ?? -1, record }
}
