import { useCallback, useContext } from 'react'
import { ShikiUsageError } from '@shikiform/core/internal'
import { engineOf } from '@shikiform/core/internal'
import type { FormInstance } from '@shikiform/core/internal'
import { joinPath } from '@shikiform/core/internal'
import { FormContext, useScope } from '@shikiform/react/internal'
import { useShadowForm, type ShadowFormApi, type UseShadowFormOptions } from './use-shadow-form'

/** What an array shadow was opened for. */
export type ArrayShadowContext = { mode: 'edit'; index: number; key: string } | { mode: 'add' }

export interface UseArrayShadowOptions<TRow> extends Omit<UseShadowFormOptions<TRow, ArrayShadowContext>, 'onOk'> {
  /**
   * The host form, for a caller outside `<Form>` (e.g. next to a `QueryList`, which renders its own).
   * `name` is then an absolute path. Default: the surrounding form, `name` relative to the current scope.
   */
  form?: FormInstance<any>
  /** Row id property, as on the array. Used to find the edited row again if it moved while the draft was open. */
  rowKey?: string
  /**
   * Runs after validation, before the default write. Return `false` to skip the default write
   * (replace the edited row / append the added one) and handle the values yourself.
   */
  onOk?: (values: TRow, context: ArrayShadowContext | undefined) => void | false | Promise<void | false>
  /** How an edit lands on the row. Default: `{ ...row, ...values }`. */
  merge?: (row: TRow, values: TRow) => TRow
  /** How an added row lands. Default: `pushArray`. `ArrayTable.ShadowAddition` passes the table's `add` so the pager follows. */
  append?: (row: TRow) => void
}

export interface ArrayShadowApi<TRow> extends ShadowFormApi<TRow, ArrayShadowContext> {
  /** Open the draft on row `index`. `loader` maps (or fetches) the record first (Pro.formily `initLoader`). */
  edit: (index: number, loader?: (record: TRow) => TRow | Partial<TRow> | Promise<TRow | Partial<TRow>>) => Promise<void>
  /** Open an empty (or `init`) draft whose confirm appends a row (Pro.formily `ProAddition`). */
  add: (init?: Partial<TRow>) => Promise<void>
}

/**
 * Row editing through a shadow form (Pro.formily `DelegateAction` + `ShadowModal` + `ProAddition`):
 * one draft serves every row; confirm writes back to the row it was opened for, or appends.
 * Cancel leaves the array untouched.
 */
export function useArrayShadow<TRow = Record<string, any>>(name: string, options: UseArrayShadowOptions<TRow> = {}): ArrayShadowApi<TRow> {
  const context = useContext(FormContext)
  const scope = useScope()
  const form = options.form ? engineOf(options.form) : context
  if (!form) {
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError('useArrayShadow needs a surrounding <Form> or a `form` option.')
    }
    throw new Error('useArrayShadow needs a surrounding <Form> or a `form` option')
  }
  const path = options.form ? name : joinPath(scope.path, name)
  const { onOk, merge, append, rowKey, form: _form, ...shadowOptions } = options
  const shadow = useShadowForm<TRow, ArrayShadowContext>({
    ...shadowOptions,
    onOk: async (values, context) => {
      const handled = await onOk?.(values, context)
      if (handled === false || !context) return
      if (context.mode === 'add') {
        if (append) append(values)
        else form.pushArray(path as never, values as never)
        return
      }
      const row = form.structureKeys(path, rowKey).find((item) => item.key === context.key)
      const index = row?.index ?? context.index
      const current = form.getValue(`${path}.${index}` as never) as TRow
      const next = merge ? merge(current, values) : ({ ...(current as object), ...(values as object) } as TRow)
      form.replaceArray(path as never, index, next as never)
    },
  })
  const edit = useCallback(
    (index: number, loader?: (record: TRow) => TRow | Partial<TRow> | Promise<TRow | Partial<TRow>>) => {
      const key = form.structureKeys(path, rowKey)[index]?.key ?? String(index)
      const record = form.getValue(`${path}.${index}` as never) as TRow
      return shadow.open(loader ? () => loader(record) : record, { mode: 'edit', index, key })
    },
    [form, path, rowKey, shadow.open],
  )
  const add = useCallback((init?: Partial<TRow>) => shadow.open(init ?? ({} as Partial<TRow>), { mode: 'add' }), [shadow.open])
  return { ...shadow, edit, add }
}
