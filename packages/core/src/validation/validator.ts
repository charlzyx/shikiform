import type { Scheduler } from '../effects/scheduler'
import { peelReadonly, readonlyValue } from '../draft/readonly'
import { deepEqual } from '../shared/equal'
import { getAt, normalizePath, parentPath } from '../shared/path'
import type { FlagName } from '../state/flags'
import { shownErrors, type FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import { scopeOf, type Pos } from '../shared/tree-ops'
import type { FieldError, ValidateTrigger } from '../types'
import type { FormOptions } from '../types-effects'
import { formatMessage, type FormMessageKey, type MessageArgs, type MessageParams } from './messages'
import { fieldSchemaIssues, optionIncludes, runRules, type ValidateCtx } from './rules'
import { runWarningRules } from './warnings'
import { collectSchemaIssues, groupSchemaIssues, isStandardSchema, schemaIssuePath, type SchemaIssue, type StandardSchemaV1 } from './schema'
import { scopeTest, validateScope, type RunResult, type ValidateScope, type ValidationPass } from './scope'
import { AsyncAttempts } from './async-attempt'
import { ignoreRejection, isPromise, settleUnlessAborted } from './settle'
import { clearInactiveErrors, noteFlagChange, type InactiveHost } from './inactive'

export interface ValidatorDeps {
  store: FieldStore<any>
  notifier: Notifier
  scheduler: Scheduler
  options: FormOptions<any>
  /** Tree position of `path` (the running `walk` instance first, then the registered tree). */
  readPos: (path: string) => Pos | undefined
}

/**
 * The validation pipeline: per-field rules (sync, async, Standard Schema), form-level `validate`,
 * debounce, stale-result dropping, and where messages land (`errors` vs `schemaErrors`).
 *
 * Per field: `rules` + `required` → `runRules` (sync messages + pending promises) and field schemas.
 * A pass is generation-stamped (`validateGen`); only the newest pass commits form-level issues.
 * A pass reads ONE immutable snapshot of `store.values` (writes replace the object), taken after `prepare`:
 * every field rule (value, ctx.record/root/parent/array/get) and the form-level `validate` see it (#1).
 * A field's async result is stamped with `asyncSeq` and its `AbortController`; a newer edit aborts it.
 * Abort removes that attempt from {@link Validator.inflight} immediately, so `waitAsync` / `submit` do not
 * wait for a validator that only clears a timer. A later resolve or reject does not write field errors.
 * A value change aborts an in-flight attempt even when the trigger is not `onChange`, and drops async
 * messages that attempt already wrote (#122). See {@link AsyncAttempts}.
 * A throwing field rule (sync throw or rejection, validator or schema) becomes that field's message (#2, #7).
 * Built-in messages (enum, fallback) resolve through `options.messages`, then the app defaults (#44).
 */
export class Validator {
  /** Form-level `validate` / field-schema messages by path. */
  schemaByPath = new Map<string, string[]>()
  /** Bumped at the start of each {@link Validator.validate}. Only the latest pass may commit. */
  validateGen = 0
  private resetVersion = 0
  /** Attempts `waitAsync` still has to finish. Aborted attempts are removed in the abort listener. */
  private inflight = new Set<Promise<unknown>>()
  /** Debounce timers and superseded async attempts (#122). */
  private readonly attempts: AsyncAttempts
  /** Runs before every pass. The engine expands item templates here. */
  prepare: () => void = () => {}
  /** The newest whole-form pass. A superseded `runSettled` adopts its verdict instead of failing (#41). */
  private latestFull?: ValidationPass
  private latest!: ValidationPass

  constructor(private readonly deps: ValidatorDeps) {
    const self = this
    this.attempts = new AsyncAttempts({
      store: deps.store, scheduler: deps.scheduler, notifier: deps.notifier, options: deps.options,
      get schemaByPath() { return self.schemaByPath },
      triggersFor: (path) => self.triggersFor(path),
      syncRuleMessages: (path) => self.syncRuleMessages(path),
      validateDetached: (path) => self.validateDetached(path),
      replaceSchema: (next) => self.applySchemaMap(next),
    })
  }

  /** A built-in message for this form (#44). */
  message<K extends FormMessageKey>(key: K, params: MessageParams<K>): string {
    return formatMessage(this.deps.options.messages, key, ...([params] as MessageArgs<K>))
  }

  private errorMessage(err: unknown, path: string, value: unknown): string {
    return err instanceof Error && err.message ? err.message : this.message('fallback', { path, value, error: err })
  }

  private get store() {
    return this.deps.store
  }

  /** Messages for every field that still validates (`visible && !disabled && !readOnly`). */
  errors(): FieldError[] {
    const out: FieldError[] = []
    for (const [path, field] of this.store.fields) {
      if (!this.store.acceptsValidation(path)) continue
      const messages = shownErrors(field)
      if (messages.length) out.push({ path, messages })
    }
    return out
  }

  /** A flag changed. See {@link noteFlagChange}. */
  noteFlags(path: string, names: readonly FlagName[]): void {
    noteFlagChange(this as unknown as InactiveHost, path, names)
  }

  triggersFor(path: string): ValidateTrigger[] {
    return this.store.get(path)?.triggers ?? this.deps.options.validateTrigger ?? ['onBlur', 'onSubmit']
  }

  async validate(path?: ValidateScope): Promise<FieldError[]> {
    const scope = typeof path === 'string' ? normalizePath(path) : path?.map(normalizePath)
    return validateScope(scope, () => this.run(scope), () => this.latest)
  }

  /**
   * One validation pass. `values` is the snapshot every rule saw; `current` is false when a newer pass
   * started meanwhile (the errors are then whatever is shown, not this pass's verdict).
   * `submit` compares `values` with the live values to know whether what it would submit was validated (#6).
   */
  run(path?: ValidateScope): Promise<RunResult> {
    const record: ValidationPass = { gen: 0, scope: path }
    // Registered when the pass takes its generation, before it notifies: a pass started from that
    // notification (re-entry) registers after it and is correctly the newer one.
    record.promise = this.runPass(path, (gen) => {
      this.latest = record
      record.gen = gen
      if (!path) this.latestFull = record
    })
    return record.promise
  }

  private async runPass(path: ValidateScope | undefined, onStart: (gen: number) => void): Promise<RunResult> {
    const { store, scheduler, notifier, options } = this.deps
    this.prepare()
    const gen = ++this.validateGen
    onStart(gen)
    const values = store.values
    const enumVersion = store.enumVersion
    const resetVersion = this.resetVersion
    const inScope = scopeTest(path)
    // Validating a field again replaces what the server said about it.
    if (typeof path === 'string' || path === undefined) this.clearExternalUnder(path)
    else for (const one of path) this.clearExternalUnder(one)
    store.validating = true
    scheduler.bumpMeta()
    notifier.emit()
    const scoped = (): RunResult => ({
      errors: this.errors().filter((e) => inScope(e.path)),
      values,
      enumVersion,
      resetVersion,
      current: gen === this.validateGen,
      gen,
    })
    try {
      const targets = [...store.fields.keys()].filter(inScope)
      const collected: SchemaIssue[] = []
      const preserve = new Set<string>()
      for (const target of targets) {
        if (gen !== this.validateGen) return scoped()
        const result = await this.validateOne(target, values)
        if (gen !== this.validateGen) return scoped()
        if (result.stale) preserve.add(target)
        else collected.push(...result.issues)
      }
      const validate = options.validate
      if (isStandardSchema(validate)) {
        const issues = await collectSchemaIssues(validate, values, (error, issuePath) =>
          this.message('fallback', { path: issuePath, value: getAt(values, issuePath), error }),
        )
        if (gen !== this.validateGen) return scoped()
        collected.push(...issues)
      } else if (typeof validate === 'function') {
        const extra = await validate(process.env.NODE_ENV !== 'production' ? readonlyValue(values, '') : values)
        if (gen !== this.validateGen) return scoped()
        collected.push(...recordToIssues(extra))
      }
      if (gen !== this.validateGen) return scoped()
      this.commitSchemaIssues(path, collected, preserve)
      // Not `waitAsync`: that would cancel the debounce an edit during this pass just scheduled (#122).
      await this.waitInflight()
      return scoped()
    } finally {
      if (gen === this.validateGen) {
        store.validating = false
        scheduler.bumpMeta()
        notifier.emit()
      }
    }
  }

  /** Wait for in-flight rules, then deliver the verdict in the same turn as the final snapshot check. */
  async submitVerdict<R>(finish: (errors: FieldError[] | null) => R): Promise<R> {
    await this.waitAsync()
    for (let pass = 0; pass < SETTLE_PASSES; pass++) {
      let result = await this.run()
      while (!result.current && this.latestFull?.promise && this.latestFull.gen > result.gen) {
        result = await this.latestFull.promise
      }
      if (!sameValues(result.values, this.store.values)) continue
      if (result.resetVersion !== this.resetVersion) continue
      if (this.deps.options.enumPolicy === 'error' && result.enumVersion !== this.store.enumVersion) continue
      if (result.current) return finish(result.errors)
    }
    return finish(null)
  }

  /**
   * Cross-field context over one snapshot (#1). `value`, `record`, `root`, `parent`, `array` and `get` all read
   * `values`, so a rule never compares a pending value with another version of its row. A future
   * draft-row validation must pass a snapshot with the draft set at its real row path, not a side channel.
   */
  /** Development read of one snapshot node. Production returns `value` unchanged. */
  private expose<V>(value: V, path: string): V {
    if (process.env.NODE_ENV === 'production') return value
    return readonlyValue(value, path)
  }

  private buildCtx(path: string, value: unknown, pos: Pos | undefined, values: unknown, signal?: AbortSignal): ValidateCtx {
    const scope = scopeOf(path)
    const ctx: ValidateCtx = {
      path,
      value: this.expose(value, path),
      record: scope.recordPath ? this.expose(getAt(values, scope.recordPath), scope.recordPath) : this.expose(values, ''),
      root: this.expose(values, ''),
      parent: scope.parentPath ? this.expose(getAt(values, scope.parentPath), scope.parentPath) : this.expose(values, ''),
      array: scope.arrayPath ? (this.expose(getAt(values, scope.arrayPath), scope.arrayPath) as any[]) : undefined,
      index: scope.index,
      get: (p) => this.expose(getAt(values, p), normalizePath(p)),
      pos,
      depth: pos?.length,
    }
    if (signal) ctx.signal = signal
    return ctx
  }

  private async validateOne(path: string, values: unknown): Promise<{ stale: boolean; issues: SchemaIssue[] }> {
    const { store, notifier, scheduler, options } = this.deps
    const field = store.get(path)
    if (!field) return { stale: false, issues: [] }
    if (!store.acceptsValidation(path)) {
      this.setErrors(path, [])
      this.setWarnings(path, [])
      field.schemaErrors = []
      this.schemaByPath.delete(path)
      if (field.externalErrors.length) field.externalErrors = []
      if (field.validating) {
        field.validating = false
        scheduler.bumpMeta()
      }
      return { stale: false, issues: [] }
    }
    field.abort?.abort()
    const ac = new AbortController()
    field.abort = ac
    const seq = ++field.asyncSeq
    const value = getAt(values, path)
    const ctx = this.buildCtx(path, value, this.deps.readPos(path) ?? undefined, values, ac.signal)
    // `level: 'warning'` rules report to `$warnings` / `binding.warnings`: shown, never blocking submit.
    const rules = field.rules.filter((rule) => rule.level !== 'warning')
    const warnRules = field.rules.filter((rule) => rule.level === 'warning')
    if (options.enumPolicy === 'error' && field.enumOptions && !optionIncludes(field.enumOptions, value)) {
      const enumMessage = this.message('enum', { path, value, options: field.enumOptions })
      rules.push({ validator: () => enumMessage })
    }
    const plain = rules.filter((rule) => !rule.schema)
    const { messages, pending } = runRules(value, plain, ctx, field.required, options.messages)
    const fallback = (issuePath: string) =>
      this.message('fallback', { path: issuePath ? `${path}.${issuePath}` : path, value: issuePath ? getAt(value, issuePath) : value, error: undefined })
    const warned = runWarningRules(value, warnRules, ctx, options.messages, (err) => this.errorMessage(err, path, value), fallback)
    const issues: SchemaIssue[] = []
    const schemaPending: Promise<SchemaIssue[]>[] = []
    for (const rule of rules) {
      if (!rule.schema) continue
      let result: ReturnType<StandardSchemaV1['~standard']['validate']>
      try {
        result = rule.schema['~standard'].validate(value)
      } catch (err) {
        issues.push({ path, message: this.errorMessage(err, path, value) })
        continue
      }
      if (isPromise(result)) {
        schemaPending.push(
          Promise.resolve(result).then((resolved) => {
            if (!resolved.issues?.length) return []
            return fieldSchemaIssues(
              path,
              resolved.issues.map((issue) => {
                const issuePath = schemaIssuePath(issue.path)
                return { path: issuePath, message: issue.message || fallback(issuePath) }
              }),
            )
          }),
        )
      } else if (result.issues?.length) {
        issues.push(
          ...fieldSchemaIssues(
            path,
            result.issues.map((issue) => {
              const issuePath = schemaIssuePath(issue.path)
              return { path: issuePath, message: issue.message || fallback(issuePath) }
            }),
          ),
        )
      }
    }
    const apply = (extra: string[], extraWarnings: string[] = []) => {
      if (field.asyncSeq !== seq || ac.signal.aborted) {
        this.attempts.release(field, ac)
        return { stale: true as const, issues: [] as SchemaIssue[] }
      }
      const was = field.validating
      field.validating = false
      this.setWarnings(path, [...warned.messages, ...extraWarnings])
      this.setErrors(path, [...messages, ...extra])
      if (was) scheduler.bumpMeta()
      return { stale: false as const, issues }
    }
    if (!pending.length && !schemaPending.length && !warned.pending.length) return apply([])
    field.validating = true
    notifier.bumpPath(path)
    scheduler.bumpMeta()
    const stale = () => {
      this.attempts.release(field, ac)
      return { stale: true as const, issues: [] as SchemaIssue[] }
    }
    const task = (async () => {
      // A validator we stop awaiting (abort mid-list) must not reject unhandled.
      for (const item of pending) ignoreRejection(item)
      for (const item of schemaPending) ignoreRejection(item)
      for (const item of warned.pending) ignoreRejection(item)
      const extra: string[] = []
      const extraWarnings: string[] = []
      for (const item of pending) {
        const outcome = await settleUnlessAborted(item, ac.signal)
        if (outcome.status === 'aborted' || field.asyncSeq !== seq || ac.signal.aborted) return stale()
        if (outcome.status === 'rejected') extra.push(this.errorMessage(outcome.reason, path, value))
        else if (outcome.value) extra.push(outcome.value)
      }
      for (const item of schemaPending) {
        const outcome = await settleUnlessAborted(item, ac.signal)
        if (outcome.status === 'aborted' || field.asyncSeq !== seq || ac.signal.aborted) return stale()
        if (outcome.status === 'rejected') issues.push({ path, message: this.errorMessage(outcome.reason, path, value) })
        else issues.push(...outcome.value)
      }
      for (const item of warned.pending) {
        const outcome = await settleUnlessAborted(item, ac.signal)
        if (outcome.status === 'aborted' || field.asyncSeq !== seq || ac.signal.aborted) return stale()
        if (outcome.status === 'fulfilled') extraWarnings.push(...outcome.value)
      }
      return apply(extra, extraWarnings)
    })()
    this.trackInflight(task, ac.signal)
    return task
  }

  /**
   * `waitAsync` waits on this set. Abort drops the attempt before its promise settles, so a validator
   * that never resolves after `signal` aborts cannot pin `submit`.
   */
  private trackInflight(task: Promise<unknown>, signal: AbortSignal): void {
    if (signal.aborted) return
    this.inflight.add(task)
    const drop = () => {
      this.inflight.delete(task)
    }
    signal.addEventListener('abort', drop, { once: true })
    void task.finally(() => {
      signal.removeEventListener('abort', drop)
      this.inflight.delete(task)
    })
  }

  /**
   * The array value changed (`push` / `remove` / `move` / …). Re-run this path's own rules when it already
   * shows errors, or when its trigger list includes `onChange` — the same rule as editing a field.
   * Descendants are not validated, so a new row does not grow
   * `required` errors before the next submit.
   */
  recheckOwn(path: string): void {
    const field = this.store.get(path)
    if (!field) return
    if (!this.triggersFor(path).includes('onChange') && !shownErrors(field).length) return
    if (field.externalErrors.length) this.setExternalMany([[path, []]])
    void this.applyOwn(path).catch((err: unknown) => {
      console.error('[shikiform] validation pass failed', err)
    })
  }

  /** Field-schema messages for `path` only. A schema that reports child paths waits for the next full pass. */
  private async applyOwn(path: string): Promise<void> {
    const result = await this.validateOne(path, this.store.values)
    if (result.stale) return
    const field = this.store.get(path)
    if (!field?.rules.some((rule) => rule.schema)) return
    if (result.issues.some((issue) => issue.path !== path)) return
    const next = new Map(this.schemaByPath)
    const messages = result.issues.flatMap((issue) => (issue.message ? [issue.message] : []))
    if (messages.length) next.set(path, messages)
    else next.delete(path)
    this.applySchemaMap(next)
  }

  /** A user edit. See {@link AsyncAttempts.onEdit}. */
  onEdit(path: string): void { this.attempts.onEdit(path) }

  /** Debounce async rules. Sync-only fields validate on the next turn of `validate`. */
  scheduleValidate(path: string): void { this.attempts.schedule(path) }

  /**
   * A pass nobody awaits (trigger, debounce timer, JSX release). Field rules never reject a pass; a throwing
   * form-level `validate` or a reaction error still could, so it is reported instead of being
   * left as an unhandled rejection. Awaited `validate()` / `submit()` pass those errors to the caller.
   */
  validateDetached(path: string): void {
    this.run(path).catch((err: unknown) => {
      console.error('[shikiform] validation pass failed', err)
    })
  }

  /** Wait until no field validator is in flight. Does not cancel a debounce a newer edit just scheduled. */
  private async waitInflight(): Promise<void> {
    while (this.inflight.size) await Promise.allSettled([...this.inflight])
  }

  /**
   * Cancel debounce timers and wait until no field validator is in flight. Aborted attempts are already gone.
   * `submit` uses this so it validates the current value now. A validation pass must not: clearing the timer
   * would drop the check that replaced it (#122).
   */
  async waitAsync(): Promise<void> {
    this.attempts.clearAll()
    await this.waitInflight()
  }

  /** Ignore an in-flight field validator. A late `apply` sees the bumped sequence and does not write. */
  discardInflight(field: FieldModel): void {
    field.abort?.abort()
    field.abort = undefined
    field.asyncSeq += 1
    if (field.validating) {
      field.validating = false
      this.deps.scheduler.bumpMeta()
    }
  }

  /** Recompute built-in messages only. Custom callbacks run in the managed validation pass, never in this preview. */
  syncRuleMessages(path: string): void {
    const field = this.store.get(path)
    if (!field) return
    if (!this.store.acceptsValidation(path)) {
      this.setErrors(path, [])
      this.setWarnings(path, [])
      return
    }
    const values = this.store.values
    const value = getAt(values, path)
    const ctx = this.buildCtx(path, value, this.deps.readPos(path), values)
    const builtins = field.rules.filter((rule) => !rule.schema).map((rule) => ({ ...rule, validator: undefined }))
    const { messages } = runRules(value, builtins.filter((rule) => rule.level !== 'warning'), ctx, field.required, this.deps.options.messages)
    const warnings = runRules(value, builtins.filter((rule) => rule.level === 'warning'), ctx, false, this.deps.options.messages)
    this.setWarnings(path, warnings.messages)
    this.setErrors(path, messages)
  }

  /** Remove a template instance, including a validator that has not resolved yet. */
  dropField(path: string): void {
    const field = this.store.get(path)
    if (!field) return
    this.discardInflight(field)
    this.attempts.clearTimer(path)
    this.schemaByPath.delete(path)
    this.store.setEnumOptions(field, undefined)
    this.store.fields.delete(path)
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.bumpMeta()
  }

  /** Reset invalidates an in-progress submit verdict even when resetting to the same values. */
  reset(path?: string): void {
    this.resetVersion += 1
    if (!path) this.schemaByPath = new Map()
    else {
      for (const key of [...this.schemaByPath.keys()]) {
        if (key === path || key.startsWith(path + '.')) this.schemaByPath.delete(key)
      }
    }
  }

  private commitSchemaIssues(scope: ValidateScope | undefined, issues: SchemaIssue[], preserve: Set<string>): void {
    const store = this.store
    const filtered = issues.filter((issue) => {
      if (!issue.message) return false
      if (!issue.path) return store.acceptsValidation('')
      return store.acceptsValidation(issue.path)
    })
    const grouped = groupSchemaIssues(filtered)
    const replaceAll = (scope === undefined || scope === '') && preserve.size === 0
    const inScope = scopeTest(scope)
    const next = replaceAll ? new Map<string, string[]>() : new Map(this.schemaByPath)
    const replaceable = (key: string) => {
      if (preserve.has(key)) return false
      for (const kept of preserve) {
        if (key.startsWith(kept + '.') || kept.startsWith(key + '.')) return false
      }
      return inScope(key)
    }
    if (!replaceAll) {
      for (const key of [...next.keys()]) if (replaceable(key)) next.delete(key)
    }
    for (const [key, messages] of grouped) {
      if (!replaceable(key)) continue
      next.set(key, messages)
    }
    this.applySchemaMap(next)
  }

  private applySchemaMap(next: Map<string, string[]>): void {
    const { notifier, scheduler } = this.deps
    const paths = new Set([...this.schemaByPath.keys(), ...next.keys()])
    this.schemaByPath = next
    let changed = false
    for (const path of paths) {
      const field = this.store.ensure(path)
      const messages = next.get(path) ?? []
      if (deepEqual(field.schemaErrors, messages)) continue
      field.schemaErrors = messages.slice()
      notifier.bumpPath(path)
      this.markChain(path, 'errors')
      changed = true
    }
    if (!changed) return
    scheduler.bumpMeta()
    if (!scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  /** Clear messages on `path` and descendants that no longer validate. */
  clearInactive(path: string): void {
    clearInactiveErrors(this as unknown as InactiveHost, path)
  }

  /** `level: 'warning'` messages of one field (`$warnings`, `binding.warnings`). They never block `canSubmit`. */
  setWarnings(path: string, messages: string[]): void {
    const field = this.store.get(path)
    if (!field || deepEqual(field.warnings, messages)) return
    field.warnings = messages
    this.deps.notifier.bumpPath(path)
    this.markChain(path, 'warnings')
    if (!this.deps.scheduler.flushing) {
      this.deps.scheduler.enqueueFromDirty()
      this.deps.scheduler.flush()
    }
  }

  setErrors(path: string, messages: string[]): void {
    const { notifier, scheduler } = this.deps
    const field = this.store.ensure(path)
    if (deepEqual(field.errors, messages)) return
    field.errors = messages
    notifier.bumpPath(path)
    this.markChain(path, 'errors')
    scheduler.bumpMeta()
    if (!scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  /**
   * External messages (`form.setErrors`, a server response). An empty list clears that path.
   * They show with rule and schema messages and block `canSubmit` until the value at, above or below the path
   * changes, the field validates again, or `reset` / `clearErrors` runs.
   */
  setExternalMany(entries: [string, string[]][]): void {
    for (const [input, messages] of entries) {
      const path = normalizePath(input)
      const field = this.store.ensure(path)
      if (deepEqual(field.externalErrors, messages)) continue
      field.externalErrors = messages.slice()
      this.afterErrorChange(path, false)
    }
    const { scheduler } = this.deps
    if (!scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  /** Drop external messages on `path`, its ancestors (root included) and descendants. Called when a value changes. */
  clearExternalAround(path: string): void {
    for (const [fieldPath, field] of this.store.fields) {
      if (!field.externalErrors.length) continue
      const related = !fieldPath || fieldPath === path || fieldPath.startsWith(path + '.') || path.startsWith(fieldPath + '.')
      if (!related) continue
      field.externalErrors = []
      this.afterErrorChange(fieldPath, false)
    }
  }

  /** Drop external messages on `path` and descendants (every field for no path). */
  clearExternalUnder(path?: string): void {
    for (const [fieldPath, field] of this.store.fields) {
      if (!field.externalErrors.length) continue
      if (path && fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      field.externalErrors = []
      this.afterErrorChange(fieldPath, false)
    }
  }

  /** `clearErrors(path?)`: rule, schema and external messages on `path` and descendants. */
  clearAll(path?: string): void {
    if (path) path = normalizePath(path)
    this.clearExternalUnder(path)
    this.clearSchemaMessages(path)
    for (const [fieldPath] of this.store.fields) {
      if (path && fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      this.setWarnings(fieldPath, [])
      this.setErrors(fieldPath, [])
    }
    const { scheduler } = this.deps
    if (!scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  private clearSchemaMessages(path?: string): void {
    const next = new Map(this.schemaByPath)
    for (const key of [...next.keys()]) if (!path || key === path || key.startsWith(path + '.')) next.delete(key)
    this.applySchemaMap(next)
  }

  private afterErrorChange(path: string, flush = true): void {
    const { notifier, scheduler } = this.deps
    notifier.bumpPath(path)
    this.markChain(path, 'errors')
    scheduler.bumpMeta()
    if (flush && !scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  /** `$errors` / `$warnings` of `path` and its descendants (all fields for the root). */
  aggregate(path: string, kind: 'errors' | 'warnings'): string[] {
    this.deps.scheduler.track(path, kind)
    const out: string[] = []
    for (const [fieldPath, field] of this.store.fields) {
      if (path && fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      if (!this.store.acceptsValidation(fieldPath)) continue
      if (kind === 'errors') out.push(...shownErrors(field))
      else out.push(...field.warnings)
    }
    return out
  }

  /** Field errors plus the root `:errors` dep, so `d.$errors` updates for a top-level field too. */
  /** Mark `<path>:<kind>` on the path, its ancestors and the root (`$errors` / `$warnings` aggregate descendants). */
  private markChain(path: string, kind: 'errors' | 'warnings'): void {
    const scheduler = this.deps.scheduler
    for (let cursor: string | null = path; cursor; cursor = parentPath(cursor)) scheduler.markDirty(`${cursor}:${kind}`)
    scheduler.markDirty(`:${kind}`)
  }
}

function recordToIssues(extra: Partial<Record<string, string>> | void): SchemaIssue[] {
  if (!extra) return []
  return Object.entries(extra)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([path, message]) => ({ path: normalizePath(path), message }))
}

/** Passes {@link Validator.submitVerdict} may run while validation inputs keep changing. */
const SETTLE_PASSES = 3

/** Writes replace the values object, so identity is the fast path; equal content counts as unchanged. */
function sameValues(a: unknown, b: unknown): boolean {
  if (process.env.NODE_ENV !== 'production') {
    a = peelReadonly(a)
    b = peelReadonly(b)
  }
  return a === b || deepEqual(a, b)
}

