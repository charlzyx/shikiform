import type { ArrayItemOf, ArrayPath } from '@shikiform/core/internal'
import { deepEqual, ShikiUsageError, showDraftPath } from '@shikiform/core/internal'
import { useContext, useMemo, useRef, useSyncExternalStore } from '../compat/react-compat'
import { ArrayContext, useRequiredForm, useScope } from '../context'
import { useFieldGroupRegistration } from '../field-group'
import { resolveName } from './resolve-name'
import { useDragProps, type DragProps } from './drag'

/** One rendered row. `key` is the row id, or a stable identity when the row has none. */
export interface ArrayKey {
  key: string
  index: number
}

/** `push` / `insert` / `remove` / `move` / `swap` / `replace` / `dragProps` keep one identity per form + path; the handle object is new each render. */
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
  /** This array path's own messages. Descendant fields are not included. */
  errors: readonly string[]
  warnings: readonly string[]
}

/**
 * Array handle. Subscribes to row structure (length and ids), not to cell values.
 * `keys` use the row id when the row has one, otherwise a stable object identity.
 * `to` on `move` is the final index.
 *
 * `useArrayField()` is the nearest `<ArrayField>` (Formily `ArrayBase.useArray`): a row, or the container
 * (`ArrayItems` / `ArrayCards` / `ArrayTable`, toolbar included). Nested arrays resolve to the inner one.
 * Outside an array it throws.
 *
 * `useArrayField(name)` resolves `name` against the current scope (a repeated scope prefix throws in development),
 * registers that path into the nearest `FieldGroup`, and returns the same handle.
 * `useArrayField<Values, 'rows'>('rows')` checks the name and types `push` / `replace` as one row.
 * `useArrayField<Values>('rows')` only checks the name. A bare `useArrayField('rows')` accepts any row.
 * Options are the second argument's object: `useArrayField('rows', { rowKey: 'id' })`.
 *
 * ```tsx
 * function RemoveButton() {
 *   const array = useArrayField()
 *   const index = useIndex()
 *   return <button onClick={() => array.remove(index)}>删除</button>
 * }
 * ```
 */
export function useArrayField<TRow = unknown>(): ArrayHandle<TRow>
export function useArrayField(name: string, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArrayField<TScope>(name: ArrayPath<TScope>, opts?: { rowKey?: string }): ArrayHandle<unknown>
export function useArrayField<TScope, N extends ArrayPath<TScope>>(
  name: N,
  opts?: { rowKey?: string },
): ArrayHandle<ArrayItemOf<TScope, N & string>>
export function useArrayField(name?: string, opts?: { rowKey?: string }): ArrayHandle<unknown> {
  const ctx = useContext(ArrayContext)
  const scope = useScope()
  if (name == null && !ctx) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useArrayField() must render inside <ArrayField> (a row or its container component: ArrayItems / ArrayCards / ArrayTable).')
    }
    throw new Error('useArrayField() must render inside <ArrayField>')
  }
  const form = useRequiredForm(name != null ? `useArrayField('${name}') / <ArrayField name="${name}">` : 'useArrayField()')
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
  const kind = typeof value
  let shown: string
  if (kind === 'object') shown = 'an object'
  else if (kind === 'function') shown = 'a function'
  else shown = `${kind} ${(typeof value === 'string' ? JSON.stringify(value) : String(value)).slice(0, 40)}`
  throw new ShikiUsageError(
    `<ArrayField name="${path}"> / useArrayField('${path}'): ${showDraftPath(path)}.$value is ${shown}, not an array. ` +
      `Start it as an array in initialValues (\`${path.split('.').pop()}: []\`), or use <Field> / <ObjectField> for a non-array value.`,
  )
}

/** {@link useArrayField} for an absolute path, without field-group registration (internal: containers, `useArrayTable`). `null` subscribes to nothing. */
export function useArrayAt(path: string | null, rowKey?: string): ArrayHandle<unknown> {
  const form = useRequiredForm(path ? `the array '${path}'` : 'useArrayField()')
  const version = useSyncExternalStore(
    (onStoreChange) => (path ? form.subscribeStructure(path, onStoreChange) : () => {}),
    () => (path ? form.getStructureVersion(path) : 0),
    () => (path ? form.getStructureVersion(path) : 0),
  )
  void version
  if (path) form.registerArray(path, rowKey)
  const dragProps = useDragProps<number>(path ?? '', (from, to) => { if (path) form.moveArray(path, from, to) }, String, toIndex)
  const messages = useArrayMessages(path)
  const at = path ?? ''
  // One identity per form + path (design/API-CONVENTIONS.md §1).
  const ops = useMemo(() => ({
    push: (row: unknown) => { if (path) form.pushArray(path, row) },
    insert: (index: number, row: unknown) => { if (path) form.insertArray(path, index, row) },
    remove: (index: number) => { if (path) form.removeArray(path, index) },
    /** `to` is the final index. */
    move: (from: number, to: number) => { if (path) form.moveArray(path, from, to) },
    swap: (indexA: number, indexB: number) => { if (path) form.swapArray(path, indexA, indexB) },
    replace: (index: number, row: unknown) => { if (path) form.replaceArray(path, index, row) },
  }), [form, path])
  return {
    path: at,
    keys: path ? form.structureKeys(path, rowKey) as ArrayKey[] : [],
    ...ops,
    dragProps,
    errors: messages.errors,
    warnings: messages.warnings,
  }
}

/** This array path's own messages. Subscribes to that path only, so a cell edit does not re-render. */
function useArrayMessages(path: string | null): ArrayErrors {
  const form = useRequiredForm(path ? `the array '${path}'` : 'useArrayField()')
  const cache = useRef<ArrayErrors>(NO_MESSAGES)
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
