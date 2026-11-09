import type { Declarations } from '../declarations/declarations'
import { unwrapReadonly } from '../draft/readonly'
import type { Scheduler } from '../effects/scheduler'
import { clone, differsExcept } from '../shared/equal'
import { getAt, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { FieldError } from '../types'
import type { Validator } from '../validation/validator'

/**
 * The initial-values baseline: derived `dirty` (#39) and the notifications when values or the baseline are
 * replaced wholesale (`reset`, `reset(values)`, `setInitialValues`, #33).
 * `dirty` is never stored: it is values vs `initial`, deep compared, ignoring `display: 'virtual'` and computed fields.
 * `none` still counts.
 */
export class Baseline {
  /** Last derived form-level `dirty`, with the inputs it was derived from (values / initial are replaced, never mutated). */
  private cache?: { values: unknown; initial: unknown; skip: string; dirty: boolean }
  private notified = false

  private readonly store: FieldStore<any>
  private readonly notifier: Notifier
  private readonly scheduler: Scheduler

  constructor(private readonly deps: {
    store: FieldStore<any>
    notifier: Notifier
    scheduler: Scheduler
    validator: Validator
    declarations: Declarations
  }) {
    this.store = deps.store
    this.notifier = deps.notifier
    this.scheduler = deps.scheduler
  }

  /** `form.reset()`, `reset(path)`, `reset(values)` (new baseline first). See `FormEngine.reset`. */
  reset(pathOrValues?: string | object): void {
    const { store, notifier, scheduler, validator, declarations } = this.deps
    let path: string | undefined
    if (pathOrValues != null && typeof pathOrValues === 'object') store.initial = plainClone(pathOrValues)
    else if (pathOrValues) path = String(pathOrValues)
    if (path) store.values = setAt(store.values, path, clone(getAt(store.initial, path)))
    else store.values = clone(store.initial)
    if (!path) store.edited = false
    for (const field of store.fields.values()) {
      if (path && field.path !== path && !field.path.startsWith(path + '.')) continue
      field.errors = []
      field.schemaErrors = []
      field.externalErrors = []
      field.warnings = []
      field.touched = false
      field.edited = false
      field.validating = false
      field.abort?.abort()
      notifier.bumpPath(field.path)
    }
    validator.clearSchema(path)
    this.notifyValueReaders(path ?? '')
    scheduler.enqueueFromDirty()
    declarations.applyItemTemplates()
    scheduler.bumpMeta()
    for (const rec of scheduler.eachRecs.values()) rec.first = true
    for (const id of scheduler.runners.keys()) {
      if (id.startsWith('watch')) continue
      scheduler.queue(id)
    }
    scheduler.flush()
  }

  /** `form.setInitialValues(values)`: replace the baseline, keep the values. */
  setInitial(values: unknown): void {
    const { store, scheduler } = this
    store.initial = plainClone(values)
    this.notifyValueReaders('')
    scheduler.bumpMeta()
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }


  /** Exact paths whose values never count as a change: own `display: 'virtual'` and computed fields. Sorted for the cache key. */
  private skipPaths(): string[] {
    const out: string[] = []
    for (const [path, field] of this.store.fields) {
      if (path && (field.computed || (field.hasDisplay && field.display === 'virtual'))) out.push(path)
    }
    return out.sort()
  }

  formDirty(): boolean {
    const { values, initial } = this.store
    const skip = this.skipPaths()
    const key = skip.join('\n')
    const cached = this.cache
    if (cached && cached.values === values && cached.initial === initial && cached.skip === key) return cached.dirty
    const dirty = differsExcept(values, initial, '', skip)
    this.cache = { values, initial, skip: key, dirty }
    return dirty
  }

  /** The value at `path` differs from its initial value, ignoring `virtual` display / computed descendants. */
  fieldDirty(path: string): boolean {
    return differsExcept(getAt(this.store.values, path), getAt(this.store.initial, path), path, this.skipPaths())
  }

  /** After a flush: tell meta subscribers (`useFormState`, `subscribeMeta`) when form-level `dirty` flipped. */
  sync(): void {
    const dirty = this.formDirty()
    if (dirty === this.notified) return
    this.notified = dirty
    this.notifier.bumpMeta()
  }

  /**
   * `reset` / `setInitialValues` replace values or the baseline wholesale: wake `$value` / `$dirty` readers
   * (reactions and `useWatch`) on `path`, its ancestors and descendants, and re-render array / tree structure.
   * Watch effects are not queued; `reset` decides which runners run again.
   */
  notifyValueReaders(path: string): void {
    const { notifier, scheduler } = this
    const related = (depPath: string) => !path || !depPath || depPath === path || depPath.startsWith(path + '.') || path.startsWith(depPath + '.')
    for (const dep of [...notifier.depListenerKeys()]) {
      const at = dep.lastIndexOf(':')
      const state = dep.slice(at + 1)
      if ((state === 'value' || state === 'structure' || state === 'dirty') && related(dep.slice(0, at))) notifier.bumpDep(dep)
    }
    // Runners reading `$dirty` re-run (the baseline may have moved); `$value` watches are not woken by this.
    for (const dep of [...scheduler.depKeys()]) {
      const at = dep.lastIndexOf(':')
      if (dep.slice(at + 1) === 'dirty' && related(dep.slice(0, at))) scheduler.markDirty(dep)
    }
    for (const structPath of notifier.structureKeys()) {
      if (related(structPath)) notifier.bumpStructure(structPath)
    }
    for (const fieldPath of this.store.fields.keys()) if (related(fieldPath)) notifier.bumpPath(fieldPath)
  }
}

/** `setErrors` input as `[path, messages]` pairs. A `null` / empty entry clears that path. */
export function errorEntries(errors: Record<string, string | string[] | null | undefined> | FieldError[]): [string, string[]][] {
  if (Array.isArray(errors)) return errors.map((e) => [e.path, e.messages.filter(Boolean)])
  return Object.entries(errors).map(([path, m]) => [path, (m == null ? [] : Array.isArray(m) ? m : [m]).filter(Boolean)])
}

/** Clone caller data, unwrapping development read-only views (`d.x.$value`) first. */
function plainClone<V>(value: V): V {
  return clone(process.env.NODE_ENV !== 'production' ? unwrapReadonly(value) : value)
}
