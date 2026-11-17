import { useContext, useRef, useSyncExternalStore } from 'react'
import type { ArrayItemOf, ArrayPath } from '@shikiform/core/internal'
import { deepEqual, ShikiUsageError, showDraftPath } from '@shikiform/core/internal'
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
 *
 * `useArray()` is the nearest `<ArrayField>` (Formily `ArrayBase.useArray`): a row, or the container
 * (`ArrayItems` / `ArrayCards` / `ArrayTable`, toolbar included). Nested arrays resolve to the inner one.
 * Outside an array it throws.
 *
 * `useArray(name)` resolves `name` against the current scope (a repeated scope prefix throws in development),
 * registers that path into the nearest `FieldGroup`, and returns the same handle.
 * `useArray<Values, 'rows'>('rows')` checks the name and types `push` / `replace` as one row.
 * `useArray<Values>('rows')` only checks the name. A bare `useArray('rows')` accepts any row.
 * Options are the second argument's object: `useArray('rows', { rowKey: 'id' })`.
 *
 * ```tsx
 * function RemoveButton() {
 *   const array = useArray()
 *   const index = useIndex()
 *   return <button onClick={() => array.remove(index)}>删除</button>
 * }
 * ```
 */
export function useArray<TRow = unknown>(): ArrayHandle<TRow>
export function useArray(name: string, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArray<TScope>(name: ArrayPath<TScope>, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArray<TScope, N extends ArrayPath<TScope>>(
  name: N,
  opts?: { rowKey?: string },
): ArrayHandle<ArrayItemOf<TScope, N & string>>
export function useArray(name?: string, opts?: { rowKey?: string }): ArrayHandle<unknown> {
  const ctx = useContext(ArrayContext)
  const scope = useScope()
  if (name == null && !ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useArray() must render inside <ArrayField> (a row or its container component: ArrayItems / ArrayCards / ArrayTable).')
    }
    throw new Error('useArray() must render inside <ArrayField>')
  }
  const form = useRequiredForm(name != null ? `useArray('${name}') / <ArrayField name="${name}">` : 'useArray()')
  let path: string | undefined
  if (name != null) {
    path = resolveName(form, scope, name)
    if (process.env.NODE_ENV !== 'production') assertArrayValue(path, form.getValue(path))
  } else {
    path = ctx?.path
  }
  useFieldGroupRegistration(name != null ? path : undefined)
  return useArrayAt(path ?? null, name != null ? opts?.rowKey : ctx?.rowKey)
}

/** `<ArrayField name="title">` on a string renders no rows and no error: say so in development. */
function assertArrayValue(path: string, value: unknown): void {
  if (value == null || Array.isArray(value)) return
  const shown = typeof value === 'object' ? 'an object' : `${typeof value} ${JSON.stringify(value)?.slice(0, 40)}`
  throw new ShikiUsageError(
    `<ArrayField name="${path}"> / useArray('${path}'): ${showDraftPath(path)}.$value is ${shown}, not an array. ` +
      `Start it as an array in initialValues (\`${path.split('.').pop()}: []\`), or use <Field> / <ObjectField> for a non-array value.`,
  )
}

/** {@link useArray} for an absolute path, without field-group registration (internal: containers, `useArrayTable`). `null` subscribes to nothing. */
export function useArrayAt(path: string | null, rowKey?: string): ArrayHandle<unknown> {
  const form = useRequiredForm(path ? `the array '${path}'` : 'useArray()')
  const version = useSyncExternalStore(
    (onStoreChange) => (path ? form.subscribeStructure(path, onStoreChange) : () => {}),
    () => (path ? form.getStructureVersion(path) : 0),
    () => (path ? form.getStructureVersion(path) : 0),
  )
  void version
  if (path) form.registerArray(path, rowKey)
  const dragProps = useDragProps<number>(path ?? '', (from, to) => { if (path) form.moveArray(path, from, to) }, String, toIndex)
  const at = path ?? ''
  return {
    path: at,
    keys: path ? form.structureKeys(path, rowKey) as ArrayKey[] : [],
    push: (row: unknown) => { if (path) form.pushArray(path, row) },
    insert: (index: number, row: unknown) => { if (path) form.insertArray(path, index, row) },
    remove: (index: number) => { if (path) form.removeArray(path, index) },
    /** `to` is the final index. */
    move: (from: number, to: number) => { if (path) form.moveArray(path, from, to) },
    swap: (indexA: number, indexB: number) => { if (path) form.swapArray(path, indexA, indexB) },
    replace: (index: number, row: unknown) => { if (path) form.replaceArray(path, index, row) },
    dragProps,
  }
}

function toIndex(raw: string): number | undefined {
  const index = Number(raw)
  return Number.isInteger(index) ? index : undefined
}

/** This array path's own messages. Descendant fields are not included — those render on the row fields. */
export interface ArrayErrors {
  errors: readonly string[]
  warnings: readonly string[]
}

const NO_MESSAGES: ArrayErrors = { errors: [], warnings: [] }

/**
 * The nearest array field's own validation messages (rules, schema, `form.setErrors` on that path).
 * A child field's "必填" is not in here: `d.items.$errors` aggregates descendants, this does not.
 * Subscribes to the array path only, so editing a cell does not re-render.
 * Throws outside an `<ArrayField>`, like {@link useArray}.
 *
 * `ArrayItems` / `ArrayCards` render this under the rows. A custom list does the same:
 *
 * ```tsx
 * function ListError() {
 *   const { errors } = useArrayErrors()
 *   if (!errors.length) return null
 *   return <p role="alert">{errors.join('、')}</p>
 * }
 * ```
 */
export function useArrayErrors(): ArrayErrors {
  const ctx = useContext(ArrayContext)
  if (!ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useArrayErrors() must render inside an <ArrayField> (its container, or a row).')
    }
    throw new Error('useArrayErrors() must render inside an <ArrayField>')
  }
  const form = useRequiredForm('useArrayErrors()')
  const path = ctx.path
  const cache = useRef<ArrayErrors>(NO_MESSAGES)
  const read = () => {
    const binding = form.binding(path)
    const prev = cache.current
    if (deepEqual(prev.errors, binding.errors) && deepEqual(prev.warnings, binding.warnings)) return prev
    const next = { errors: binding.errors, warnings: binding.warnings }
    cache.current = next
    return next
  }
  return useSyncExternalStore(
    (onStoreChange) => form.subscribePath(path, onStoreChange),
    read,
    read,
  )
}
