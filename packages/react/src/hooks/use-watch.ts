import { useRef, useSyncExternalStore } from 'react'
import { deepEqual } from '@shikiform/core/internal'
import type { Draft } from '@shikiform/core/internal'
import { useRequiredForm } from '../context'

/**
 * Subscribe to the `$` reads inside `select`.
 * An unannotated draft compiles and is untyped (`useWatch((d) => d.$submitting)`, `d` is `any`).
 * Prefer the form's typed handle. `useWatch<Values>()(select)` types the draft and still infers the result
 * (`useWatch<Values>(select)` does not: one explicit type argument stops inference of the result).
 *
 * ```tsx
 * const F = typed(form)
 * const name = F.useWatch((d) => d.name.$value)             // string
 * const email = useWatch<Values>()((d) => d.email.$value)   // string
 * const can = useWatch((d: Draft<Values>) => d.$canSubmit)  // boolean
 * ```
 * `select={(d) => d.email.$errors}` re-renders when that field's errors change.
 * `select={(d) => d.$canSubmit}` re-renders when submit, validation, or errors change, not on unrelated keystrokes.
 * Return data, not a new function. The snapshot is cached with {@link deepEqual}.
 */
export function useWatch<T>(): <S>(select: (d: Draft<T>) => S) => S
export function useWatch<T = any, S = unknown>(select: (d: Draft<T>) => S): S
export function useWatch<T = any, S = unknown>(select?: (d: Draft<T>) => S): S | (<U>(select: (d: Draft<T>) => U) => U) {
  if (select === undefined) {
    return ((next: (d: Draft<T>) => S) => useWatch(next)) as <U>(select: (d: Draft<T>) => U) => U
  }
  const form = useRequiredForm<T>('useWatch()')
  const selectRef = useRef(select)
  selectRef.current = select
  const cache = useRef<{ value: S } | null>(null)
  const read = () => {
    const tracked = form.trackSelector(selectRef.current)
    const value = tracked.value
    if (cache.current && (Object.is(cache.current.value, value) || deepEqual(cache.current.value, value))) {
      return cache.current.value
    }
    cache.current = { value }
    return value
  }
  return useSyncExternalStore(
    (onStoreChange) => {
      let stops: Array<() => void> = []
      let last = ''
      const listen = () => {
        const tracked = form.trackSelector(selectRef.current)
        const key = tracked.deps.join('|')
        if (key === last && stops.length) return
        for (const stop of stops) stop()
        stops =
          tracked.deps.length > 0
            ? tracked.deps.map((dep) =>
                form.subscribeDep(dep, () => {
                  listen()
                  onStoreChange()
                }),
              )
            : [form.subscribeDebug(onStoreChange)]
        last = key
      }
      listen()
      return () => {
        for (const stop of stops) stop()
      }
    },
    read,
    read,
  )
}
