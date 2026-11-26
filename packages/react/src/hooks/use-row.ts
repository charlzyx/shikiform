import { useCallback } from '../compat/react-compat'
import type { Draft } from '@shikiform/core/internal'
import { useRequiredForm, useScope } from '../context'
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
  const form = useRequiredForm('useRecord()')
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
