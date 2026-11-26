import type { Declarations } from '../declarations/declarations'
import { copyData } from '../draft/plain-clone'
import { guardReactionAction, isWatchRunner, type Scheduler } from '../effects/scheduler'
import { deepEqual, differsExcept } from '../shared/equal'
import { getAt, normalizePath, selfAndAncestors, setAt } from '../shared/path'
import { resetRowIds } from '../shared/reset-row-paths'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { ArrayOps } from '../structure/arrays'
import type { TreeOps } from '../structure/trees'
import type { FieldError, WriteOp } from '../types'
import type { Validator } from '../validation/validator'

/**
 * The initial-values baseline: derived `dirty` (#39) and the notifications when values or the baseline are
 * replaced wholesale (`reset`, `reset(values)`, `setInitialValues`, #33).
 * `dirty` is never stored: it is values vs `initial`, deep compared, ignoring own `omit` and computed fields.
 * An omitted path is skipped whole, so descendants are ignored with it (they also read `$omit` as true).
 * A hidden field still counts.
 */
export class Baseline {
  /** Last derived form-level `dirty`, with the inputs it was derived from (values / initial are replaced, never mutated). */
  private cache?: { values: unknown; initial: unknown; skip: string; dirty: boolean }
  private notified = false
  private readonly baselines = new WeakMap<WriteOp, { values: unknown }>()

  private readonly store: FieldStore<any>
  private readonly notifier: Notifier
  private readonly scheduler: Scheduler

  constructor(private readonly deps: {
    store: FieldStore<any>
    notifier: Notifier
    scheduler: Scheduler
    validator: Validator
    declarations: Declarations
    arrays: ArrayOps
    trees: TreeOps
  }) {
    this.store = deps.store
    this.notifier = deps.notifier
    this.scheduler = deps.scheduler
  }

  /** `form.reset()`, `reset(path)`, `reset(values)` (new baseline first). See `FormEngine.reset`. */
  reset(pathOrValues?: string | object): void {
    const { store, scheduler } = this.deps
    const inReaction = guardReactionAction(scheduler, 'reset')
    const path = typeof pathOrValues === 'string' ? normalizePath(pathOrValues) : undefined
    const baseline = pathOrValues && typeof pathOrValues === 'object' ? { values: copyData(pathOrValues) } : undefined
    if (!inReaction && scheduler.writes.recording) {
      const ops = scheduler.writes.pending
      let initial = baseline?.values ?? store.initial
      if (!baseline) {
        for (let i = ops.length - 1; i >= 0; i--) {
          const prior = this.baselines.get(ops[i])
          if (!prior) continue
          initial = prior.values
          break
        }
      }
      const value = copyData(path ? getAt(initial, path) : initial)
      const before = scheduler.writes.values(store.values)
      const after = path ? setAt(before, path, value) : value
      const op: WriteOp = {
        key: `${path ?? ''}:reset`,
        apply: () => {
          this.applyReset(path, baseline, store.values === before ? after : path ? setAt(store.values, path, value) : value)
          return true
        },
      }
      if (baseline) this.baselines.set(op, baseline)
      scheduler.writes.stageValue(after, op)
      return
    }
    const initial = baseline?.values ?? store.initial
    const value = copyData(path ? getAt(initial, path) : initial)
    this.applyReset(path, baseline, path ? setAt(store.values, path, value) : value)
  }

  private applyReset(path: string | undefined, baseline: { values: unknown } | undefined, values: unknown): void {
    const { store, notifier, scheduler, validator, declarations, arrays, trees } = this.deps
    if (baseline) store.initial = baseline.values
    const before = store.values
    store.values = values
    validator.reset(path, () => resetRowIds(path ?? '', before, values, {
      rowKey: (path) => trees.childRowKey(path) ?? arrays.rowKey(path),
      treeAt: (path) => trees.root(path) === path ? trees.config(path) : undefined,
    }))
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
      field.warningValidating = false
      field.abort?.abort()
      notifier.bumpPath(field.path)
    }
    this.notifyValueReaders(path ?? '')
    scheduler.enqueueFromDirty()
    declarations.applyItemTemplates()
    scheduler.bumpMeta()
    for (const rec of scheduler.eachRecs.values()) rec.first = true
    for (const id of scheduler.runners.keys()) {
      if (isWatchRunner(id)) continue
      scheduler.queue(id)
    }
    scheduler.flush()
  }

  /** `form.setInitialValues(values)`: replace the baseline, keep the values. */
  setInitial(values: unknown): void {
    const baseline = { values: copyData(values) }
    const op = this.scheduler.writes.stageAction(() => this.applyInitial(baseline.values))
    if (op) this.baselines.set(op, baseline)
    else this.applyInitial(baseline.values)
  }

  private applyInitial(values: unknown): void {
    const { store, scheduler } = this
    store.initial = values
    this.notifyValueReaders('')
    scheduler.bumpMeta()
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }


  /**
   * Exact paths whose values never count as a change: own `omit` and computed fields. Sorted for the cache key.
   * Descendants are not listed: {@link differsExcept} skips an omitted path's whole subtree, which is the
   * inherited-`omit` set. Listing every descendant would walk ancestors once per field on every compare.
   */
  private skipPaths(): string[] {
    const out: string[] = []
    for (const [path, field] of this.store.fields) {
      if (path && (field.computed || this.store.own(path, 'omit') === true)) out.push(path)
    }
    return out.sort()
  }

  formDirty(): boolean {
    if (this.store.own('', 'omit') === true) return false
    const { values, initial } = this.store
    const skip = this.skipPaths()
    const key = JSON.stringify(skip)
    const cached = this.cache
    if (cached && cached.values === values && cached.initial === initial && cached.skip === key) return cached.dirty
    const dirty = differsExcept(values, initial, '', skip)
    this.cache = { values, initial, skip: key, dirty }
    return dirty
  }

  /**
   * The value at `path` differs from its initial value, ignoring own-`omit` / computed descendants.
   * A descendant of an omitted field is not dirty. This node's own `omit` does not short-circuit,
   * so the field can be dirty while {@link Baseline.formDirty} skips the path and its subtree.
   * Walking ancestors is O(depth); the form-level compare still uses {@link skipPaths}.
   */
  fieldDirty(path: string): boolean {
    if (this.inheritedOmit(path)) return false
    const current = getAt(this.store.values, path)
    const initial = getAt(this.store.initial, path)
    if (!this.store.parents.has(path)) return !deepEqual(current, initial)
    return differsExcept(current, initial, path, this.skipPaths())
  }

  /** Some ancestor's own `omit` is set. This node's own `omit` does not count. */
  private inheritedOmit(path: string): boolean {
    const chain = selfAndAncestors(path)
    for (let i = 1; i < chain.length; i++) {
      if (this.store.own(chain[i]!, 'omit') === true) return true
    }
    return false
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

