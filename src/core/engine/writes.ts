import type { Declarations } from '../declarations/declarations'
import { isReactionId, type Scheduler } from '../effects/scheduler'
import { asOptions, isEnumBinding, type EnumOption } from '../enum/enum-source'
import { deepEqual } from '../shared/equal'
import { getAt, parentPath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { Display, FormOptions, Pattern, WriteOp } from '../types'
import { isEmpty, optionIncludes, type Rule } from '../validation/rules'
import type { Validator } from '../validation/validator'
import { uiKeyOf, type FieldUi } from './field-ui'

interface EnumLoadBinding {
  source: { debounce: number; cached: (p: any) => EnumOption[] | undefined; load: (p: any, s: AbortSignal) => Promise<EnumOption[]> }
  params: unknown
}

export interface WriterDeps {
  store: FieldStore<any>
  notifier: Notifier
  scheduler: Scheduler
  validator: Validator
  declarations: Declarations
  options: FormOptions<any>
  /** Injected by the engine (structure layer): keep id-less array rows' identity across a cell edit. */
  carryRowIdentity?: (path: string, before: unknown, after: unknown) => void
  /** UI state (`$title`, `$componentProps`, …). Set by the engine after construction. */
  ui?: FieldUi
}

/**
 * Every write to values and `$` state goes through here.
 *
 * - User edits (`setValue`, `binding().onChange`) → {@link StateWriter.commitExternal}: dirty flags + `onChange` trigger.
 * - Draft writes (`d.x.$value = …`, `$display`, `$rules`, …) → {@link StateWriter.writeState}: buffered inside a
 *   reaction / watch / batch, applied immediately otherwise.
 * - `$enum` with an `EnumSource` binding loads asynchronously (debounced, aborted, sequence-stamped).
 */
export class StateWriter {
  private enumTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private enumAbort = new Map<string, AbortController>()

  constructor(private readonly deps: WriterDeps) {}

  attachUi(ui: FieldUi): FieldUi {
    this.deps.ui = ui
    return ui
  }

  /** Draft write entry point (`DraftHost.writeState`). */
  writeState(path: string, key: string, value: unknown): void {
    const scheduler = this.deps.scheduler
    const op = this.makeOp(path, key, value)
    const tracker = scheduler.current()
    if (tracker) {
      if (!tracker.recordWrites) return
      const index = tracker.writes.findIndex((item) => item.key === op.key)
      // UI patches apply on top of each other: keep them in write order.
      if (index >= 0 && this.deps.ui?.isUiOp(op)) tracker.writes.splice(index, 1)
      else if (index >= 0) {
        tracker.writes[index] = op
        return
      }
      tracker.writes.push(op)
      return
    }
    if (scheduler.batchDepth > 0) {
      scheduler.batchOps.push(op)
      return
    }
    if (op.apply()) scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  // Open issue P3-3 (`commit: 'blur'`) lives here: user edits always commit on change.
  commitExternal(path: string, value: unknown): void {
    const { store, notifier, scheduler, validator } = this.deps
    if (!this.commitValue(path, value, false)) return
    const field = store.ensure(path)
    if (!field.dirty) {
      field.dirty = true
      scheduler.markDirty(`${path}:dirty`)
      notifier.bumpPath(path)
    }
    if (!store.dirty) {
      store.dirty = true
      scheduler.bumpMeta()
    }
    scheduler.enqueueFromDirty()
    scheduler.flush()
    if (validator.triggersFor(path).includes('onChange')) validator.scheduleValidate(path)
  }

  /** Mark the field touched. Validates when the trigger list includes `onBlur`. */
  blur(path: string): void {
    const { store, notifier, scheduler, validator } = this.deps
    const field = store.ensure(path)
    field.touched = true
    notifier.bumpPath(path)
    scheduler.markDirty(`${path}:touched`)
    if (validator.triggersFor(path).includes('onBlur')) validator.scheduleValidate(path)
    else notifier.emit()
  }

  commitValue(path: string, value: unknown, fromReaction: boolean): boolean {
    const { store, notifier, scheduler, declarations } = this.deps
    const old = getAt(store.values, path)
    if (deepEqual(old, value)) return false
    const before = store.values
    store.values = setAt(store.values, path, value)
    this.deps.carryRowIdentity?.(path, before, store.values)
    if (fromReaction) {
      const field = store.ensure(path)
      field.computed = true
      if (!field.virtualExplicit) field.virtual = true
    }
    notifier.bumpPath(path)
    let cursor: string | null = path
    while (cursor) {
      scheduler.markDirty(`${cursor}:value`)
      cursor = parentPath(cursor)
    }
    if (Array.isArray(old) || Array.isArray(value)) {
      scheduler.dirtyRows.set(path, 'all')
      scheduler.markStructure(path)
      declarations.applyItemTemplates()
    }
    if (value != null && typeof value === 'object') this.dirtyUnder(path)
    return true
  }

  private dirtyUnder(path: string): void {
    const { store, notifier, scheduler } = this.deps
    const prefix = path + '.'
    for (const dep of scheduler.depKeys()) {
      const depPath = dep.slice(0, dep.lastIndexOf(':'))
      if (depPath === path || depPath.startsWith(prefix)) scheduler.markDirty(dep)
    }
    for (const fieldPath of store.fields.keys()) {
      if (fieldPath.startsWith(prefix)) notifier.bumpPath(fieldPath)
    }
  }

  private bumpDescendants(path: string): void {
    const prefix = path + '.'
    for (const fieldPath of this.deps.store.fields.keys()) {
      if (fieldPath.startsWith(prefix)) this.deps.notifier.bumpPath(fieldPath)
    }
  }

  private makeOp(path: string, key: string, value: unknown): WriteOp {
    const uiKey = uiKeyOf(key)
    if (uiKey && this.deps.ui) return this.deps.ui.makeOp(path, uiKey, value)
    if (key === '$value') {
      const fromReaction = isReactionId(this.deps.scheduler.current()?.id ?? '')
      return { key: `${path}:value`, apply: () => this.commitValue(path, value, fromReaction) }
    }
    if (key === '$visible') {
      return { key: `${path}:display`, apply: () => this.setDisplay(path, value ? 'visible' : 'hidden', true) }
    }
    if (key === '$display') {
      return { key: `${path}:display`, apply: () => this.setDisplay(path, value as Display, true) }
    }
    if (key === '$pattern') {
      return { key: `${path}:pattern`, apply: () => this.setPattern(path, value as Pattern | undefined, true) }
    }
    if (key === '$disabled') {
      return {
        key: `${path}:pattern`,
        apply: () => this.setPattern(path, value ? 'disabled' : 'editable', true),
      }
    }
    if (key === '$required') {
      return { key: `${path}:required`, apply: () => this.setRequired(path, !!value) }
    }
    if (key === '$enum') {
      return { key: `${path}:enum`, apply: () => this.setEnum(path, value) }
    }
    if (key === '$rules') {
      return { key: `${path}:rules`, apply: () => this.setRules(path, (value as Rule[]) ?? []) }
    }
    return { key: `${path}:${key}`, apply: () => false }
  }

  private setDisplay(path: string, display: Display, fromEffect: boolean): boolean {
    const { store, notifier, scheduler, validator } = this.deps
    const field = store.ensure(path)
    if (field.hasDisplay && field.display === display) return false
    field.hasDisplay = true
    field.display = display
    if (fromEffect) field.displayFromEffect = true
    notifier.bumpPath(path)
    this.bumpDescendants(path)
    scheduler.markDirty(`${path}:display`)
    if (display === 'none' || store.effectiveDisplay(path) === 'none') validator.clearHiddenErrors(path)
    return true
  }

  private setPattern(path: string, pattern: Pattern | undefined, fromEffect: boolean): boolean {
    const { store, notifier, scheduler } = this.deps
    const field = store.ensure(path)
    const has = pattern !== undefined
    if (field.hasPattern === has && field.pattern === pattern) return false
    field.hasPattern = has
    field.pattern = pattern
    if (fromEffect) field.patternFromEffect = true
    notifier.bumpPath(path)
    this.bumpDescendants(path)
    scheduler.markDirty(`${path}:pattern`)
    return true
  }

  private setRequired(path: string, required: boolean): boolean {
    const field = this.deps.store.ensure(path)
    field.requiredFromEffect = true
    if (field.required === required) return false
    field.required = required
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.markDirty(`${path}:required`)
    return true
  }

  private setRules(path: string, rules: Rule[]): boolean {
    const field = this.deps.store.ensure(path)
    field.rulesFromEffect = true
    if (deepEqual(field.rules, rules)) return false
    field.rules = rules.slice()
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.markDirty(`${path}:rules`)
    return true
  }

  private setEnum(path: string, value: unknown): boolean {
    const field = this.deps.store.ensure(path)
    field.enumFromEffect = true
    if (isEnumBinding(value)) {
      const cached = value.source.cached(value.params)
      if (cached && deepEqual(field.enumOptions, cached)) return false
      this.loadEnum(path, value)
      return true
    }
    const options = asOptions(value) ?? []
    if (deepEqual(field.enumOptions, options)) return false
    field.enumOptions = options
    field.enumLoading = false
    this.afterEnum(path)
    return true
  }

  private loadEnum(path: string, binding: EnumLoadBinding): void {
    const { store, notifier, scheduler } = this.deps
    const field = store.ensure(path)
    const seq = ++field.enumSeq
    const start = () => {
      this.enumAbort.get(path)?.abort()
      const ac = new AbortController()
      this.enumAbort.set(path, ac)
      field.enumLoading = true
      notifier.bumpPath(path)
      void binding.source.load(binding.params, ac.signal).then(
        (options) => {
          if (field.enumSeq !== seq) return
          field.enumOptions = options
          field.enumLoading = false
          this.afterEnum(path)
          scheduler.enqueueFromDirty()
          scheduler.flush()
        },
        () => {
          if (field.enumSeq !== seq) return
          field.enumLoading = false
          notifier.bumpPath(path)
          notifier.emit()
        },
      )
    }
    const prev = this.enumTimers.get(path)
    if (prev) clearTimeout(prev)
    const wait = binding.source.debounce
    if (wait > 0) this.enumTimers.set(path, setTimeout(start, wait))
    else start()
  }

  /** `enumPolicy: 'clear'` drops a value the new options no longer include. */
  private afterEnum(path: string): void {
    const { store, notifier, scheduler, options } = this.deps
    notifier.bumpPath(path)
    scheduler.markDirty(`${path}:enum`)
    const policy = options.enumPolicy ?? 'none'
    if (policy === 'clear') {
      const field = store.get(path)
      const current = getAt(store.values, path)
      if (!isEmpty(current) && field?.enumOptions && !optionIncludes(field.enumOptions, current)) {
        this.commitValue(path, undefined, false)
      }
    }
  }
}
