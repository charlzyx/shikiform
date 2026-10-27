import { useRef, useSyncExternalStore } from 'react'
import { deepEqual } from '../core/equal'
import type { Draft } from '../core/types'
import { useFormContext } from './context'

/**
 * Subscribe to the `$` reads inside `select`.
 * Annotate the draft. The return type is the selector's return, not `any`:
 *
 * ```tsx
 * const name = useWatch((d: Draft<Values>) => d.name.$value)
 * const can = useWatch((d: Draft<Values>) => d.$canSubmit === true)
 * ```
 *
 * Passing only the form type (`useWatch<Values>(...)`) does not infer the selected value.
 * TypeScript stops inferring once any type argument is written, so annotate `d` instead.
 * `select={(d) => d.email.$errors}` re-renders when that field's errors change.
 * `select={(d) => d.$canSubmit}` re-renders when submit, validation, or errors change, not on unrelated keystrokes.
 * Return data, not a new function. The snapshot is cached with {@link deepEqual}.
 */
export function useWatch<T, S>(select: (d: Draft<T>) => S): S {
  const form = useFormContext<T>()
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
