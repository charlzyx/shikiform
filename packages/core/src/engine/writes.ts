import type { Declarations } from '../declarations/declarations'
import { guardReactionAction, isReactionId, type Scheduler } from '../effects/scheduler'
import { asOptions, isEnumBinding, isEnumSource, toEnumBinding, type EnumBinding, type EnumOption } from '../enum/enum-source'
import { cloneExternal, resetExternalCloneTraversal } from '../draft/plain-clone'
import { isDropped, pendingOf, projectValue, tagPending, type CellAnchor, type PendingValue } from '../draft/pending'
import { unwrapDraft } from '../draft/patch'
import { unwrapReadonly } from '../draft/readonly'
import { ShikiUsageError, showDraftPath } from '../errors'
import { arrayIndex } from '../shared/dense-array'
import { deepEqual } from '../shared/equal'
import { appendValueKey, assertUnambiguousWritePath, getAt, normalizePath, parentPath, pathSegments, setAt } from '../shared/path'
import type { FlagName } from '../state/flags'
import type { FieldModel } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { WriteOp } from '../types'
import type { FormOptions } from '../types-effects'
import { checkDraftRules, isEmpty, optionIncludes, type Rule } from '../validation/rules'
import type { Validator } from '../validation/validator'
import { prepareUiWrite, uiKeyOf, type FieldUi } from './field-ui'

interface EnumLoad {
  binding: EnumBinding
  key: string
  timer?: ReturnType<typeof setTimeout>
  controller?: AbortController
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
  /**
   * Commit a draft array mutator (`push`, `splice`, a hole from `delete`).
   * Row identity, field-model reindex, item templates, and precise `dirtyRows` stay in `ArrayOps`.
   */
  commitArray?: (path: string, next: unknown[]) => boolean
}

/**
 * Every write to values and `$` state goes through here.
 *
 * - User edits (`setValue`, `binding().onChange`) → {@link StateWriter.commitExternal}: sticky `edited` flags + `onChange` trigger.
 *   `dirty` is not written here: the engine derives it from values vs `initial`.
 * - Draft writes (`d.x.$value = …`, `$visible`, `$rules`, …) → {@link StateWriter.writeState}: buffered inside a
 *   reaction / watch / batch, applied immediately otherwise.
 * - `$enum` with an `EnumSource` binding loads asynchronously and cancels superseded work.
 */
export class StateWriter {
  private enumLoads = new Map<FieldModel, EnumLoad>()

  constructor(private readonly deps: WriterDeps, private enumLoadsPaused = false) {}

  resumeEnumLoads(): void {
    if (!this.enumLoadsPaused) return
    this.enumLoadsPaused = false
    if (!this.enumLoads.size) return
    for (const [field, { binding }] of [...this.enumLoads]) {
      this.enumLoads.delete(field)
      if (this.deps.store.get(field.path) === field) this.loadEnum(field.path, binding)
    }
    this.deps.notifier.emit()
  }

  /** Release this engine's consumers and keep pending bindings for an effect setup after cleanup. */
  dispose(): void {
    this.enumLoadsPaused = true
    for (const [field, { binding, key }] of [...this.enumLoads]) {
      this.cancelEnumLoad(field)
      this.enumLoads.set(field, { binding, key })
    }
  }

  attachUi(ui: FieldUi): FieldUi {
    this.deps.ui = ui
    return ui
  }

  /** Draft write entry point (`DraftHost.writeState`). */
  writeState(rawPath: string, key: string, value: unknown, anchors?: readonly CellAnchor[]): void {
    const path = this.writablePath(rawPath, true)
    if (path === undefined) return
    this.rejectInstallWrite(path, key)
    value = storedValue(value)
    const op = this.makeOp(path, key, value, anchors)
    if (!op) return
    this.enqueue(op, !!this.deps.ui?.isUiOp(op))
  }

  /** A `$` write on the registration `draft`, outside reaction / watch / batch. */
  private rejectInstallWrite(path: string, key: string): void {
    const scheduler = this.deps.scheduler
    if (process.env.NODE_ENV === 'production' || scheduler.installDepth === 0 || scheduler.current()) return
    const shown = `${showDraftPath(path)}.${key}`
    throw new ShikiUsageError(
      `${shown} = … runs while defineEffects is registering, outside reaction / watch / batch. ` +
        `That write would apply immediately, before later effects are installed. ` +
        `Use draft to name a path (reaction.each(draft.items, …) / watch.each(draft.rows, …)). ` +
        `Write $ state inside reaction((d) => …) or watch. ` +
        `Reading ${showDraftPath(path)}.$value here returns the current value and, in development, a read-only view; it is not a dependency.`,
    )
  }

