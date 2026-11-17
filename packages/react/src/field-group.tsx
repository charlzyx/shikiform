import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react'
import type { FieldError } from '@shikiform/core/internal'
import type { FormEngine } from '@shikiform/core/internal'
import { useRequiredForm } from './context'
import { useWatch } from './hooks/use-watch'

/**
 * A set of field paths collected from the JSX below a {@link FieldGroup}: every `<Field>` / `useField(name)` /
 * `<ArrayField>` mounted inside registers its absolute path while mounted (nested groups register into every
 * enclosing group). It owns no state of the form; it only answers "which fields are inside this region".
 *
 * Layout containers use it to badge a tab with the errors of its fields (`FormTab`, `FormCollapse`) and to validate
 * one step (`FormStep`: `form.validate(group.paths())`). A pure-layout `FormItem` could aggregate its children's
 * errors the same way.
 */
export interface FieldGroupHandle {
  /** Absolute paths mounted inside the group, in mount order. A path mounted twice is listed once. */
  paths(): string[]
  /** Called after a path is added or removed. */
  subscribe(listener: () => void): () => void
  /** Bumped on every add / remove (a `useSyncExternalStore` snapshot). */
  version(): number
}

/** Internal: the registry behind a {@link FieldGroupHandle}. */
export class FieldGroupStore implements FieldGroupHandle {
  private counts = new Map<string, number>()
  private listeners = new Set<() => void>()
  private ver = 0

  paths = (): string[] => [...this.counts.keys()]
  version = (): number => this.ver
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** Register `path` until the returned function runs. */
  add(path: string): () => void {
    this.counts.set(path, (this.counts.get(path) ?? 0) + 1)
    this.changed()
    let done = false
    return () => {
      if (done) return
      done = true
      const left = (this.counts.get(path) ?? 1) - 1
      if (left > 0) this.counts.set(path, left)
      else this.counts.delete(path)
      this.changed()
    }
  }

  private changed(): void {
    this.ver++
    for (const listener of [...this.listeners]) listener()
  }
}

/** Internal: `add(path)` registers into the nearest group and every group around it. */
interface GroupRegistrar {
  add(path: string): () => void
}

export const FieldGroupContext = createContext<GroupRegistrar | null>(null)

/** Create a group handle that lives as long as the component (pass it to {@link FieldGroup}). */
export function useFieldGroup(): FieldGroupHandle {
  const [group] = useState(() => new FieldGroupStore())
  return group
}

/**
 * Collect the fields rendered inside `children` into `value` (from {@link useFieldGroup}). Renders no DOM.
 *
 * ```tsx
 * const group = useFieldGroup()
 * const errors = useFieldGroupErrors(group)        // FieldError[] of the fields inside
 * <FieldGroup value={group}><Field name="a" … /><Field name="b" … /></FieldGroup>
 * await form.validate(group.paths())                // validate only those fields
 * ```
 */
export function FieldGroup({ value, children }: { value: FieldGroupHandle; children?: ReactNode }) {
  const parent = useContext(FieldGroupContext)
  const registrar = useMemo<GroupRegistrar>(
    () => ({
      add(path) {
        const own = (value as FieldGroupStore).add(path)
        const up = parent?.add(path)
        return () => {
          own()
          up?.()
        }
      },
    }),
    [value, parent],
  )
  return <FieldGroupContext.Provider value={registrar}>{children}</FieldGroupContext.Provider>
}

/** Internal: register `path` with the enclosing groups while mounted (`useField(name)`, `useArray(name)`). No path skips it. */
export function useFieldGroupRegistration(path: string | undefined): void {
  const registrar = useContext(FieldGroupContext)
  useEffect(() => (path && registrar ? registrar.add(path) : undefined), [registrar, path])
}

const ids = new WeakMap<object, number>()
let nextId = 0
function groupId(group: FieldGroupHandle): number {
  let id = ids.get(group)
  if (id === undefined) ids.set(group, (id = ++nextId))
  return id
}

function inPaths(path: string, paths: readonly string[]): boolean {
  for (const one of paths) if (path === one || path.startsWith(one + '.') || one === '') return true
  return false
}

/** Internal: the shown errors of each group (one entry per field with messages), re-rendering when they change. */
export function useGroupsErrors(form: FormEngine<any, any>, groups: readonly FieldGroupHandle[]): FieldError[][] {
  const key = groups.map(groupId).join(',')
  const subscribe = useCallback(
    (onChange: () => void) => {
      const stops = groups.map((group) => group.subscribe(onChange))
      return () => {
        for (const stop of stops) stop()
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  )
  const snapshot = () => groups.map((group) => group.version()).join(',')
  const versions = useSyncExternalStore(subscribe, snapshot, snapshot)
  const select = useCallback(
    (d: any) => {
      // Root `$errors` is a dependency on every error change; the filter decides whether this group changed.
      void d.$errors
      const all = form.errors
      return groups.map((group) => {
        const paths = group.paths()
        return paths.length ? all.filter((error) => inPaths(error.path, paths)) : []
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form, versions, key],
  )
  return useWatch(select)
}

/**
 * The errors of the fields inside a {@link FieldGroup}: one `{ path, messages }` per field with shown errors
 * (display `none` excluded), re-rendering only when that list changes. `errors.length` is a tab's badge count.
 */
export function useFieldGroupErrors(group: FieldGroupHandle): FieldError[] {
  const form = useRequiredForm('useFieldGroupErrors()')
  return useGroupsErrors(form, [group])[0]!
}
