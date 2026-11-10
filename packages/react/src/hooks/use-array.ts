import { useContext, useSyncExternalStore } from 'react'
import type { ArrayItemOf, ArrayPath } from '@shikiform/core/internal'
import { ShikiUsageError, showDraftPath } from '@shikiform/core/internal'
import { ArrayContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps, type DragProps } from './drag'

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
  /**
   * HTML5 drag-and-drop props for row `index`: spread them on the row (drop target) and on its handle (drag source).
   * Dropping row A on row B moves A to B's index. Stable per path; dragging does not re-render.
   */
  dragProps: (index: number) => DragProps
}

/**
 * Array handle. Subscribes to row structure (length and ids), not to cell values.
 * `keys` use the row id when the row has one, otherwise a stable object identity.
 * `to` on `move` is the final index.
 * `useArrayField<Values, 'rows'>('rows')` checks the name and types `push` / `replace` as one row.
 * `useArrayField<Values>('rows')` only checks the name. A bare `useArrayField('rows')` accepts any row.
 * Options are the second argument's object: `useArrayField('rows', { rowKey: 'id' })` (same shape as `useTreeField`).
 */
export function useArrayField(name: string, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArrayField<TScope>(name: ArrayPath<TScope>, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArrayField<TScope, N extends ArrayPath<TScope>>(
  name: N,
  opts?: { rowKey?: string },
): ArrayHandle<ArrayItemOf<TScope, N & string>>
export function useArrayField(name: string, opts?: { rowKey?: string }): ArrayHandle<unknown> {
  const scope = useScope()
  const form = useRequiredForm(`useArrayField('${name}') / <ArrayField name="${name}">`)
  const path = resolveName(form, scope, name)
  if (process.env.NODE_ENV !== 'production') assertArrayValue(path, form.getValue(path))
  useFieldGroupRegistration(path)
  return useArrayAt(path, opts?.rowKey)
}

/**
 * The nearest enclosing array, no name needed (Formily `ArrayBase.useArray`): inside an `<ArrayField>` row or its container
 * (`ArrayItems` / `ArrayCards` / `ArrayTable`, toolbar included), the same handle {@link useArrayField} returns for that array.
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
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useArray() must render inside <ArrayField> (a row or its container component: ArrayItems / ArrayCards / ArrayTable).')
    }
    throw new Error('useArray() must render inside <ArrayField>')
  }
  return useArrayAt(ctx.path, ctx.rowKey) as ArrayHandle<TRow>
}

/** `<ArrayField name="title">` on a string renders no rows and no error: say so in development. */
function assertArrayValue(path: string, value: unknown): void {
  if (value == null || Array.isArray(value)) return
  const shown = typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)?.slice(0, 40)}`
  throw new ShikiUsageError(
    `<ArrayField name="${path}"> / useArrayField('${path}'): ${showDraftPath(path)}.$value is ${shown}, not an array. ` +
      `Start it as an array in initialValues (\`${path.split('.').pop()}: []\`), or use <Field> / <ObjectField> for a non-array value.`,
  )
}

/** {@link useArrayField} for an absolute path, without field-group registration (internal: containers, `useArrayTable`). */
export function useArrayAt(path: string, rowKey?: string): ArrayHandle<unknown> {
  const form = useRequiredForm(`the array '${path}'`)
  const version = useSyncExternalStore(
    (onStoreChange) => form.subscribeStructure(path, onStoreChange),
    () => form.getStructureVersion(path),
    () => form.getStructureVersion(path),
  )
  void version
  form.registerArray(path, rowKey)
  const dragProps = useDragProps<number>(path, (from, to) => form.moveArray(path, from, to), String, toIndex)
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
    dragProps,
  }
}

function toIndex(raw: string): number | undefined {
  const index = Number(raw)
  return Number.isInteger(index) ? index : undefined
}
