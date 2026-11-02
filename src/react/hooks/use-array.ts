import { useCallback, useContext, useRef, useSyncExternalStore, type DragEvent } from 'react'
import { joinPath } from '../../core/shared/path'
import type { ArrayItemOf, ArrayPath } from '../../core/types'
import { ArrayContext, useFormContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'

/** One rendered row. `key` is the row id, or a stable identity when the row has none. */
export interface ArrayKey {
  key: string
  index: number
}

export type ArrayHandle<TRow> = {
  path: string
  keys: ArrayKey[]
  push: (row: TRow) => void
  insert: (index: number, row: TRow) => void
  remove: (index: number) => void
  /** `to` is the final index. */
  move: (from: number, to: number) => void
  swap: (indexA: number, indexB: number) => void
  replace: (index: number, row: TRow) => void
}

/**
 * Array handle. Subscribes to row structure (length and ids), not to cell values.
 * `keys` use the row id when the row has one, otherwise a stable object identity.
 * `to` on `move` is the final index.
 * `useArrayField<Values, 'rows'>('rows')` checks the name and types `push` / `replace` as one row.
 * `useArrayField<Values>('rows')` only checks the name. A bare `useArrayField('rows')` accepts any row.
 */
export function useArrayField(name: string, rowKey?: string): ArrayHandle<unknown>
export function useArrayField<TScope>(name: ArrayPath<TScope>, rowKey?: string): ArrayHandle<unknown>
export function useArrayField<TScope, N extends ArrayPath<TScope>>(
  name: N,
  rowKey?: string,
): ArrayHandle<ArrayItemOf<TScope, N & string>>
export function useArrayField(name: string, rowKey?: string): ArrayHandle<unknown> {
  const scope = useScope()
  const path = resolveName(useRequiredForm(`useArrayField('${name}') / <ArrayField name="${name}">`), scope, name)
  useFieldGroupRegistration(path)
  return useArrayAt(path, rowKey)
}

/**
 * The nearest enclosing array, no name needed (Formily `ArrayBase.useArray`): inside an `<ArrayField>`, `ArrayTable`
 * or `ProArrayTable` row (or its toolbar), the same handle {@link useArrayField} returns for that array.
 * Throws outside an array.
 *
 * ```tsx
 * function RemoveButton() {
 *   const array = useArray()
 *   const index = useIndex()
 *   return <button onClick={() => array.remove(index)}>删除</button>
 * }
 * ```
 */
export function useArray<TRow = unknown>(): ArrayHandle<TRow> {
  const ctx = useContext(ArrayContext)
  if (!ctx) throw new Error('useArray() must render inside <ArrayField>, ArrayTable, or ProArrayTable')
  return useArrayAt(ctx.path, ctx.rowKey) as ArrayHandle<TRow>
}

function useArrayAt(path: string, rowKey?: string): ArrayHandle<unknown> {
  const form = useRequiredForm(`the array '${path}'`)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribeStructure(path, onStoreChange),
    () => form.getStructureVersion(path),
    () => form.getStructureVersion(path),
  )
  void version
  form.registerArray(path, rowKey)
  return {
    path,
    keys: form.structureKeys(path, rowKey) as ArrayKey[],
    push: (row: unknown) => form.pushArray(path, row),
    insert: (index: number, row: unknown) => form.insertArray(path, index, row),
    remove: (index: number) => form.removeArray(path, index),
    /** `to` is the final index. */
    move: (from: number, to: number) => form.moveArray(path, from, to),
    swap: (indexA: number, indexB: number) => form.swapArray(path, indexA, indexB),
    replace: (index: number, row: unknown) => form.replaceArray(path, index, row),
  }
}

/**
 * Drag-and-drop move for an array. Does not subscribe, so a move does not re-render the caller.
 * Row components re-render from the structure subscription in {@link useArrayField}.
 * The drag source is stored on a ref (Playwright's drag does not always keep `dataTransfer`).
 * `to` is the final index.
 */
export function useArrayMove(name: string) {
  const scope = useScope()
  return useArrayMoveAt(joinPath(scope.path, name))
}

/** {@link useArrayMove} for an absolute array path (internal: array containers read it from `ArrayContext`). */
export function useArrayMoveAt(path: string) {
  const form = useFormContext()
  const fromRef = useRef<number | null>(null)
  const move = useCallback((from: number, to: number) => form.moveArray(path, from, to), [form, path])
  const swap = useCallback((indexA: number, indexB: number) => form.swapArray(path, indexA, indexB), [form, path])
  const bind = useCallback(
    (index: number) => ({
      draggable: true as const,
      onDragStart: (event: DragEvent) => {
        fromRef.current = index
        event.dataTransfer?.setData('text/plain', String(index))
        if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
      },
      onDragOver: (event: DragEvent) => {
        event.preventDefault()
        if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
      },
      onDrop: (event: DragEvent) => {
        event.preventDefault()
        const raw = event.dataTransfer?.getData('text/plain')
        const from = fromRef.current ?? (raw ? Number(raw) : NaN)
        if (Number.isInteger(from) && from !== index) move(from, index)
        fromRef.current = null
      },
    }),
    [move],
  )
  return { move, swap, bind }
}
