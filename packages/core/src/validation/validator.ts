import type { Scheduler } from '../effects/scheduler'
import { peelReadonly, readonlyValue } from '../draft/readonly'
import { deepEqual } from '../shared/equal'
import { getAt, normalizePath, parentPath } from '../shared/path'
import { rowPathAfter, rowPathAfterReplacement, type RowPathMap } from '../shared/row-paths'
import type { FlagName } from '../state/flags'
import { shownErrors, type FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import { scopeOf, type Pos } from '../shared/tree-ops'
import type { FieldError, ValidateTrigger } from '../types'
import type { FormOptions } from '../types-effects'
import { formatMessage, type FormMessageKey, type MessageArgs, type MessageParams } from './messages'
import { fieldSchemaIssues, InvalidValidatorResult, optionIncludes, runRules, type ValidateCtx } from './rules'
import { publishWarnings, runWarningRules } from './warnings'
import { collectSchemaIssues, groupSchemaIssues, isStandardSchema, recordToIssues, schemaIssues, type SchemaIssue, type StandardSchemaV1 } from './schema'
import { liveScope, mergeSchemaScope, resetOverlaps, scopeTest, validateScope, type RunResult, type ValidateScope, type ValidationPass } from './scope'
import { AsyncAttempts } from './async-attempt'
import { ignoreRejection, isPromise, settleUnlessAborted, valueUnlessAborted } from './settle'
import { clearInactiveErrors, noteFlagChange, type InactiveHost } from './inactive'
import { reindexSchemaPaths, SnapshotRows } from './row-paths'
import { syncSchemaMessages } from './publish-schema'

export interface ValidatorDeps {
  store: FieldStore<any>
  notifier: Notifier
  scheduler: Scheduler
  options: FormOptions<any>
  /** Tree position of `path` (the running `walk` instance first, then the registered tree). */
  readPos: (path: string) => Pos | undefined
}

interface FieldCheck {
  current: () => boolean
  /** Paths relative to the checked field's snapshot coordinate. */
  issues: SchemaIssue[]
}

/** Run field and form rules over one value snapshot and discard superseded results. */
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
  private snapshotRows?: SnapshotRows
  private readonly requestedRows = new Set<SnapshotRows>()

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
    const rows = new SnapshotRows()
    this.requestedRows.add(rows)
    try {
      return await validateScope(this.start(scope, undefined, rows),
        (scope, includes) => this.start(scope, undefined, undefined, includes).promise!, () => this.latest)
    } finally {
      this.requestedRows.delete(rows)
    }
  }

  /**
   * One validation pass. `values` is the snapshot every rule saw; `current` is false when a newer pass
   * started meanwhile (the errors are then whatever is shown, not this pass's verdict).
   * `submit` compares `values` with the live values to know whether what it would submit was validated (#6).
   */
  run(path?: ValidateScope, signal?: AbortSignal): Promise<RunResult> {
    return this.start(path, signal).promise!
  }

  private start(path?: ValidateScope, signal?: AbortSignal, rows = new SnapshotRows(), includes = scopeTest(path)): ValidationPass {
    const record: ValidationPass = { gen: 0, scope: path }
    record.promise = this.runPass(record, rows, includes, signal)
    return record
  }

  private async runPass(record: ValidationPass, rows: SnapshotRows, inScope: (path: string) => boolean, signal?: AbortSignal): Promise<RunResult> {
    const { store, scheduler, notifier, options } = this.deps
    const { scope: path } = record
    this.prepare()
    const gen = ++this.validateGen
    // Register before emitting so a pass started by a subscriber is correctly the newer one.
    record.gen = gen
    this.latest = record
    if (!path) this.latestFull = record
    const values = store.values
    this.snapshotRows = rows
    const enumVersion = store.enumVersion
    const resetVersion = this.resetVersion
    const superseded = () => signal?.aborted || gen !== this.validateGen
    const targets = [...store.fields].filter(([target]) => inScope(target))
    const live = record.live = liveScope(path, inScope, rows, () => targets.flatMap(([from, field]) =>
      from !== field.path && store.get(field.path) === field ? [field.path] : []))
    const warnings: Promise<void>[] = []
    // Validating a field again replaces what the server said about it.
    this.clearExternalWhere(inScope)
    store.validating = !!options.validate || targets.some(([target, field]) =>
      store.acceptsValidation(target) && (field.required || field.rules.some((rule) => rule.level !== 'warning') ||
        (options.enumPolicy === 'error' && field.enumOptions !== undefined)))
    scheduler.bumpMeta()
    notifier.emit()
    const scoped = (errors = this.errors()): RunResult => {
      const includes = live.filter()
      return { errors: errors.filter(({ path }) => includes(path)), values, enumVersion, resetVersion, warnings,
        current: gen === this.validateGen, gen }
    }
    try {
      const collected: SchemaIssue[] = []
      const checked = new Map<FieldModel, FieldCheck>()
      for (const [target, field] of targets) {
        if (superseded() || record.invalidatedByReset) return scoped()
        const result = await this.validateOne(target, field, values, signal, warnings)
        if (result) checked.set(field, result)
      }
      if (superseded() || record.invalidatedByReset) return scoped()
      const validate = options.validate
      // Reset can clear the field messages while a form-level check still owes its caller a verdict.
      const ruleIssues = validate ? targets.flatMap(([target, field]) =>
        store.get(field.path) === field ? field.errors.map((message) => ({ path: target, message })) : [],
      ) : []
      if (isStandardSchema(validate)) {
        const issues = await collectSchemaIssues(validate, values, (error, issuePath) =>
          this.message('fallback', { path: issuePath, value: getAt(values, issuePath), error }),
        )
        collected.push(...issues)
      } else if (typeof validate === 'function') {
        const extra = await validate(process.env.NODE_ENV !== 'production' ? readonlyValue(values, '') : values)
        collected.push(...recordToIssues(extra))
      }
      if (superseded()) return scoped()
      const preserve = new Set<string>()
      const fieldIssues: SchemaIssue[] = []
      for (const [target, field] of targets) {
        const result = checked.get(field)
        if (!record.invalidatedByReset) {
          if (store.get(field.path) !== field) continue
          if (!result?.current()) {
            preserve.add(field.path)
            continue
          }
        }
        // Relative issues can refer to nested rows that moved independently of this field.
        if (result) fieldIssues.push(...fieldSchemaIssues(target, result.issues))
      }
      const activeIssues = rows.issues([...fieldIssues, ...collected.filter((issue) => inScope(issue.path))])
        .filter((issue) => issue.message && store.acceptsValidation(issue.path))
      if (record.invalidatedByReset) {
        const errors = groupSchemaIssues([...rows.issues(ruleIssues), ...activeIssues])
        return scoped([...errors].map(([path, messages]) => ({ path, messages })))
      }
      this.applySchemaMap(mergeSchemaScope(this.schemaByPath, groupSchemaIssues(activeIssues), live.filter(), preserve))
      // Not `waitAsync`: that would cancel the debounce an edit during this pass just scheduled (#122).
      await this.waitInflight()
      return scoped()
    } finally {
      if (this.snapshotRows === rows) this.snapshotRows = undefined
      if (gen === this.validateGen && !record.invalidatedByReset) {
        store.validating = false
        scheduler.bumpMeta()
        notifier.emit()
      }
    }
  }

  /** Wait for in-flight rules, then deliver the verdict in the same turn as the final snapshot check. */
  async submitVerdict<R>(signal: AbortSignal, finish: (errors: FieldError[] | null) => R): Promise<R> {
    if (!signal.aborted) await this.waitAsync(signal)
    for (let pass = 0; pass < SETTLE_PASSES && !signal.aborted; pass++) {
      let result = await valueUnlessAborted(this.run(undefined, signal), signal)
      while (result && !result.current && this.latestFull?.promise && this.latestFull.gen > result.gen) {
        result = await valueUnlessAborted(this.latestFull.promise, signal)
      }
      if (!result || signal.aborted) break
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

  private async validateOne(path: string, field: FieldModel, values: unknown, submitSignal?: AbortSignal, warnings?: Promise<void>[]): Promise<FieldCheck | undefined> {
    const { store, notifier, scheduler, options } = this.deps
    const live = () => store.get(field.path) === field
    if (!live()) return
    if (!store.acceptsValidation(field.path)) {
      field.abort?.abort()
      this.setErrors(field.path, [])
      if (!live()) return
      this.setWarnings(field.path, [])
      if (!live()) return
      field.schemaErrors = []
      this.schemaByPath.delete(field.path)
      if (field.externalErrors.length) field.externalErrors = []
      if (field.validating) {
        field.validating = false
        scheduler.bumpMeta()
      }
      return { current: live, issues: [] }
    }
    field.abort?.abort()
    field.warningValidating = false
    const ac = new AbortController()
    field.abort = ac
    const seq = ++field.asyncSeq
    const current = () => live() && field.asyncSeq === seq && !ac.signal.aborted
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
    const fallback = (issuePath: string) =>
      this.message('fallback', { path: issuePath ? `${path}.${issuePath}` : path, value: issuePath ? getAt(value, issuePath) : value, error: undefined })
    let checked, warned
    try {
      checked = runRules(value, plain, ctx, field.required, options.messages)
      warned = runWarningRules(value, warnRules, ctx, options.messages, (err) => this.errorMessage(err, path, value), fallback)
    } catch (err) {
      this.attempts.release(field, ac)
      throw err
    }
    const { messages, pending } = checked
    const issues: SchemaIssue[] = []
    const schemaPending: Promise<SchemaIssue[]>[] = []
    for (const rule of rules) {
      if (!rule.schema) continue
      let result: ReturnType<StandardSchemaV1['~standard']['validate']>
      try {
        result = rule.schema['~standard'].validate(value)
      } catch (err) {
        issues.push({ path: '', message: this.errorMessage(err, path, value) })
        continue
      }
      if (isPromise(result)) {
        schemaPending.push(Promise.resolve(result).then((resolved) => schemaIssues(resolved, fallback)))
      } else issues.push(...schemaIssues(result, fallback))
    }
    const warning = publishWarnings(field, ac, warned, (messages) => {
      if (current() && store.acceptsValidation(field.path)) this.setWarnings(field.path, messages)
    })
    if (warning) warnings?.push(warning)
    const stale = () => {
      this.attempts.release(field, ac)
      return undefined
    }
    const apply = (extra: string[]): FieldCheck | undefined => {
      if (!current()) return stale()
      if (field.validating) {
        field.validating = false
        scheduler.bumpMeta()
        notifier.bumpPath(field.path)
      }
      this.setErrors(field.path, store.acceptsValidation(field.path) ? [...messages, ...extra] : [])
      return { current, issues }
    }
    if (!pending.length && !schemaPending.length) return apply([])
    if (current()) {
      field.validating = true
      notifier.bumpPath(field.path)
      scheduler.bumpMeta()
    }
    const task = (async () => {
      // A validator we stop awaiting (abort mid-list) must not reject unhandled.
      for (const item of schemaPending) ignoreRejection(item)
      const extra: string[] = []
      for (const item of pending) {
        const outcome = await settleUnlessAborted(item, ac.signal)
        if (outcome.status === 'aborted' || !current()) return stale()
        if (outcome.status === 'rejected') {
          if (outcome.reason instanceof InvalidValidatorResult) {
            this.attempts.release(field, ac)
            throw outcome.reason
          }
          extra.push(this.errorMessage(outcome.reason, path, value))
        } else extra.push(...outcome.value)
      }
      for (const item of schemaPending) {
        const outcome = await settleUnlessAborted(item, ac.signal)
        if (outcome.status === 'aborted' || !current()) return stale()
        if (outcome.status === 'rejected') issues.push({ path: '', message: this.errorMessage(outcome.reason, path, value) })
        else issues.push(...outcome.value)
      }
      return apply(extra)
    })()
    this.trackInflight(task, ac, submitSignal)
    return task
  }

  /**
   * `waitAsync` waits on this set. Abort drops the attempt before its promise settles, so a validator
   * that never resolves after `signal` aborts cannot pin `submit`.
   */
  private trackInflight(task: Promise<unknown>, ac: AbortController, submitSignal?: AbortSignal): void {
    const { signal } = ac
    if (submitSignal?.aborted) ac.abort()
    if (signal.aborted) return
    const cancel = () => ac.abort()
    submitSignal?.addEventListener('abort', cancel, { once: true })
    this.inflight.add(task)
    const drop = () => {
      this.inflight.delete(task)
    }
    signal.addEventListener('abort', drop, { once: true })
    const cleanup = () => {
      submitSignal?.removeEventListener('abort', cancel)
      signal.removeEventListener('abort', drop)
      this.inflight.delete(task)
    }
    void task.then(cleanup, cleanup)
  }

  /**
   * The array value changed (`push` / `remove` / `move` / …). Re-run this path's own rules when it already
   * shows errors, or when its trigger list includes `onChange` — the same rule as editing a field.
   * Descendants are not validated, so a new row does not grow
   * `required` errors before the next submit.
   */
  private recheckOwn(path: string): void {
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
    const field = this.store.get(path)
    if (!field) return
    const result = await this.validateOne(path, field, this.store.values)
    if (!result?.current() || !this.store.acceptsValidation(field.path)) return
    if (!field.rules.some((rule) => rule.schema)) return
    if (result.issues.some((issue) => issue.path)) return
    path = field.path
    const next = new Map(this.schemaByPath)
    const messages = result.issues.flatMap((issue) => (issue.message ? [issue.message] : []))
    if (messages.length) next.set(path, messages)
    else next.delete(path)
    this.applySchemaMap(next)
  }

  queueEdit(field: FieldModel, kind?: 'own'): void { this.attempts.queueEdit(field, kind ? (path) => this.recheckOwn(path) : undefined) }

  noteReplacement(path: string, before: unknown): void {
    const after = this.store.values
    if (this.snapshotRows || this.requestedRows.size) this.trackRows(rowPathAfterReplacement(path, before, after),
      () => rowPathAfterReplacement(path, after, before))
    this.attempts.noteReplacement(path, before)
  }
  recheckReplacedFields(): void { this.attempts.recheckReplacedFields() }

  /** Debounce async rules. Sync-only fields validate on the next turn of `validate`. */
  scheduleValidate(path: string): void { this.attempts.schedule(path) }

  /** Report usage errors or exceptions from a pass that has no caller awaiting it. */
  validateDetached(path: string): void {
    this.run(path).catch((err: unknown) => {
      console.error('[shikiform] validation pass failed', err)
    })
  }

  /** Wait until no field validator is in flight. Does not cancel a debounce a newer edit just scheduled. */
  private async waitInflight(signal?: AbortSignal): Promise<void> {
    while (this.inflight.size && !signal?.aborted) {
      const pending = Promise.allSettled([...this.inflight])
      if (signal) await settleUnlessAborted(pending, signal)
      else await pending
    }
  }

  /**
   * Cancel debounce timers and wait until no field validator is in flight. Aborted attempts are already gone.
   * `submit` uses this so it validates the current value now. A validation pass must not: clearing the timer
   * would drop the check that replaced it (#122).
   */
  async waitAsync(signal?: AbortSignal): Promise<void> {
    this.attempts.clearUnder()
    await this.waitInflight(signal)
  }

  /** Ignore an in-flight field validator. A late `apply` sees the bumped sequence and does not write. */
  discardInflight(field: FieldModel): void {
    this.attempts.discard(field)
    field.abort?.abort()
    field.abort = undefined
    field.warningValidating = false
    field.asyncSeq += 1
    if (field.validating) {
      field.validating = false
      this.deps.scheduler.bumpMeta()
    }
  }

  reindexSchema(oldIds: ReadonlyMap<string, string>, newIds: ReadonlyMap<string, string>): void {
    if (!this.snapshotRows && !this.requestedRows.size && !this.schemaByPath.size) return
    const project = rowPathAfter(oldIds, newIds)
    this.trackRows(project, () => rowPathAfter(newIds, oldIds))
    if (this.schemaByPath.size) this.applySchemaMap(reindexSchemaPaths(this.schemaByPath, project), true)
  }

  private trackRows(forward: RowPathMap, reverse: () => RowPathMap): void {
    this.snapshotRows?.add(forward, reverse)
    for (const rows of this.requestedRows) if (rows !== this.snapshotRows) rows.add(forward, reverse)
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
    this.schemaByPath.delete(path)
    this.store.setEnumOptions(field, undefined)
    this.store.fields.delete(path)
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.bumpMeta()
  }

  /** Reset invalidates an in-progress submit verdict even when resetting to the same values. */
  reset(path?: string): void {
    this.resetVersion += 1
    if (this.latest && resetOverlaps(this.latest.live?.paths(), path)) {
      this.latest.invalidatedByReset = true
      this.store.validating = false
    }
    this.attempts.clearUnder(path)
    if (!path) this.schemaByPath = new Map()
    else {
      for (const key of [...this.schemaByPath.keys()]) {
        if (key === path || key.startsWith(path + '.')) this.schemaByPath.delete(key)
      }
    }
  }

  private applySchemaMap(next: Map<string, string[]>, reindex = false): void {
    const previous = this.schemaByPath
    this.schemaByPath = next
    syncSchemaMessages(this.deps, previous, next, (path) => this.markChain(path, 'errors'), reindex)
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
    const { scheduler } = this.deps
    if (scheduler.writes.stageAction(() => this.setExternalMany(entries))) return
    for (const [input, messages] of entries) {
      const path = normalizePath(input)
      const field = this.store.ensure(path)
      if (deepEqual(field.externalErrors, messages)) continue
      field.externalErrors = messages.slice()
      this.afterErrorChange(path, false)
    }
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
    this.clearExternalWhere(scopeTest(path))
  }

  private clearExternalWhere(inScope: (path: string) => boolean): void {
    for (const [fieldPath, field] of this.store.fields) {
      if (!field.externalErrors.length) continue
      if (!inScope(fieldPath)) continue
      field.externalErrors = []
      this.afterErrorChange(fieldPath, false)
    }
  }

  /** `clearErrors(path?)`: rule, schema and external messages on `path` and descendants. */
  clearAll(path?: string): void {
    const { scheduler } = this.deps
    if (scheduler.writes.stageAction(() => this.clearAll(path))) return
    if (path) path = normalizePath(path)
    this.clearExternalUnder(path)
    this.clearSchemaMessages(path)
    for (const [fieldPath] of this.store.fields) {
      if (path && fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      this.setWarnings(fieldPath, [])
      this.setErrors(fieldPath, [])
    }
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

  /** Mark `<path>:<kind>` on the path, its ancestors and the root (`$errors` / `$warnings` aggregate descendants). */
  private markChain(path: string, kind: 'errors' | 'warnings'): void {
    const scheduler = this.deps.scheduler
    for (let cursor: string | null = path; cursor; cursor = parentPath(cursor)) scheduler.markDirty(`${cursor}:${kind}`)
    scheduler.markDirty(`:${kind}`)
  }
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