  /**
   * A draft array mutator on a value path. One op replaces the array; `ArrayOps` reindexes rows when it applies.
   * The op key matches a whole `$value` write so a later `push` in the same pass sees this array.
   */
  writeArray(rawPath: string, next: unknown[], anchors?: readonly CellAnchor[]): void {
    const path = this.writablePath(rawPath, true)
    if (path === undefined) return
    const value = storedValue(next) as unknown[]
    const pending: PendingValue = { kind: 'value', path, mode: 'mutate', value, anchors }
    const op: WriteOp = { key: `${path}:value`, apply: () => this.deps.commitArray?.(pending.path, value) ?? false }
    tagPending(op, pending)
    this.enqueue(op, false)
  }

  /** `delete` of an object key on a value draft. An array index is a hole (`writeArray`), not this. */
  dropField(rawPath: string): void {
    const path = this.writablePath(rawPath, true)
    if (!path) return
    const op: WriteOp = { key: `${path}:value`, apply: () => this.applyDrop(path) }
    tagPending(op, { kind: 'value', path, mode: 'delete' })
    this.enqueue(op, false)
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
      const index = tracker.writes.findIndex((item) => item.key === op.key && !isDropped(item))
      if (index >= 0 && patch) tracker.writes.splice(index, 1)
      else if (index >= 0) {
        tracker.writes[index] = op
        return
      }
      tracker.writes.push(op)
      return
    }
    if (scheduler.batchDepth > 0) {
      const index = scheduler.batchOps.findIndex((item) => item.key === op.key && !isDropped(item))
      if (index >= 0 && patch) scheduler.batchOps.splice(index, 1)
      else if (index >= 0) {
        scheduler.batchOps[index] = op
        return
      }
      scheduler.batchOps.push(op)
      return
    }
    if (op.apply()) scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  commitExternal(rawPath: string, value: unknown): void {
    const { store, scheduler } = this.deps
    const buffered = guardReactionAction(scheduler, 'setValue')
    const path = this.writablePath(rawPath, buffered)
    if (path === undefined) return
    // Clone caller data (`setValue`, `binding().onChange`). Identity is preserved only inside this path's subtree.
    resetExternalCloneTraversal()
    value = cloneExternal(value, getAt(store.values, path))
    if (!buffered) {
      this.applyExternal(path, value)
      return
    }
    const pending: PendingValue = { kind: 'value', path, mode: 'set', value }
    const op: WriteOp = { key: `${path}:value`, apply: () => this.applyExternal(pending.path, pending.value) }
    tagPending(op, pending)
    this.enqueue(op, false)
  }

  private applyExternal(path: string, value: unknown): boolean {
    const { store, notifier, scheduler, validator } = this.deps
    if (!this.commitValue(path, value, false)) return false
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
    return true
  }

  /** Apply a deep partial object update in a single reaction/watch flush (`form.patchValues`). */
  patchValues(partial: unknown): void {
    if (!partial || typeof partial !== 'object') return
    const { values } = this.deps.store
    const entries: [string, unknown][] = []
    collectPatchEntries(partial as Record<string, unknown>, values, '', entries)
    // Each leaf is cloned against the subtree it replaces, not the rest of the form.
    resetExternalCloneTraversal()
    const cloned = entries.flatMap(([rawPath, value]): [string, unknown][] => {
      const path = this.writablePath(rawPath)
      return path === undefined ? [] : [[path, cloneExternal(value, getAt(values, path))]]
    })
    this.commitPatch(cloned)
  }

