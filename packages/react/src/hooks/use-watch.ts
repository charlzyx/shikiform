import { useContext, useRef, useSyncExternalStore } from 'react'
import { deepEqual, engineOf } from '@shikiform/core/internal'
import type { Draft, FormInstance } from '@shikiform/core/internal'
import { FormContext } from '../context'

/**
 * Subscribe to the `$` reads inside `select`.
 * Reads the form from `<Form>` context, or takes `form` explicitly as the first argument (`useWatch(form, select)`)
 * so a component that holds `const form = useForm(...)` can subscribe above `<Form>`.
 * `typed(form).useWatch(select)` binds `form` automatically.
 */
export function useWatch<T>(): <S>(select: (d: Draft<T>) => S) => S
export function useWatch<T, S>(form: FormInstance<T, any>, select: (d: Draft<T>) => S): S
export function useWatch<T = any, S = unknown>(select: (d: Draft<T>) => S): S
export function useWatch<T = any, S = unknown>(
  first?: FormInstance<T, any> | ((d: Draft<T>) => S),
  second?: (d: Draft<T>) => S,
): S | (<U>(select: (d: Draft<T>) => U) => U) {
  if (first === undefined) {
    return ((next: (d: Draft<T>) => S) => useWatch(next)) as <U>(select: (d: Draft<T>) => U) => U
  }
  const hasExplicitForm = typeof first !== 'function'
  const select = (hasExplicitForm ? second! : first) as (d: Draft<T>) => S
  const ctxForm = useContext(FormContext)
  const form = hasExplicitForm ? engineOf(first as FormInstance<T, any>) : ctxForm
  if (!form) {
    throw new Error(
      '[shikiform] useWatch() has no form. Render it inside <Form form={form}> (useForm / createForm), ' +
        'or pass the form explicitly: useWatch(form, select) / typed(form).useWatch(select).',
    )
  }
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
