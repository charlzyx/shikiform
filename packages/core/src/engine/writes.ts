import type { Declarations } from '../declarations/declarations'
import { isReactionId, type Scheduler } from '../effects/scheduler'
import { asOptions, isEnumBinding, toEnumBinding, type EnumBinding, type EnumOption } from '../enum/enum-source'
import { cloneExternal } from '../draft/plain-clone'
import { unwrapReadonly } from '../draft/readonly'
import { showDraftPath } from '../errors'
import { deepEqual } from '../shared/equal'
import { getAt, normalizePath, parentPath, setAt } from '../shared/path'
import type { FlagName } from '../state/flags'
import type { FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { WriteOp } from '../types'
import type { FormOptions } from '../types-effects'
import { assertRuleKeys, isEmpty, optionIncludes, type Rule } from '../validation/rules'
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
 * - User edits (`setValue`, `binding().onChange`) → {@link StateWriter.commitExternal}: sticky `edited` flags + `onChange` trigger.
 *   `dirty` is not written here: the engine derives it from values vs `initial`.
 * - Draft writes (`d.x.$value = …`, `$visible`, `$rules`, …) → {@link StateWriter.writeState}: buffered inside a
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
    // Development: `$value` reads in a reaction are read-only views; store plain data.
    if (process.env.NODE_ENV !== 'production') value = unwrapReadonly(value)
    const op = this.makeOp(path, key, value)
    this.enqueue(op, !!this.deps.ui?.isUiOp(op))
  }

  /**
   * Buffer `op` inside a reaction / watch / batch, or apply and flush it now. `patch`: UI patches apply on top of
   * each other, so a second op with the same key moves to the end instead of replacing the first.
   */
  enqueue(op: WriteOp, patch: boolean): void {
    const scheduler = this.deps.scheduler
    const tracker = scheduler.current()
    if (tracker) {
      if (!tracker.recordWrites) return
      const index = tracker.writes.findIndex((item) => item.key === op.key)
      if (index >= 0 && patch) tracker.writes.splice(index, 1)
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

  commitExternal(path: string, value: unknown): void {
    path = normalizePath(path)
    const { store, notifier, scheduler, validator } = this.deps
    // Clone caller data (`setValue`, `binding().onChange`). Objects already in the store keep their identity.
    value = cloneExternal(value, store.values)
    if (!this.commitValue(path, value, false)) return
    const field = store.ensure(path)
    if (!field.edited) {
      field.edited = true
      scheduler.markDirty(`${path}:edited`)
      notifier.bumpPath(path)
    }
    if (!store.edited) {
      store.edited = true
      scheduler.bumpMeta()
    }
    scheduler.enqueueFromDirty()
    scheduler.flush()
    // An error already on screen is re-checked on every edit, whatever the trigger. An async attempt still in
    // flight (or waiting out its debounce) is aborted too, so a late result cannot land on the new value (#122).
    // `$canSubmit` / the `Submit` button come back when that replacement check passes.
    validator.onEdit(path)
  }

  /** Apply a deep partial object update in a single reaction/watch flush (`form.patchValues`). */
  patchValues(partial: unknown): void {
    if (!partial || typeof partial !== 'object') return
    const source = cloneExternal(partial, this.deps.store.values) as Record<string, unknown>
    const entries: [string, unknown][] = []
    collectPatchEntries(source, this.deps.store.values, '', entries)
    this.commitPatch(entries)
  }

  /** Apply multiple external leaf updates in a single reaction/watch flush. */
  commitPatch(entries: readonly [string, unknown][]): void {
    if (!entries.length) return
    const { store, notifier, scheduler, validator } = this.deps
    const changed: string[] = []
    for (const [rawPath, rawValue] of entries) {
      const path = normalizePath(rawPath)
      const value = process.env.NODE_ENV !== 'production' ? unwrapReadonly(rawValue) : rawValue
      if (!this.commitValue(path, value, false)) continue
      changed.push(path)
      const field = store.ensure(path)
      if (!field.edited) {
        field.edited = true
        scheduler.markDirty(`${path}:edited`)
        notifier.bumpPath(path)
      }
    }
    if (!changed.length) return
    if (!store.edited) {
      store.edited = true
      scheduler.bumpMeta()
    }
    scheduler.enqueueFromDirty()
    scheduler.flush()
    for (const path of changed) validator.onEdit(path)
  }

  /** Start or hit cache for an `EnumSource` / `EnumBinding` declared via `fields` or an item template. */
  loadDeclaredEnum(path: string, binding: EnumBinding): void {
    const field = this.deps.store.ensure(path)
    if (field.enumFromEffect || field.jsxEnum !== undefined) return
    const cached = binding.source.cached(binding.params)
    if (cached && deepEqual(field.enumOptions, cached)) return
    // Re-applying the same declaration (registerField, a revived path) must not abort the request already in flight.
    if (field.enumLoading || this.enumTimers.has(path)) return
    this.loadEnum(path, binding)
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
    // A reaction write marks the field computed (excluded from `dirty`), also when the derived value already
    // equals the current one (an initial value that is already right). It stays in the submit payload unless
    // this field is omitted (its own `omit`, or an ancestor's).
    if (fromReaction) store.ensure(path).computed = true
    const old = getAt(store.values, path)
    if (deepEqual(old, value)) return false
    const before = store.values
    store.values = setAt(store.values, path, value)
    this.deps.carryRowIdentity?.(path, before, store.values)
    notifier.bumpPath(path)
    // A changed value invalidates external (`setErrors`) messages on this path, its ancestors and descendants.
    this.deps.validator.clearExternalAround(path)
    let cursor: string | null = path
    while (cursor) {
      scheduler.markDirty(`${cursor}:value`)
      cursor = parentPath(cursor)
    }
    scheduler.markDirty(':value') // the root: `d.$value` / `<Watch select={(d) => d.$value}>`
    if (Array.isArray(old) || Array.isArray(value)) {
      scheduler.dirtyRows.set(path, 'all')
      scheduler.markStructure(path)
      declarations.applyItemTemplates()
    }
    if ((value != null && typeof value === 'object') || (old != null && typeof old === 'object')) this.dirtyUnder(path)
    return true
  }

  private dirtyUnder(path: string): void {
    const { store, notifier, scheduler } = this.deps
    const prefix = path + '.'
    // Effects' recorded reads, and `useWatch` / `<Watch>` subscriptions: replacing `editor` changes `editor.open`.
    for (const keys of [scheduler.depKeys(), notifier.depListenerKeys()]) {
      for (const dep of keys) {
        const depPath = dep.slice(0, dep.lastIndexOf(':'))
        if (depPath === path || depPath.startsWith(prefix)) scheduler.markDirty(dep)
      }
    }
    for (const fieldPath of store.fields.keys()) {
      if (fieldPath.startsWith(prefix)) notifier.bumpPath(fieldPath)
    }
  }

  private makeOp(path: string, key: string, value: unknown): WriteOp {
    const uiKey = uiKeyOf(key)
    if (uiKey && this.deps.ui) return this.deps.ui.makeOp(path, uiKey, value)
    if (key === '$value') {
      const fromReaction = isReactionId(this.deps.scheduler.current()?.id ?? '')
      return { key: `${path}:value`, apply: () => this.commitValue(path, value, fromReaction) }
    }
    if (key === '$visible' || key === '$disabled' || key === '$readOnly' || key === '$omit') {
      const name = key.slice(1) as FlagName
      // `undefined` drops the reaction layer. `true` / `false` set this node's own flag
      // (`false` exits an inherited `true` for visible / disabled / readOnly; an ancestor `omit` still wins).
      return { key: `${path}:${name}`, apply: () => this.setFlag(path, name, value as boolean | undefined) }
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

  /**
   * Reaction / batch write of one flag.
   * `undefined` drops the reaction layer (JSX / `fields` / inheritance show through).
   * `true` and `false` are both explicit. For `visible` / `disabled` / `readOnly`, `false` exits an
   * inherited `true`. For `omit`, the stored `false` does not opt out of an ancestor `true`.
   */
  private setFlag(path: string, name: FlagName, value: boolean | undefined): boolean {
    const field = this.deps.store.ensure(path)
    const slot = field.flags[name]
    if (value === undefined) {
      if (!slot.fromEffect) return false
      slot.fromEffect = false
      slot.effect = undefined
    } else if (slot.fromEffect && slot.effect === value) {
      return false
    } else {
      slot.fromEffect = true
      slot.effect = value
    }
    this.deps.validator.noteFlags(path, [name])
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
    if (process.env.NODE_ENV !== 'production') assertRuleKeys(rules, `${showDraftPath(path)}.$rules`)
    const field = this.deps.store.ensure(path)
    field.rulesFromEffect = true
    if (deepEqual(field.rules, rules)) return false
    field.rules = rules.slice()
    this.deps.notifier.bumpPath(path)
    this.deps.scheduler.markDirty(`${path}:rules`)
    return true
  }

  /**
   * `$enum` from a reaction / batch. `undefined` drops the reaction layer like `$title` / `$visible = undefined`:
   * the field falls back to the mounted `<Field enum>`, else `fields.x.enum`, else the `rows.*.x` template
   * (no options at all when none exists). `[]` pins an empty list. Any reaction load in flight is cancelled.
   */
  private setEnum(path: string, value: unknown): boolean {
    const field = this.deps.store.ensure(path)
    if (value === undefined) {
      field.enumFromEffect = false
      this.cancelEnumLoad(path, field)
      if (isEnumBinding(field.jsxEnum)) {
        const cached = field.jsxEnum.source.cached(field.jsxEnum.params)
        if (cached && deepEqual(field.enumOptions, cached)) return false
        this.loadEnum(path, field.jsxEnum)
        return true
      }
      if (field.jsxEnum === undefined) {
        const declBinding = this.deps.declarations.declaredEnumBinding(path)
        if (declBinding) {
          const cached = declBinding.source.cached(declBinding.params)
          if (cached && deepEqual(field.enumOptions, cached)) return false
          this.loadEnum(path, declBinding)
          return true
        }
      }
      const next = field.jsxEnum ?? this.deps.declarations.declaredEnum(path)
      if (deepEqual(field.enumOptions, next)) return false
      field.enumOptions = next
      this.afterEnum(path)
      return true
    }
    field.enumFromEffect = true
    const effectBinding = toEnumBinding(value)
    if (effectBinding) {
      const cached = effectBinding.source.cached(effectBinding.params)
      if (cached && deepEqual(field.enumOptions, cached)) {
        this.cancelEnumLoad(path, field)
        return false
      }
      this.loadEnum(path, effectBinding)
      return true
    }
    this.cancelEnumLoad(path, field)
    const options = asOptions(value) ?? []
    if (deepEqual(field.enumOptions, options)) return false
    field.enumOptions = options
    this.afterEnum(path)
    return true
  }

  /** Supersede a pending / in-flight `EnumSource` load on `path`: clear its debounce timer, abort it, reset `loading`. */
  private cancelEnumLoad(path: string, field: FieldModel): void {
    field.enumSeq++
    const timer = this.enumTimers.get(path)
    if (timer) {
      clearTimeout(timer)
      this.enumTimers.delete(path)
    }
    this.enumAbort.get(path)?.abort()
    this.enumAbort.delete(path)
    if (field.enumLoading) {
      field.enumLoading = false
      this.deps.notifier.bumpPath(path)
    }
  }

  /** Commit an enum lease. Binding previews static options during render without mutating the model. */
  applyJsxEnum(path: string, input: unknown): FieldModel {
    const { store, notifier, scheduler } = this.deps
    const field = store.ensure(path)
    const binding = toEnumBinding(input)
    const next = binding ?? asOptions(input) ?? []
    if (!sameJsxEnum(field.jsxEnum, next)) {
      const first = field.jsxEnum === undefined
      field.jsxEnum = next
      if (!field.enumFromEffect) {
        if (binding) {
          this.loadEnum(path, binding)
        } else {
          // Supersede an in-flight load (an earlier binding or a reaction's that has since been replaced).
          this.cancelEnumLoad(path, field)
          if (!deepEqual(field.enumOptions, next)) {
            field.enumOptions = next as EnumOption[]
            notifier.bumpPath(path)
            scheduler.markDirty(`${path}:enum`)
            // An update behaves like `$enum` (policy applies, in the commit); the first mount like a declaration.
            if (!first) this.afterEnum(path)
          }
        }
      }
      scheduler.enqueueFromDirty()
      scheduler.flush()
    }
    return field
  }

  /** Drop the `<Field enum>` layer (unmount, or the prop removed) and fall back to `fields` / the item template. */
  releaseJsxEnum(path: string, lease?: unknown): void {
    const { store, notifier, scheduler, declarations } = this.deps
    const field = store.get(path)
    if (!field || field.jsxEnum === undefined) return
    // The leased model moved with its row (its component re-applies at the new path) or was replaced.
    if (lease !== undefined && lease !== field) return
    field.jsxEnum = undefined
    if (field.enumFromEffect) return
    const wasLoading = field.enumLoading
    this.cancelEnumLoad(path, field)
    const declBinding = declarations.declaredEnumBinding(path)
    if (declBinding) {
      this.loadEnum(path, declBinding)
      return
    }
    const next = declarations.declaredEnum(path)
    if (wasLoading || !deepEqual(field.enumOptions, next)) {
      field.enumOptions = next
      notifier.bumpPath(path)
      scheduler.markDirty(`${path}:enum`)
    }
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  private loadEnum(path: string, binding: EnumLoadBinding): void {
    const { store, notifier, scheduler } = this.deps
    const field = store.ensure(path)
    const seq = ++field.enumSeq
    const start = () => {
      this.enumTimers.delete(path)
      if (field.enumSeq !== seq) return
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

/** Same JSX enum: equal static lists, or the same source with equal params. */
function sameJsxEnum(prev: EnumOption[] | EnumBinding | undefined, next: EnumOption[] | EnumBinding): boolean {
  if (prev === undefined) return false
  if (isEnumBinding(prev) || isEnumBinding(next)) {
    return isEnumBinding(prev) && isEnumBinding(next) && prev.source === next.source && deepEqual(prev.params, next.params)
  }
  return deepEqual(prev, next)
}

function isPlainPatchObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function collectPatchEntries(node: Record<string, unknown>, current: unknown, prefix: string, out: [string, unknown][]): void {
  const keys = Object.keys(node)
  if (!keys.length) {
    if (prefix && !isPlainPatchObject(current)) out.push([prefix, {}])
    return
  }
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key
    const val = node[key]
    if (isPlainPatchObject(val)) collectPatchEntries(val, isPlainPatchObject(current) ? current[key] : undefined, path, out)
    else out.push([path, val])
  }
}