  /** Check the original segments before flattening bracket aliases into the dotted index. */
  private writablePath(path: string, replay = false): string | undefined {
    const { store, scheduler } = this.deps
    const pending = replay ? (scheduler.current()?.writes ?? scheduler.batchOps) : []
    const parts = pathSegments(path)
    let prefix = ''
    let parent: unknown = store.values
    for (const part of parts) {
      if (arrayIndex(part) === undefined) {
        const projected = pending.some((op) => {
          const write = pendingOf(op)
          return write?.kind === 'value' && (
            write.path === prefix || !write.path || prefix.startsWith(write.path + '.') ||
            (parent == null && write.path.startsWith(prefix + '.'))
          )
        })
        const container = projected ? projectValue(parent, prefix, pending, false) : parent
        if (Array.isArray(container)) {
          if (process.env.NODE_ENV !== 'production') {
            throw new ShikiUsageError(`Cannot write ${JSON.stringify(path)}: an array index must be a non-negative integer.`)
          }
          return undefined
        }
      }
      parent = parent != null && (typeof parent === 'object' || typeof parent === 'function')
        ? (parent as Record<string, unknown>)[part]
        : undefined
      prefix = appendValueKey(prefix, part)
    }
    assertUnambiguousWritePath(path)
    return path.includes('[') ? parts.join('.') : path
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
    const { store, scheduler, declarations } = this.deps
    // A reaction write marks the field computed (excluded from `dirty`), also when the derived value already
    // equals the current one (an initial value that is already right). It stays in the submit payload unless
    // this field is omitted (its own `omit`, or an ancestor's).
    if (fromReaction) store.ensure(path).computed = true
    const before = store.values
    const parent = parentPath(path) ?? ''
    const owner = getAt(before, parent)
    const key = path.slice(parent ? parent.length + 1 : 0)
    const old = getAt(before, path)
    const missing = !!path && (owner == null || !Object.hasOwn(owner, key))
    const createsOwnKey = missing && owner && typeof owner === 'object' && (!Array.isArray(owner) || arrayIndex(key) !== undefined)
    if (deepEqual(old, value) && !createsOwnKey) return false
    store.values = setAt(before, path, value)
    if (missing) {
      let extendedArray = false
      const noteCreated = (containerPath: string, createdKey: string) => {
        scheduler.markDirty(`${containerPath}:keys`)
        const idx = arrayIndex(createdKey)
        if (idx !== undefined && Array.isArray(getAt(store.values, containerPath))) {
          scheduler.markDirtyRows(containerPath, new Set([idx]))
          scheduler.markStructure(containerPath)
          extendedArray = true
        }
      }
      noteCreated(parent, key)
      // A deep write can create several missing object/array entries in one operation.
      let child = parent
      while (child) {
        const ancestor = parentPath(child) ?? ''
        const seg = child.slice(ancestor ? ancestor.length + 1 : 0)
        const container = getAt(before, ancestor)
        if (container != null && Object.hasOwn(container, seg)) break
        noteCreated(ancestor, seg)
        child = ancestor
      }
      if (extendedArray) declarations.applyItemTemplates()
    }
    this.deps.carryRowIdentity?.(path, before, store.values)
    // A changed value invalidates external (`setErrors`) messages on this path, its ancestors and descendants.
    this.deps.validator.clearExternalAround(path)
    if (Array.isArray(old) || Array.isArray(value)) {
      scheduler.markDirtyRows(path, 'all')
      scheduler.markStructure(path)
      declarations.applyItemTemplates()
    }
    const replacement = (value != null && typeof value === 'object') || (old != null && typeof old === 'object')
    if (replacement) this.deps.validator.noteReplacement(path, before)
    scheduler.markValueChanged(path, replacement ? { before, after: store.values, fields: store.fields.keys() } : undefined)
    return true
  }

  private makeOp(path: string, key: string, value: unknown, anchors?: readonly CellAnchor[]): WriteOp | undefined {
    const uiKey = uiKeyOf(key)
    if (uiKey && this.deps.ui) return this.deps.ui.makeOp(path, uiKey, value)
    if (key === '$value') {
      const fromReaction = isReactionId(this.deps.scheduler.current()?.id ?? '')
      const pending: PendingValue = {
        kind: 'value',
        path,
        mode: 'set',
        value,
        anchors: anchors?.length ? anchors : undefined,
      }
      const op: WriteOp = {
        key: `${path}:value`,
        apply: () => (pending.drop ? false : this.commitValue(pending.path, pending.value, fromReaction)),
      }
      tagPending(op, pending)
      return op
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
      if (value !== undefined && !Array.isArray(value) && !isEnumSource(value)
        && !(isEnumBinding(value) && isEnumSource(value.source))) {
        if (process.env.NODE_ENV !== 'production') {
          throw new ShikiUsageError(`${showDraftPath(path)}.$enum expects an array, an EnumSource or its .with(params) binding, or undefined.`)
        }
        return
      }
      const op: WriteOp = { key: `${path}:enum`, apply: () => this.setEnum(path, value) }
      tagPending(op, { kind: 'enum', path, value: asOptions(value) ?? value })
      return op
    }
    if (key === '$rules') {
      if (!checkDraftRules(value, path)) return
      const op: WriteOp = { key: `${path}:rules`, apply: () => this.setRules(path, value) }
      tagPending(op, { kind: 'rules', path, value })
      return op
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
      field.enumEffect = undefined
      this.cancelEnumLoad(field)
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
      this.deps.store.setEnumOptions(field, next)
      this.afterEnum(path)
      return true
    }
    field.enumFromEffect = true
    field.enumEffect = value
    const effectBinding = toEnumBinding(value)
    if (effectBinding) {
      const cached = effectBinding.source.cached(effectBinding.params)
      if (cached && deepEqual(field.enumOptions, cached)) {
        this.cancelEnumLoad(field)
        return false
      }
      return this.loadEnum(path, effectBinding)
    }
    this.cancelEnumLoad(field)
    const options = asOptions(value) ?? []
    if (deepEqual(field.enumOptions, options)) return false
    this.deps.store.setEnumOptions(field, options)
    this.afterEnum(path)
    return true
  }

