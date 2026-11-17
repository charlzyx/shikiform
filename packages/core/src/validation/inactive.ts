import type { Scheduler } from '../effects/scheduler'
import type { FlagName } from '../state/flags'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'

/** What {@link noteFlagChange} needs from the validator. Passed from the class so privates stay there. */
export interface InactiveHost {
  deps: { notifier: Notifier; scheduler: Scheduler; store: FieldStore<any> }
  schemaByPath: Map<string, string[]>
  setErrors(path: string, messages: string[]): void
  setWarnings(path: string, messages: string[]): void
  afterErrorChange(path: string, flush?: boolean): void
}

function hasDescendants(store: FieldStore<any>, path: string): boolean {
  return !path || store.parents.has(path)
}

/** A flag changed: re-render descendants of an inherited flag, wake readers, and clear errors that no longer apply. */
export function noteFlagChange(host: InactiveHost, path: string, names: readonly FlagName[]): void {
  const { notifier, scheduler, store } = host.deps
  notifier.bumpPath(path)
  if (names.some((name) => name !== 'omit') && hasDescendants(store, path)) {
    const prefix = path ? path + '.' : ''
    for (const fieldPath of store.fields.keys()) {
      if (fieldPath && fieldPath !== path && fieldPath.startsWith(prefix)) notifier.bumpPath(fieldPath)
    }
  }
  for (const name of names) scheduler.markDirty(`${path}:${name}`)
  if (names.some((name) => name === 'visible' || name === 'disabled' || name === 'readOnly')) clearInactiveErrors(host, path)
}

function clearOne(host: InactiveHost, fieldPath: string): void {
  const field = host.deps.store.get(fieldPath)
  if (!field || host.deps.store.acceptsValidation(fieldPath)) return
  if (!field.errors.length && !field.warnings.length && !field.schemaErrors.length && !field.externalErrors.length) return
  host.setErrors(fieldPath, [])
  host.setWarnings(fieldPath, [])
  field.schemaErrors = []
  field.externalErrors = []
  host.schemaByPath.delete(fieldPath)
  host.afterErrorChange(fieldPath, false)
}

/** Drop messages on `path` and descendants that are hidden, disabled, or read-only. */
export function clearInactiveErrors(host: InactiveHost, path: string): void {
  const store = host.deps.store
  if (path && !hasDescendants(store, path)) {
    clearOne(host, path)
    return
  }
  for (const [fieldPath] of store.fields) {
    const inScope = !path || fieldPath === path || fieldPath.startsWith(path + '.')
    if (inScope) clearOne(host, fieldPath)
  }
}
