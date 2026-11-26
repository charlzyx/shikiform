import type { DragEvent } from 'react'
import { useCallback, useRef } from '../compat/react-compat'

/** HTML5 drag-and-drop props for one row / node: the same object serves as drag source and drop target. */
export interface DragProps {
  draggable: true
  onDragStart: (event: DragEvent) => void
  onDragOver: (event: DragEvent) => void
  onDrop: (event: DragEvent) => void
}

/**
 * Shared drag plumbing behind `ArrayHandle.dragProps` / the tree handle's `dragProps`. The drag source is kept on a
 * ref (Playwright's drag does not always keep `dataTransfer`), with `dataTransfer` text as the fallback.
 * The `dataTransfer` payload carries the source structure's `key` (`<path>|<position>`), so a drop on a different
 * array / tree is ignored instead of moving that structure's own rows.
 * The returned function only changes when `key` changes, so it never re-renders anyone by itself.
 */
export function useDragProps<P>(key: string, move: (from: P, to: P) => unknown, encode: (at: P) => string, decode: (raw: string) => P | undefined) {
  const decodePayload = (raw: string): P | undefined => {
    const sep = raw.indexOf('|')
    if (sep < 0 || raw.slice(0, sep) !== key) return undefined
    return decode(raw.slice(sep + 1))
  }
  const fromRef = useRef<P | null>(null)
  const moveRef = useRef(move)
  moveRef.current = move
  const codec = useRef({ encode, decode })
  codec.current = { encode, decode }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useCallback(
    (at: P): DragProps => ({
      draggable: true,
      onDragStart: (event) => {
        event.stopPropagation()
        fromRef.current = at
        event.dataTransfer?.setData('text/plain', `${key}|${codec.current.encode(at)}`)
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },
      onDragOver: (event) => {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      },
      onDrop: (event) => {
        event.preventDefault()
        event.stopPropagation()
        const raw = event.dataTransfer?.getData('text/plain')
        const from = fromRef.current ?? (raw ? decodePayload(raw) : undefined)
        fromRef.current = null
        if (from === undefined || from === null) return
        if (codec.current.encode(from) === codec.current.encode(at)) return
        moveRef.current(from, at)
      },
    }),
    [key],
  )
}
