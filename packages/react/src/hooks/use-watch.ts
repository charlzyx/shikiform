import { deepEqual, engineOf } from '@shikiform/core/internal'
import type { Draft, FormInstance } from '@shikiform/core/internal'
import { useContext, useEffect, useMemo, useRef, useSyncExternalStore } from '../compat/react-compat'
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
  const committed = useRef<{ value: S } | null>(null)
  const [subscribe, read] = useMemo(() => {
    // A suspended render must leave the committed selector and its snapshot cache alone.
    let cache: { value: S } | null = null
    const read = () => {
      const { value } = form.trackSelector(select)
      const previous = cache ?? committed.current
      if (previous && (Object.is(previous.value, value) || deepEqual(previous.value, value))) {
        cache = previous
        return previous.value
      }
      cache = { value }
      return value
    }
    const subscribe = (onStoreChange: () => void) => {
      let stops: Array<() => void> = []
      let lastDeps: string[] | undefined
      const listen = () => {
        const { deps } = form.trackSelector(select)
        if (lastDeps?.length === deps.length && lastDeps.every((dep, index) => dep === deps[index])) return
        for (const stop of stops) stop()
        stops =
          deps.length > 0
            ? deps.map((dep) =>
                form.subscribeDep(dep, () => {
                  listen()
                  onStoreChange()
                }),
              )
            : [form.subscribeDebug(onStoreChange)]
        lastDeps = deps
      }
      listen()
      return () => {
        for (const stop of stops) stop()
      }
    }
    return [subscribe, read] as const
  }, [form, select])
  const value = useSyncExternalStore(subscribe, read, read)
  useEffect(() => { committed.current = { value } }, [value])
  return value
}
