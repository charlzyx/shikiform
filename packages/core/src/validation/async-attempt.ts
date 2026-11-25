import type { Scheduler } from '../effects/scheduler'
import { deepEqual } from '../shared/equal'
import { getAt } from '../shared/path'
import { shownErrors, type FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { ValidateTrigger } from '../types'
import type { FormOptions } from '../types-effects'
import { scopeTest } from './scope'

/**
 * Debounce and supersede bookkeeping for async field rules (#122).
 * A value change aborts an attempt that is still in flight, even when the trigger is not `onChange`.
 * Messages that attempt already wrote come off the field immediately; `validating` stays set until the
 * replacement check applies, so `$canSubmit` returns when that check passes. The pass being superseded
 * must not cancel the debounce this edit just scheduled — only {@link AsyncAttempts.clearUnder} does that,
 * and `submit` calls it before validating the current value now.
 */
export class AsyncAttempts {
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private replacedFields = new Map<FieldModel, unknown>()

  constructor(private readonly host: AsyncAttemptHost) {}

  /** A user edit. Recheck on `onChange`, when an error is showing, or while an async attempt is still pending. */
  onEdit(path: string): void {
    const field = this.host.store.get(path)
    if (!field) return
    if (!this.host.triggersFor(path).includes('onChange') && !shownErrors(field).length && !this.hasPending(field)) return
    this.schedule(path, true)
  }

  private hasPending(field: FieldModel): boolean {
    return this.timers.has(field.path) || field.validating || field.warningValidating
  }

  noteReplacement(path: string, before: unknown): void {
    const { store } = this.host
    if (path && !store.parents.has(path)) return
    const prefix = path ? path + '.' : ''
    for (const field of store.fields.values()) {
      if (!this.hasPending(field) || field.path === path || !field.path.startsWith(prefix) || this.replacedFields.has(field)) continue
      this.replacedFields.set(field, getAt(before, field.path))
    }
  }

  /** Use the final value after reactions settle, including replacements made inside the same batch. */
  recheckReplacedFields(): void {
    const replaced = this.replacedFields
    if (!replaced.size) return
    this.replacedFields = new Map()
    const { store } = this.host
    for (const [field, before] of replaced) {
      const { path } = field
      if (store.get(path) === field && this.hasPending(field) && !deepEqual(before, getAt(store.values, path))) this.onEdit(path)
    }
  }

  /**
   * Debounce async rules. Sync-only fields validate on the next turn.
   * `valueChanged` drops async messages from the attempt this edit supersedes.
   */
  schedule(path: string, valueChanged = false): void {
    const field = this.host.store.ensure(path)
    const ms = field.asyncDebounceMs ?? this.host.options.asyncDebounceMs ?? 0
    const asyncRules = field.rules.filter((rule) => rule.validator || rule.schema)
    const supersede = valueChanged && asyncRules.some((rule) => rule.level !== 'warning') && (field.validating || shownErrors(field).length > 0)
    if (ms > 0 && asyncRules.length) {
      this.clearTimer(path)
      field.abort?.abort()
      field.asyncSeq += 1
      const seq = field.asyncSeq
      if (supersede) this.dropSuperseded(field)
      // A nested edit (a reaction on the cleared error) scheduled its own check.
      if (field.asyncSeq !== seq) return
      const timer = setTimeout(() => {
        this.timers.delete(path)
        this.host.validateDetached(path)
      }, ms)
      this.timers.set(path, timer)
      return
    }
    if (supersede) {
      field.abort?.abort()
      field.asyncSeq += 1
      const seq = field.asyncSeq
      this.dropSuperseded(field)
      if (field.asyncSeq !== seq) return
    }
    this.host.validateDetached(path)
  }

  /** Attempt `ac` will not write. Keep `validating` when a replacement debounce is already queued. */
  release(field: FieldModel, ac: AbortController): void {
    if (field.abort !== ac || !field.validating) return
    if (this.timers.has(field.path)) return
    field.validating = false
    this.host.scheduler.bumpMeta()
    this.host.notifier.bumpPath(field.path)
    if (!this.host.scheduler.flushing) this.host.notifier.emit()
  }

  clearTimer(path: string): void {
    const timer = this.timers.get(path)
    if (!timer) return
    clearTimeout(timer)
    this.timers.delete(path)
  }

  /** Cancel queued checks within a reset scope, or all checks before a submit. */
  clearUnder(path?: string): void {
    const inScope = scopeTest(path)
    for (const key of this.timers.keys()) {
      if (inScope(key)) this.clearTimer(key)
    }
  }

  /** Drop async messages from a superseded attempt and hold `validating` for the replacement check. */
  private dropSuperseded(field: FieldModel): void {
    const { scheduler, notifier } = this.host
    if (!field.validating) {
      field.validating = true
      scheduler.bumpMeta()
      notifier.bumpPath(field.path)
    }
    if (this.host.schemaByPath.has(field.path)) {
      const next = new Map(this.host.schemaByPath)
      next.delete(field.path)
      this.host.replaceSchema(next)
    }
    this.host.syncRuleMessages(field.path)
    if (!scheduler.flushing) notifier.emit()
  }
}

export interface AsyncAttemptHost {
  readonly store: FieldStore<any>
  readonly scheduler: Scheduler
  readonly notifier: Notifier
  readonly options: FormOptions<any>
  schemaByPath: Map<string, string[]>
  triggersFor(path: string): ValidateTrigger[]
  syncRuleMessages(path: string): void
  validateDetached(path: string): void
  replaceSchema(next: Map<string, string[]>): void
}
