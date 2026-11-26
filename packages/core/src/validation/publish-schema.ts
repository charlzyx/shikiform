import type { Scheduler } from '../effects/scheduler'
import { deepEqual } from '../shared/equal'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'

/** Publish changed schema messages and notify field and form readers. */
export function syncSchemaMessages(
  { store, notifier, scheduler }: { store: FieldStore<any>; notifier: Notifier; scheduler: Scheduler },
  previous: Map<string, string[]>,
  next: Map<string, string[]>,
  markErrors: (path: string) => void,
  reindex: boolean,
): void {
  const paths = new Set([...previous.keys(), ...next.keys()])
  let changed = false
  for (const path of paths) {
    const messages = next.get(path) ?? []
    // The structure op still owns the flush and may re-create declarations after writing the new values.
    const field = messages.length && !reindex ? store.ensure(path) : store.get(path)
    if (!field || deepEqual(field.schemaErrors, messages)) continue
    field.schemaErrors = messages.slice()
    notifier.bumpPath(path)
    markErrors(path)
    changed = true
  }
  if (!changed) return
  scheduler.bumpMeta()
  if (!reindex && !scheduler.flushing) {
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }
}
