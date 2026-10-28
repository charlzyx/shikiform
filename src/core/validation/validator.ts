import type { Scheduler } from '../effects/scheduler'
import { deepEqual } from '../shared/equal'
import { getAt, parentPath } from '../shared/path'
import { shownErrors, type FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import { scopeOf, type Pos } from '../shared/tree-ops'
import type { FieldError, FormOptions, ValidateTrigger } from '../types'
import { fieldSchemaIssues, optionIncludes, runRules, type ValidateCtx } from './rules'
import { collectSchemaIssues, groupSchemaIssues, isStandardSchema, schemaIssuePath, type SchemaIssue } from './schema'

export interface ValidatorDeps {
  store: FieldStore<any>
  notifier: Notifier
  scheduler: Scheduler
  options: FormOptions<any>
  /** Tree position of `path` (the running `walk` instance first, then the registered tree). */
  readPos: (path: string) => Pos | undefined
}

/**
 * The validation pipeline: per-field rules (sync, async, Standard Schema), form-level schema / resolver,
 * debounce, stale-result dropping, and where messages land (`errors` vs `schemaErrors`).
 *
 * Per field: `rules` + `required` → `runRules` (sync messages + pending promises) and field schemas.
 * A pass is generation-stamped (`validateGen`); only the newest pass commits form-level issues.
 * A field's async result is stamped with `asyncSeq` and its `AbortController`; a newer edit drops it.
 */
export class Validator {
  /** Form-level schema / resolver / field-schema messages by path. */
  schemaByPath = new Map<string, string[]>()
  /** Bumped at the start of each {@link Validator.validate}. Only the latest pass may commit. */
  validateGen = 0
  private inflight = new Set<Promise<unknown>>()
  private validateTimers = new Map<string, ReturnType<typeof setTimeout>>()
  /** Runs before every pass. The engine expands item templates here. */
  prepare: () => void = () => {}

  constructor(private readonly deps: ValidatorDeps) {}

  private get store() {
    return this.deps.store
  }

  /** Messages for every field whose effective display is not `none`. */
  errors(): FieldError[] {
    const out: FieldError[] = []
    for (const [path, field] of this.store.fields) {
      if (this.store.effectiveDisplay(path) === 'none') continue
      const messages = shownErrors(field)
      if (messages.length) out.push({ path, messages })
    }
    return out
  }

  triggersFor(path: string): ValidateTrigger[] {
    return this.store.get(path)?.triggers ?? this.deps.options.validateTrigger ?? ['onBlur', 'onSubmit']
  }

  async validate(path?: string): Promise<FieldError[]> {
    const { store, scheduler, notifier, options } = this.deps
    this.prepare()
    const gen = ++this.validateGen
    store.validating = true
    scheduler.bumpMeta()
    notifier.emit()
    const scoped = () => this.errors().filter((e) => !path || e.path === path || e.path.startsWith(path + '.'))
    try {
      const targets = [...store.fields.keys()].filter((p) => !path || p === path || p.startsWith(path + '.'))
      const collected: SchemaIssue[] = []
      const preserve = new Set<string>()
      for (const target of targets) {
        if (gen !== this.validateGen) return scoped()
        const result = await this.validateOne(target)
        if (gen !== this.validateGen) return scoped()
        if (result.stale) preserve.add(target)
        else collected.push(...result.issues)
      }
      const validate = options.validate
      const values = store.values
      if (isStandardSchema(validate)) {
        const issues = await collectSchemaIssues(validate, values)
        if (gen !== this.validateGen) return scoped()
        collected.push(...issues)
      } else if (typeof validate === 'function') {
        const extra = await validate(values)
        if (gen !== this.validateGen) return scoped()
        collected.push(...recordToIssues(extra))
      }
      if (options.resolver) {
        const extra = await options.resolver(values)
        if (gen !== this.validateGen) return scoped()
        collected.push(...recordToIssues(extra))
      }
      if (gen !== this.validateGen) return scoped()
      this.commitSchemaIssues(path, collected, preserve)
      await this.waitAsync()
      if (gen !== this.validateGen) return scoped()
      return scoped()
    } finally {
      if (gen === this.validateGen) {
        store.validating = false
        scheduler.bumpMeta()
        notifier.emit()
      }
    }
  }

  // Open issue #1 (row-draft cross-field validation reads the committed row) maps here: ctx is built from store.values.
  private buildCtx(path: string, value: unknown, pos: Pos | undefined, signal?: AbortSignal): ValidateCtx {
    const values = this.store.values
    const scope = scopeOf(path)
    const ctx: ValidateCtx = {
      path,
      value,
      record: scope.recordPath ? getAt(values, scope.recordPath) : values,
      root: values,
      parent: scope.parentPath ? getAt(values, scope.parentPath) : values,
      array: scope.arrayPath ? (getAt(values, scope.arrayPath) as any[]) : undefined,
      index: scope.index,
      // Live read (not the snapshot above): unchanged from the pre-split engine.
      get: (p) => getAt(this.store.values, p),
      pos,
      depth: pos?.length,
    }
    if (signal) ctx.signal = signal
    return ctx
  }

  private async validateOne(path: string): Promise<{ stale: boolean; issues: SchemaIssue[] }> {
    const { store, notifier, scheduler, options } = this.deps
    const field = store.get(path)
    if (!field) return { stale: false, issues: [] }
    if (store.effectiveDisplay(path) === 'none' || field.computed) {
      this.setErrors(path, [])
      return { stale: false, issues: [] }
    }
    field.abort?.abort()
    const ac = new AbortController()
    field.abort = ac
    const seq = ++field.asyncSeq
    const value = getAt(store.values, path)
    const ctx = this.buildCtx(path, value, this.deps.readPos(path) ?? undefined, ac.signal)
    const rules = field.rules.slice()
    if (options.enumPolicy === 'error' && field.enumOptions && !optionIncludes(field.enumOptions, value)) {
      rules.push({ validator: () => '不在可选范围内' })
    }
    const plain = rules.filter((rule) => !rule.schema)
    const { messages, pending } = runRules(value, plain, ctx, field.required)
    const issues: SchemaIssue[] = []
    const schemaPending: Promise<SchemaIssue[]>[] = []
    for (const rule of rules) {
      if (!rule.schema) continue
      const result = rule.schema['~standard'].validate(value)
      if (isPromise(result)) {
        schemaPending.push(
          Promise.resolve(result).then((resolved) => {
            if (!resolved.issues?.length) return []
            return fieldSchemaIssues(
              path,
              resolved.issues.map((issue) => ({ path: schemaIssuePath(issue.path), message: issue.message || '校验失败' })),
            )
          }),
        )
      } else if (result.issues?.length) {
        issues.push(
          ...fieldSchemaIssues(
            path,
            result.issues.map((issue) => ({ path: schemaIssuePath(issue.path), message: issue.message || '校验失败' })),
          ),
        )
      }
    }
    const apply = (extra: string[]) => {
      if (field.asyncSeq !== seq || ac.signal.aborted) return { stale: true as const, issues: [] as SchemaIssue[] }
      const was = field.validating
      field.validating = false
      this.setErrors(path, [...messages, ...extra])
      if (was) scheduler.bumpMeta()
      return { stale: false as const, issues }
    }
    if (!pending.length && !schemaPending.length) return apply([])
    field.validating = true
    notifier.bumpPath(path)
    scheduler.bumpMeta()
    const task = (async () => {
      const extra: string[] = []
      for (const item of pending) {
        try {
          const message = await item
          if (field.asyncSeq !== seq || ac.signal.aborted) return { stale: true as const, issues: [] as SchemaIssue[] }
          if (message) extra.push(message)
        } catch (err) {
          if (field.asyncSeq !== seq || ac.signal.aborted) return { stale: true as const, issues: [] as SchemaIssue[] }
          extra.push(err instanceof Error ? err.message : '校验失败')
        }
      }
      for (const item of schemaPending) {
        try {
          const schemaIssues = await item
          if (field.asyncSeq !== seq || ac.signal.aborted) return { stale: true as const, issues: [] as SchemaIssue[] }
          issues.push(...schemaIssues)
        } catch (err) {
          if (field.asyncSeq !== seq || ac.signal.aborted) return { stale: true as const, issues: [] as SchemaIssue[] }
          issues.push({ path, message: err instanceof Error ? err.message : '校验失败' })
        }
      }
      return apply(extra)
    })()
    this.inflight.add(task)
    void task.finally(() => this.inflight.delete(task))
    return task
  }

  /**
   * Debounce async rules. Sync-only fields validate on the next turn of `validate`.
   * Open issue #2 (debounced async reject leaves callers pending) maps here + validateOne's try/catch.
   */
  scheduleValidate(path: string): void {
    const field = this.store.ensure(path)
    const ms = field.asyncDebounceMs ?? this.deps.options.asyncDebounceMs ?? 0
    const asyncish = field.rules.some((rule) => rule.validator || rule.schema)
    if (ms > 0 && asyncish) {
      const prev = this.validateTimers.get(path)
      if (prev) clearTimeout(prev)
      field.abort?.abort()
      field.asyncSeq += 1
      const timer = setTimeout(() => {
        this.validateTimers.delete(path)
        void this.validate(path)
      }, ms)
      this.validateTimers.set(path, timer)
      return
    }
    void this.validate(path)
  }

  /** Cancel debounce timers and wait until no field validator is in flight. */
  async waitAsync(): Promise<void> {
    for (const timer of this.validateTimers.values()) clearTimeout(timer)
    this.validateTimers.clear()
    while (this.inflight.size) await Promise.allSettled([...this.inflight])
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
    if (this.store.effectiveDisplay(path) === 'none' || field.computed) {
      this.setErrors(path, [])
      return
    }
    const value = getAt(this.store.values, path)
    const ctx = this.buildCtx(path, value, this.deps.readPos(path))
    const { messages } = runRules(
      value,
      field.rules.filter((rule) => !rule.schema).map((rule) => ({ ...rule, validator: undefined })),
      ctx,
      field.required,
    )
    this.setErrors(path, messages)
  }

  /** Remove a template instance, including a validator that has not resolved yet. */
  dropField(path: string): void {
    const field = this.store.get(path)
    if (!field) return
    this.discardInflight(field)
    const timer = this.validateTimers.get(path)
    if (timer) {
      clearTimeout(timer)
      this.validateTimers.delete(path)
    }
    this.schemaByPath.delete(path)
    this.store.fields.delete(path)
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.bumpMeta()
  }

  /** Forget schema messages, for `reset(path?)`. */
  clearSchema(path?: string): void {
    if (!path) this.schemaByPath = new Map()
    else {
      for (const key of [...this.schemaByPath.keys()]) {
        if (key === path || key.startsWith(path + '.')) this.schemaByPath.delete(key)
      }
    }
  }

  private commitSchemaIssues(scope: string | undefined, issues: SchemaIssue[], preserve: Set<string>): void {
    const store = this.store
    const filtered = issues.filter((issue) => {
      if (!issue.message) return false
      if (!issue.path) return store.effectiveDisplay('') !== 'none'
      return store.effectiveDisplay(issue.path) !== 'none'
    })
    const grouped = groupSchemaIssues(filtered)
    const replaceAll = !scope && preserve.size === 0
    const next = replaceAll ? new Map<string, string[]>() : new Map(this.schemaByPath)
    const replaceable = (key: string) => {
      if (preserve.has(key)) return false
      for (const kept of preserve) {
        if (key.startsWith(kept + '.') || kept.startsWith(key + '.')) return false
      }
      if (!scope) return true
      return key === scope || key.startsWith(scope + '.')
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
      this.markErrorDeps(path)
      changed = true
    }
    if (!changed) return
    scheduler.bumpMeta()
    if (!scheduler.flushing) {
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
  }

  /** Clear messages on `path` and descendants whose effective display became `none`. */
  clearHiddenErrors(path: string): void {
    for (const [fieldPath, field] of this.store.fields) {
      if (fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      if (this.store.effectiveDisplay(fieldPath) !== 'none') continue
      this.setErrors(fieldPath, [])
      field.schemaErrors = []
      this.schemaByPath.delete(fieldPath)
      this.deps.notifier.bumpPath(fieldPath)
    }
    this.deps.scheduler.bumpMeta()
  }

  setErrors(path: string, messages: string[]): void {
    const { notifier, scheduler } = this.deps
    const field = this.store.ensure(path)
    if (deepEqual(field.errors, messages)) return
    field.errors = messages
    notifier.bumpPath(path)
    this.markErrorDeps(path)
    scheduler.bumpMeta()
    if (!scheduler.flushing) {
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
      if (this.store.effectiveDisplay(fieldPath) === 'none') continue
      if (kind === 'errors') out.push(...shownErrors(field))
      else out.push(...field.warnings)
    }
    return out
  }

  /** Field errors plus the root `:errors` dep, so `d.$errors` updates for a top-level field too. */
  private markErrorDeps(path: string): void {
    const scheduler = this.deps.scheduler
    let cursor: string | null = path
    while (cursor) {
      scheduler.markDirty(`${cursor}:errors`)
      cursor = parentPath(cursor)
    }
    scheduler.markDirty(':errors')
  }
}

function recordToIssues(extra: Partial<Record<string, string>> | void): SchemaIssue[] {
  if (!extra) return []
  return Object.entries(extra)
    .filter((entry): entry is [string, string] => !!entry[1])
    .map(([path, message]) => ({ path, message }))
}

function isPromise(value: unknown): value is Promise<unknown> {
  return !!value && typeof (value as Promise<unknown>).then === 'function'
}