  /** Supersede a pending or in-flight load and reset loading. */
  cancelEnumLoad(field: FieldModel): void {
    const load = this.enumLoads.get(field)
    this.enumLoads.delete(field)
    clearTimeout(load?.timer)
    load?.controller?.abort()
    if (field.enumLoading) {
      field.enumLoading = false
      this.deps.notifier.bumpPath(field.path)
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
          this.cancelEnumLoad(field)
          if (!deepEqual(field.enumOptions, next)) {
            store.setEnumOptions(field, next as EnumOption[])
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
    this.cancelEnumLoad(field)
    const declBinding = declarations.declaredEnumBinding(path)
    if (declBinding) {
      this.loadEnum(path, declBinding)
      return
    }
    const next = declarations.declaredEnum(path)
    if (wasLoading || !deepEqual(field.enumOptions, next)) {
      store.setEnumOptions(field, next)
      notifier.bumpPath(path)
      scheduler.markDirty(`${path}:enum`)
    }
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  private loadEnum(path: string, binding: EnumBinding): boolean {
    const { store, notifier, scheduler } = this.deps
    const field = store.ensure(path)
    const prev = this.enumLoads.get(field)
    const key = binding.source.key(binding.params)
    // A moved model can re-run its reaction with the same binding, including while debounced.
    if (prev?.binding.source === binding.source && prev.key === key) return false
    clearTimeout(prev?.timer)
    const load: EnumLoad = { binding, key, controller: prev?.controller }
    this.enumLoads.set(field, load)
    if (this.enumLoadsPaused) return true

    const isCurrent = () => this.enumLoads.get(field) === load && store.get(field.path) === field
    const start = () => {
      if (!isCurrent()) return
      load.timer = undefined
      load.controller?.abort()
      if (!isCurrent()) return
      const ac = new AbortController()
      load.controller = ac
      field.enumLoading = true
      notifier.bumpPath(field.path)
      void binding.source.load(binding.params, ac.signal).then(
        (options) => {
          if (!isCurrent()) return
          this.enumLoads.delete(field)
          store.setEnumOptions(field, options)
          field.enumLoading = false
          this.afterEnum(field.path)
          scheduler.enqueueFromDirty()
          scheduler.flush()
        },
        () => {
          if (!isCurrent()) return
          this.enumLoads.delete(field)
          field.enumLoading = false
          notifier.bumpPath(field.path)
          notifier.emit()
        },
      )
    }
    const wait = binding.source.debounce
    if (wait > 0) load.timer = setTimeout(start, wait)
    else start()
    return true
  }

  /** Remove one object key. Does not splice an array index and does not mark the parent computed. */
  private applyDrop(path: string): boolean {
    const parent = parentPath(path)
    const key = parent === null ? path : path.slice(parent.length + 1)
    const { store, scheduler } = this.deps
    const owner = parent === null ? store.values : getAt(store.values, parent)
    if (!owner || typeof owner !== 'object' || Array.isArray(owner)) return false
    if (!Object.prototype.hasOwnProperty.call(owner, key)) return false
    const next = { ...(owner as Record<string, unknown>) }
    delete next[key]
    scheduler.markDirty(`${parent ?? ''}:keys`)
    const before = store.values
    store.values = (parent === null ? next : setAt(store.values, parent, next)) as typeof store.values
    this.deps.carryRowIdentity?.(parent ?? path, before, store.values)
    this.deps.validator.clearExternalAround(path)
    this.deps.validator.noteReplacement(path, before)
    scheduler.markValueChanged(path, { before, after: store.values, fields: store.fields.keys() })
    return true
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

/** Peel a UI patch, a development view, or an effect draft so the store never holds a proxy. */
function storedValue(value: unknown): unknown {
  const ui = prepareUiWrite(value)
  if (ui !== undefined) return ui
  let next = value
  if (process.env.NODE_ENV !== 'production') next = unwrapReadonly(next)
  return unwrapDraft(next)
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
    const path = appendValueKey(prefix, key)
    const val = node[key]
    if (isPlainPatchObject(val)) collectPatchEntries(val, isPlainPatchObject(current) ? current[key] : undefined, path, out)
    else out.push([path, val])
  }
}
