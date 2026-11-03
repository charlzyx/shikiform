import { useSyncExternalStore } from 'react'
import type { MoveResult } from '../../core/types'
import type { Pos } from '../../core/shared/tree-ops'
import { useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps } from './drag'

/**
 * Tree handle. `move(from, to)` uses final `pos` coordinates and refuses a move into a descendant (the result says why).
 * `dragProps(pos)` is the HTML5 drag-and-drop props for the node at that coordinate (source and drop target);
 * dropping node A on node B is `move(A, B)`, so cross-parent moves keep the node id and its field state.
 * Subscribes to structure only.
 */
export function useTreeField(name: string, opts?: { childrenKey?: string; rowKey?: string }) {
  const form = useRequiredForm(`useTreeField('${name}') / <TreeField name="${name}">`)
  const scope = useScope()
  const path = resolveName(form, scope, name)
  useFieldGroupRegistration(path)
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
    value: Array.isArray(value) ? value : [],
    move: (from: Pos, to: Pos): MoveResult => form.moveTree(path, from, to),
    dragProps,
  }
}

function toPos(raw: string): Pos | undefined {
  const pos = raw.split('.').map(Number)
  return pos.every(Number.isInteger) ? pos : undefined
}
