import { useCallback, useRef, useSyncExternalStore, type DragEvent } from 'react'
import { joinPath } from '../../core/shared/path'
import type { MoveResult } from '../../core/types'
import type { Pos } from '../../core/shared/tree-ops'
import { useFormContext, useScope } from '../context'

/**
 * Tree handle. `move(from, to)` uses final `pos` coordinates and refuses a move into a descendant.
 * Subscribes to structure only.
 */
export function useTreeField(name: string, opts?: { childrenKey?: string; rowKey?: string }) {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, name)
  form.registerTree(path, opts)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribeStructure(path, onStoreChange),
    () => form.getStructureVersion(path),
    () => form.getStructureVersion(path),
  )
  void version
  const value = form.getValue(path as never) as unknown
  return {
    path,
    value: Array.isArray(value) ? value : [],
    move: (from: Pos, to: Pos): MoveResult => form.moveTree(path, from, to),
  }
}

/**
 * Drag-and-drop for a tree. Does not subscribe.
 * `bind(pos)` is the HTML5 handlers for the node at that final coordinate.
 * Cross-parent moves keep the node id and its field state.
 */
export function useTreeMove(name: string) {
  const form = useFormContext()
  const scope = useScope()
  const path = joinPath(scope.path, name)
  const fromRef = useRef<Pos | null>(null)
  const move = useCallback((from: Pos, to: Pos) => form.moveTree(path, from, to), [form, path])
  const bind = useCallback(
    (pos: Pos) => ({
      draggable: true as const,
      onDragStart: (event: DragEvent) => {
        fromRef.current = pos
        event.dataTransfer?.setData('text/plain', pos.join('.'))
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault()
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        event.stopPropagation()
        const from = fromRef.current
        if (from) move(from, pos)
        fromRef.current = null
      },
    }),
    [move],
  )
  return { move, bind }
}
