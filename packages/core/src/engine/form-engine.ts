import { Declarations, type RegisterSpec } from '../declarations/declarations'
import { createHandle, handlePath } from '../draft/handle'
import type { DraftHost } from '../draft/host'
import { readonlyValue } from '../draft/readonly'
import { assertNotWritten, Scheduler, type EachDirty, type EachRec } from '../effects/scheduler'
import { getAt, normalizePath } from '../shared/path'
import { submitValueAt, validateResult } from './submit-values'
import { shownErrors } from '../state/field-model'
import { asOptions } from '../enum/enum-source'
import { effectiveFlag, setRootFlag } from '../state/flags'
import { FieldStore } from '../state/field-store'
import { Notifier } from '../state/notifier'
import { ArrayOps } from '../structure/arrays'
import { findPos, pathOf, type Pos } from '../shared/tree-ops'
import { TreeOps, type TreeConfig } from '../structure/trees'
import { formatMessage, type FormMessageKey, type MessageArgs } from '../validation/messages'
import { SubmitSupersededError, SubmitUnstableError } from '../errors'
import type {
  FieldUiSpec,
  ArrayItemOf,
  ArrayPath,
  DeepPartial,
  Draft,
  EffectsRuntime,
  FieldError,
  FieldPath,
  FieldSpec,
  MoveResult,
  PathValue,
  ValidatePick,
  ValuePath,
  SubmitResolved,
  WriteOp,
} from '../types'
import type { FormInstance } from '../types-form'
import type { FormOptions } from '../types-effects'
import { Validator } from '../validation/validator'
import { Baseline, errorEntries } from './baseline'
import { EffectDrafts } from './effect-draft'
import { FieldUi, uiKeyOf } from './field-ui'
import { forkEngineOptions } from './fork'
import { pathDomId, uiDomId } from './dom-id'
import { UiNodes, type UiJsx, type UiKind, type UiNodeView } from './ui-nodes'
import { StateWriter } from './writes'

/** Form engine. No React and no UI. Parts: see `design/ARCHITECTURE.md`. */
export class FormEngine<T = any, TSubmit = T> implements FormInstance<T, TSubmit>, DraftHost, EffectsRuntime<T> {
  /** Root draft. Prefer {@link FormEngine.batch} so writes flush once. */
  private readonly rootDraft: Draft<T>
  get draft(): Draft<T> { return this.draftScope() ? this.handle('') : this.rootDraft }
  /** Options passed to {@link createForm}. */
  readonly options: FormOptions<T>

  private readonly store: FieldStore<T>
  private readonly notifier: Notifier
  private readonly scheduler: Scheduler
  private readonly validator: Validator
  private readonly declarations: Declarations
  private readonly arrays: ArrayOps
  private readonly trees: TreeOps
  private readonly writer: StateWriter
  private readonly fieldUi: FieldUi
  private readonly uiNodes: UiNodes
  private readonly drafts: EffectDrafts
  private pendingSubmits = 0
  private submitSerial = 0
  private readonly baseline: Baseline

  constructor(options: FormOptions<T> = {}) {
    this.options = options
    const store = (this.store = new FieldStore<T>((options.initialValues ?? {}) as T))
    const notifier = (this.notifier = new Notifier())
    const scheduler = (this.scheduler = new Scheduler(notifier, !!options.devtools))
    const trees = (this.trees = new TreeOps(store, scheduler, options.messages, options.trees as Record<string, { childrenKey?: string; rowKey?: string } | undefined>))
    const validator = (this.validator = new Validator({ store, notifier, scheduler, options, readPos: (path) => trees.readPos(path) }))
    const declarations = (this.declarations = new Declarations(store, notifier, validator, options.fields as Record<string, FieldSpec | undefined>))
    validator.prepare = () => declarations.applyItemTemplates()
    this.arrays = new ArrayOps(store, scheduler, declarations, validator)
    this.writer = new StateWriter({
      store, notifier, scheduler, validator, declarations, options,
      carryRowIdentity: (path, before, after) => this.arrays.carryIdentity(path, before, after),
      commitArray: (path, next) => this.arrays.commitNext(path, next),
    })
    declarations.onDeclaredEnum = (path, binding) => this.writer.loadDeclaredEnum(path, binding)
    this.fieldUi = this.writer.attachUi(new FieldUi(store, notifier, scheduler, (path, key, value) => this.writeState(path, key, value)))
    this.uiNodes = new UiNodes(store, notifier, scheduler, this.writer, this.fieldUi)
    this.drafts = new EffectDrafts({ store, scheduler, writer: this.writer, fieldUi: this.fieldUi, trees, declarations })
    this.rootDraft = createHandle(this, '') as Draft<T>
    this.baseline = new Baseline({ store, notifier, scheduler, validator, declarations })
    scheduler.onSettle = () => this.baseline.sync()
    for (const [path, spec] of Object.entries(options.trees ?? {}) as [string, { childrenKey?: string; rowKey?: string } | undefined][]) {
      if (spec) this.registerTree(path, spec)
    }
    for (const [path, spec] of Object.entries(options.fields ?? {}) as [string, FieldSpec | undefined][]) {
      if (spec) this.registerField(path, spec)
    }
    const root = store.ensure('')
    setRootFlag(root, 'readOnly', options.readOnly)
    setRootFlag(root, 'disabled', options.disabled)
    scheduler.initializing = true
    try {
      for (const effect of options.effects ?? []) effect.install(this)
      scheduler.flush()
      declarations.applyItemTemplates()
      scheduler.enqueueFromDirty()
      scheduler.flush()
    } finally { scheduler.initializing = false }
  }

  // —— form state (read-only, #36: writes go through setValue / batch / reset / submit so subscribers hear them) ——

  /** Current values. Write with `setValue`, `batch`, or `reset(values)`. Development: a read-only view. */
  get values(): T {
    return (process.env.NODE_ENV !== 'production' ? readonlyValue(this.store.values, '') : this.store.values) as T
  }

  /** Baseline `reset()` restores and `dirty` compares against. Cloned on create; replaced by `reset(values)` / `setInitialValues`. */
  get initial(): T { return this.store.initial }

  /** True for the duration of {@link FormEngine.submit}, including the validation it waits for. */
  get submitting(): boolean { return this.store.submitting }

  /** True while a validate pass is running, including the async rules it waits for. */
  get validating(): boolean { return this.store.validating }

  /** Values differ from {@link FormEngine.initial} (deep; reverting clears it). Effective `omit` (the field and descendants of an omitted ancestor) and computed fields are ignored. Hidden fields count. The omitted field's own field-level dirty can still be true. */
  get dirty(): boolean { return this.baseline.formDirty() }

  /** Sticky: a user edit (`setValue`, `binding().onChange`) happened since `reset`. A reaction write does not count. */
  get edited(): boolean { return this.store.edited }

  /** Incremented once per {@link FormEngine.submit}, including calls that fail validation. */
  get submitCount(): number { return this.store.submitCount }

  /** Effective root `readOnly` flag. */
  get readOnly(): boolean { return this.store.effective('', 'readOnly') }

  /** Effective root `disabled` flag. */
  get disabled(): boolean { return this.store.effective('', 'disabled') }

  /** When true, each reaction pass is traced. */
  get devtools(): boolean {
    return this.scheduler.devtools
  }
  set devtools(on: boolean) {
    this.scheduler.devtools = on
  }

  /** Messages for every field that still validates (`visible && !disabled && !readOnly`). */
  get errors(): FieldError[] {
    return this.validator.errors()
  }

  /**
   * False during submit/validation, or when a field that still validates has errors.
   * Fields that have not been validated yet do not block.
   */
  get canSubmit(): boolean {
    const store = this.store
    if (store.submitting || store.validating) return false
    for (const field of store.fields.values()) {
      if (field.validating) return false
      if (!store.acceptsValidation(field.path)) continue
      if (shownErrors(field).length) return false
    }
    return true
  }

  // —— values ——

  /** Read one typed path (`a.b.0` or `a.b[0]`). Development: a read-only view, stable per object. Production: the stored value. */
  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P>
  getValue<P extends string>(path: ValuePath<T, P>): PathValue<T, P>
  getValue(path: string): unknown {
    const key = String(path)
    return process.env.NODE_ENV !== 'production' ? readonlyValue(getAt(this.store.values, key), normalizePath(key)) : getAt(this.store.values, key)
  }

  /** Write one path from outside a reaction (`a.b.0` or `a.b[0]`). Marks the field dirty and runs `onChange` validation when configured. */
  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void
  setValue<P extends string>(path: ValuePath<T, P>, value: PathValue<T, P>): void
  setValue(path: string, value: unknown): void {
    this.writer.commitExternal(String(path), value)
  }

  /** Deep-merge partial values into the form in a single flush. */
  patchValues(partial: DeepPartial<T>): void { this.writer.patchValues(partial) }
  /** Set or clear (`undefined`) the root `$readOnly` / `$disabled` flag in one batch. */
  setReadOnly(readOnly?: boolean): void { this.batch((d) => { d.$readOnly = readOnly }) }
  setDisabled(disabled?: boolean): void { this.batch((d) => { d.$disabled = disabled }) }

  /** One draft, one reaction pass, one notification. Discards buffered writes if `fn` throws. */
  batch(fn: (d: Draft<T>) => void): void {
    const scheduler = this.scheduler
    scheduler.holdFlush(() => {
      scheduler.bufferBatch(() => fn(this.draft))
      if (scheduler.batchDepth > 0 || scheduler.current()) return
      for (const op of scheduler.takeBatchOps()) op.apply()
      scheduler.enqueueFromDirty()
      scheduler.flush()
    })
  }

  omittedPaths(): string[] {
    return [...this.store.fields.keys()].filter(path => path && this.store.effective(path, 'omit'))
  }

  /** Remove omitted paths deepest first so an omitted ancestor always wins. */
  getSubmitValues(): TSubmit {
    return submitValueAt(this.store.values, this.store) as TSubmit
  }

  /** Validate, then call `onValid` with {@link FormEngine.getSubmitValues}. Rejects `FieldError[]` on validation failure. */
  submit(): Promise<TSubmit>
  submit<R>(onValid: (values: TSubmit) => R | Promise<R>): Promise<SubmitResolved<TSubmit, R>>
  async submit<R>(onValid?: (values: TSubmit) => R | Promise<R>): Promise<TSubmit | SubmitResolved<TSubmit, R>> {
    const { store, scheduler, notifier, validator } = this
    const serial = ++this.submitSerial
    store.submitCount += 1
    this.pendingSubmits += 1
    store.submitting = true
    scheduler.bumpMeta()
    notifier.emit()
    try {
      const errors = await validator.submitVerdict()
      const unsettled = this.message('superseded', { path: '', value: store.values })
      if (serial !== this.submitSerial) throw new SubmitSupersededError(unsettled)
      if (errors === null) throw new SubmitUnstableError(unsettled)
      if (errors.length) {
        notifier.validateFailed(errors)
        throw errors
      }
      const values = this.getSubmitValues()
      if (!onValid) return values
      const returned = await onValid(values)
      return (returned === undefined ? values : returned) as TSubmit | SubmitResolved<TSubmit, R>
    } finally {
      this.pendingSubmits -= 1
      store.submitting = this.pendingSubmits > 0
      scheduler.bumpMeta()
      notifier.emit()
    }
  }

  /**
   * Restore initial values (`reset('a.b')`: one subtree). Reactions run again; touched, edited and all messages clear.
   * `reset(values)` first makes `values` the new initial values (edit-page backfill): a later `reset()` returns to them.
   */
  reset(pathOrValues?: FieldPath<T> | T): void {
    this.baseline.reset(pathOrValues as string | object | undefined)
  }

  /** Replace the baseline, keep the values: after a save, `setInitialValues(form.values)`. To load a record, `reset(record)`. */
  setInitialValues(values: T): void {
    this.baseline.setInitial(values)
  }

  /**
   * External messages (a server response): `{ path: message | messages }` or `FieldError[]`, `''` is the root; empty clears.
   * Shown in `errors` / `binding().errors` / `$errors` and block `canSubmit` until the value at, above or below the path
   * changes, the field validates again (every `submit` does), or `reset` / `clearErrors`.
   */
  setErrors(errors: Partial<Record<FieldPath<T> | '', string | string[] | null | undefined>> | FieldError[]): void {
    this.validator.setExternalMany(errorEntries(errors as Record<string, string | string[] | null | undefined> | FieldError[]))
  }

  /** Clear every message (rule, schema, external) on `path` and its descendants, or on the whole form. Values are untouched. */
  clearErrors(path?: FieldPath<T>): void {
    this.validator.clearAll(path ? String(path) : undefined)
  }

  /** One built-in text resolved for this form: `options.messages` → `setDefaultMessages` → `zhCN`. */
  message<K extends FormMessageKey>(key: K, ...params: MessageArgs<K>): string {
    return formatMessage(this.options.messages, key, ...params)
  }

  /** Validate one scope. Resolves the submit-shaped clone; rejects `FieldError[]`. A form-level throw rejects as-is. */
  validate(path?: undefined): Promise<TSubmit>
  validate<P extends FieldPath<T>>(path: P): Promise<PathValue<T, P>>
  validate<const Paths extends readonly FieldPath<T>[]>(paths: Paths): Promise<ValidatePick<T, Paths>>
  async validate(path?: string | readonly string[]): Promise<any> {
    const errors = await this.validator.validate(path as string | readonly string[] | undefined)
    if (errors.length) {
      this.notifier.validateFailed(errors)
      throw errors
    }
    return validateResult(this.store.values, this.store, path)
  }

  /** Untyped handle for an exact path. Prefer {@link FormEngine.getValue} and {@link FormEngine.batch}. */
  query(path: string): any { return this.handle(path) }
  beginEffectInstall(): void { this.scheduler.beginInstall() }
  endEffectInstall(): void { this.scheduler.endInstall() }

  // —— structure ——
  // Not on FormInstance. React: useArrayField(name?), useTreeField(name), or useTreeField() on a node
  // (that node plus the tree edits). Also useArrayTable / useShadowForm. Tests call createEngine / engineOf.

  /** @internal Move an array row. `to` is the final index. Field models follow the row id. */
  moveArray<P extends ArrayPath<T>>(path: P, from: number, to: number): void {
    this.arrays.move(path, from, to)
  }

  /** @internal Exchange two indexes. Field models follow the row ids. */
  swapArray<P extends ArrayPath<T>>(path: P, indexA: number, indexB: number): void {
    this.arrays.swap(path, indexA, indexB)
  }

  /** @internal Replace the row at `index`. The previous row's field model is dropped. */
  replaceArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void {
    this.arrays.replace(path, index, row)
  }

  /** @internal Insert `row` at `index`. Later field models follow row id. Item templates apply to the new index. */
  insertArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void {
    this.arrays.insert(path, index, row)
  }

  /** @internal Remove the row at `index`. Its field model is dropped. */
  removeArray<P extends ArrayPath<T>>(path: P, index: number): void {
    this.arrays.remove(path, index)
  }

  /** @internal Append `row`. Item templates (`rows.*.name`) apply to the new index. */
  pushArray<P extends ArrayPath<T>>(path: P, row: ArrayItemOf<T, P & string>): void {
    this.arrays.push(path, row)
  }

  /** @internal Tree edits. Field models follow the node id. `move` refuses a move into a descendant. */
  moveTree(path: string, from: Pos, to: Pos): MoveResult { return this.trees.move(path, from, to) }
  pushTree(path: string, node: unknown, parentPos?: Pos): void { this.trees.push(path, node, parentPos) }
  insertTree(path: string, pos: Pos, node: unknown): void { this.trees.insert(path, pos, node) }
  removeTree(path: string, pos: Pos): void { this.trees.remove(path, pos) }
  replaceTree(path: string, pos: Pos, node: unknown): void { this.trees.replace(path, pos, node) }

  /** Remember which key identifies a row so field models follow that id across moves. */
  registerArray(path: string, rowKey?: string): void {
    this.arrays.register(path, rowKey)
  }

  /**
   * Register a tree root so effects can address it before React mounts.
   * `childrenKey` defaults to `'children'`. `rowKey` defaults to `'id'`.
   */
  registerTree(
    path: string,
    spec: { childrenKey?: string; rowKey?: string; canMove?: (args: any) => string | null | undefined } = {},
  ): void {
    this.trees.register(path, spec)
  }

  /** Track an object row across immutable cell edits, including in a bound editing draft. */
  rowIdentity(row: object): string {
    const id = (row as { id?: unknown }).id
    return id == null ? 'object:' + this.arrays.rowIdent(row, 0) : 'id:' + String(id)
  }

  /** Row keys for rendering. Uses `rowKey` or `id` when present, otherwise a stable object identity. */
  structureKeys(path: string, rowKey?: string): { key: string; index: number }[] {
    return this.arrays.keys(path, rowKey)
  }

  treeConfig(path: string): TreeConfig {
    return this.trees.config(path)
  }

  /** Longest registered tree root that contains `path` (used by anonymous node hooks). */
  treeRoot(path: string): string | undefined {
    return this.trees.root(path)
  }

  // —— subscriptions ——

  /** Diagnostic counters: reaction id → run count. */
  getDebugStats(): { runs: Record<string, number> } {
    return { runs: Object.fromEntries(this.scheduler.runs) }
  }

  /** Re-render when this path's value or field state changes. Returns the unsubscribe. */
  subscribePath(path: string, listener: () => void): () => void {
    return this.notifier.subscribePath(path, listener)
  }

  /** Re-render when this array or tree changes length or order. Cell edits do not notify. */
  subscribeStructure(path: string, listener: () => void): () => void {
    return this.notifier.subscribeStructure(path, listener)
  }

  /** Notified when `canSubmit`, `submitting`, `submitCount`, `dirty`, or `validating` change. */
  subscribeMeta(listener: () => void): () => void {
    return this.notifier.subscribeMeta(listener)
  }

  /** Snapshot for {@link FormEngine.subscribeMeta}. */
  getMetaVersion(): number { return this.notifier.getMetaVersion() }

  /** After a `submit()` or `validate()` that rejected `FieldError[]` (not change / blur runs): its errors. */
  subscribeValidateFailed(listener: (errors: readonly FieldError[]) => void): () => void {
    return this.notifier.subscribeValidateFailed(listener)
  }

  /** Notified after every flush. Used when a selector read nothing. */
  subscribeDebug(listener: () => void): () => void {
    return this.notifier.subscribeDebug(listener)
  }

  /** Notified when one tracked `$` key changes. `dep` is the key `trackSelector` returned. */
  subscribeDep(dep: string, listener: () => void): () => void {
    return this.notifier.subscribeDep(dep, listener)
  }

  /** Snapshot for {@link FormEngine.subscribePath}. */
  getPathVersion(path: string): number { return this.notifier.getPathVersion(path) }

  /** Snapshot for {@link FormEngine.subscribeStructure}. */
  getStructureVersion(path: string): number { return this.notifier.getStructureVersion(path) }

  /** Snapshot for {@link FormEngine.subscribeDebug}. */
  getDebugVersion(): number { return this.notifier.getDebugVersion() }

  /** Snapshot for {@link FormEngine.subscribeDep}. */
  getDepVersion(dep: string): number { return this.notifier.getDepVersion(dep) }

  /** Run `selector` and return the `$` keys it read, without subscribing. */
  trackSelector<S>(selector: (d: Draft<T>) => S): { value: S; deps: string[] } {
    const tracked = this.trackOnly(() => selector(this.draft))
    return { value: tracked.value, deps: [...tracked.deps] }
  }

  handle(path: string): Draft<any> {
    return createHandle(this, path)
  }

  readPath(handle: unknown): string | undefined {
    return handlePath(handle)
  }

  childrenKey(path: string): string {
    return this.trees.config(path).childrenKey
  }

  noteTree(path: string, childrenKey: string): void {
    this.trees.note(path, childrenKey)
  }

  dirtyRowSet(path: string): Set<number> | 'all' | undefined {
    return this.scheduler.dirtyRows.get(path)
  }

  takeDirtyRows(path: string): Set<number> | 'all' | undefined {
    const value = this.scheduler.dirtyRows.get(path)
    this.scheduler.dirtyRows.delete(path)
    return value
  }

  /** Dirty row indexes under `root` (the array and nested arrays) plus tree positions at `root`. Cleared on flush settle. */
  takeEachDirty(root: string): EachDirty {
    const rows = new Map<string, Set<number> | 'all'>()
    for (const [path, dirty] of this.scheduler.dirtyRows) {
      if (path === root || path.startsWith(`${root}.`)) {
        rows.set(path, dirty)
        this.scheduler.consumedDirtyRows.add(path)
      }
    }
    const pos = this.scheduler.dirtyPos.get(root)
    if (pos !== undefined) this.scheduler.consumedDirtyPos.add(root)
    return { rows, pos }
  }

  holdEach(id: string, rec: EachRec): void {
    this.scheduler.eachRecs.set(id, rec)
  }

  nextId(prefix: string, site?: string): string {
    return this.scheduler.nextId(prefix, site)
  }

  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> } {
    return this.scheduler.trackOnly(fn)
  }

  runWith<S>(opts: { id: string; deps: boolean; writes: boolean; pos?: Pos; nodePath?: string }, fn: () => S) {
    return this.scheduler.runWith(opts, fn)
  }

  applyWrites(id: string, writes: WriteOp[]): void {
    this.scheduler.applyWrites(id, writes)
  }

  registerReaction(id: string, run: () => void, deps: Set<string>): void {
    this.scheduler.register(id, run, deps)
  }

  registerWatch(id: string, run: () => void, deps: Set<string>): void {
    this.scheduler.register(id, run, deps)
  }

  queue(id: string): void {
    this.scheduler.queue(id)
  }

  setDeps(id: string, deps: Set<string>): void {
    this.scheduler.setDeps(id, deps)
  }

  dropDeps(id: string): void {
    this.scheduler.dropDeps(id)
  }

  // —— draft host ——

  draftScope() { return this.scheduler.reactionScope() }
  readState(path: string, key: string): unknown {
    const { store, scheduler, trees } = this
    if (key === '$path') return path
    if (key === '$pos') return trees.readPos(path)
    if (key === '$find') {
      return (pred: (node: any, pos: Pos) => boolean) => {
        scheduler.track(path, 'value')
        const childrenKey = this.childrenKey(trees.root(path) ?? path)
        const pos = findPos(getAt(store.values, path), pred, childrenKey)
        return pos ? this.handle(pathOf(path, pos, childrenKey)) : undefined
      }
    }
    if (key === '$pathOf') {
      return (pos: Pos) => pathOf(path, pos, this.childrenKey(trees.root(path) ?? path))
    }
    if (process.env.NODE_ENV !== 'production') assertNotWritten(scheduler, path, key)
    if (key === '$value') {
      scheduler.track(path, 'value')
      return this.drafts.readValue(path)
    }
    const uiKey = uiKeyOf(key)
    if (uiKey) return this.drafts.readUiKey(path, uiKey)
    if (key === '$errors') return this.validator.aggregate(path, 'errors')
    if (key === '$warnings') return this.validator.aggregate(path, 'warnings')
    const field = store.ensure(path)
    if (key === '$visible' || key === '$disabled' || key === '$readOnly' || key === '$omit') {
      const name = key.slice(1) as 'visible' | 'disabled' | 'readOnly' | 'omit'
      // Ancestors too: a parent flag change must re-run readers of the child's effective value.
      scheduler.trackChain(path, name)
      return store.effective(path, name)
    }
    if (key === '$required') {
      scheduler.track(path, 'required')
      return field.required
    }
    if (key === '$enum') {
      scheduler.track(path, 'enum')
      return this.drafts.readEnum(path, field.enumOptions ?? [])
    }
    if (key === '$rules') {
      scheduler.track(path, 'rules')
      return this.drafts.readRules(path, field.rules)
    }
    if (key === '$validating') {
      scheduler.track(path, 'validating')
      return field.validating
    }
    if (key === '$touched') {
      scheduler.track(path, 'touched')
      return field.touched
    }
    if (key === '$dirty') {
      // Derived: depends on the value, and on `:dirty`, marked when the baseline moves.
      scheduler.track(path, 'value')
      scheduler.track(path, 'dirty')
      return path ? this.baseline.fieldDirty(path) : this.baseline.formDirty()
    }
    if (key === '$edited') {
      scheduler.track(path, path ? 'edited' : 'meta')
      return path ? field.edited : store.edited
    }
    if (key === '$canSubmit' || key === '$submitting' || key === '$submitCount') {
      scheduler.track('', 'meta')
      if (key === '$canSubmit') return this.canSubmit
      if (key === '$submitting') return store.submitting
      return store.submitCount
    }
    return undefined
  }

  writeState(path: string, key: string, value: unknown): void {
    this.writer.writeState(path, key, value)
  }

  peekValue(path: string): unknown {
    return getAt(this.store.values, path)
  }

  readUi(path: string, name: string, key: string): unknown { return this.uiNodes.read(path, name, key) }
  writeUi(path: string, name: string, key: string, value: unknown): void { this.uiNodes.write(path, name, key, value) }

  // —— field registration (React / tests) ——

  /**
   * Declare a field. It joins submit validation even when no `<Field>` is mounted.
   * A path with a `.*` segment (`rows.*.name`) is an item template for every current index,
   * including virtualized rows. `$rules` wins over this declaration. JSX `rules` do not erase it on unmount.
   */
  registerField(path: string, spec: RegisterSpec = {}): void {
    this.declarations.registerField(path, spec)
  }

  /** Commit the field's JSX validation and flags. The model follows its row across a move. */
  mountJsxField(path: string, spec: FieldSpec = {}): unknown {
    return this.commitJsx(path, () => this.declarations.mountJsxField(path, spec))
  }

  releaseJsxField(path: string, lease?: unknown): void {
    this.commitJsx(path, () => this.declarations.releaseJsxField(path, lease))
  }

  releaseJsxFlags(path: string, lease?: unknown): void {
    this.commitJsx(path, () => this.declarations.releaseJsxFlags(path, lease))
  }

  private commitJsx<R>(path: string, update: () => R): R {
    const before = this.getPathVersion(path)
    const required = !!this.store.get(path)?.required
    const result = update()
    if (this.getPathVersion(path) !== before) {
      if (required !== !!this.store.get(path)?.required) this.scheduler.markDirty(path + ':required')
      this.scheduler.enqueueFromDirty()
      this.scheduler.flush()
    }
    return result
  }

  /** Commit JSX enum options and start any async load. */
  applyJsxEnum(path: string, input: unknown): unknown {
    return this.writer.applyJsxEnum(path, input)
  }

  /** Drop the JSX `enum` on `path` and restore the declared / template enum. A lease from another row's model is ignored. */
  releaseJsxEnum(path: string, lease?: unknown): void {
    this.writer.releaseJsxEnum(path, lease)
  }

  /**
   * Input props for `path`: value, errors, the four flags, touched, dirty, validating, and UI state.
   * `errors` is empty when the field does not validate. `ui` is the render-time JSX layer (`<Field title>`).
   */
  binding(path: string, ui?: FieldUiSpec, jsx?: Pick<FieldSpec, 'visible' | 'disabled' | 'readOnly' | 'omit' | 'required' | 'enum'>) {
    const store = this.store
    const field = store.get(path)
    const visible = effectiveFlag(store, path, 'visible', jsx?.visible)
    const disabled = effectiveFlag(store, path, 'disabled', jsx?.disabled)
    const readOnly = effectiveFlag(store, path, 'readOnly', jsx?.readOnly)
    const active = visible && !disabled && !readOnly
    return {
      path,
      value: process.env.NODE_ENV !== 'production' ? readonlyValue(getAt(store.values, path), path) : getAt(store.values, path),
      onChange: (value: unknown) => this.writer.commitExternal(path, value),
      onBlur: () => this.blur(path),
      errors: field && active ? shownErrors(field) : [],
      warnings: field && active ? field.warnings.slice() : [],
      visible,
      disabled,
      readOnly,
      omit: effectiveFlag(store, path, 'omit', jsx?.omit),
      required: (!field?.requiredFromEffect ? jsx?.required : undefined) ?? !!field?.required,
      touched: field?.touched ?? false,
      dirty: path ? this.baseline.fieldDirty(path) : this.baseline.formDirty(),
      edited: path ? (field?.edited ?? false) : store.edited,
      validating: field?.validating ?? false,
      options: (!field?.enumFromEffect ? asOptions(jsx?.enum) : undefined) ?? field?.enumOptions ?? [],
      loading: field?.enumLoading ?? false,
      id: pathDomId(path),
      ...this.fieldUi.view(path, ui),
    }
  }

  /** Mark the field touched. Validates when the trigger list includes `onBlur`. */
  blur(path: string): void { this.writer.blur(path) }

  /**
   * A named UI on `path`: `'field'` (`<Field ui>`) = the field binding with this instance's flags / UI
   * state and id `<path>--<ui>` (React then adds the `<Form>` prefix: `id` prop or `useId()`); `'node'` (`<UI>`) = only UI state. Subscribe to `uiId(path, name)` and `path`.
   */
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: 'field'): ReturnType<FormEngine['binding']> & { ui: string }
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: 'node'): UiNodeView & { id: string; ui: string }
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: UiKind): any {
    const view = this.uiNodes.view(path, name, jsx, kind)
    const id = uiDomId(path, name)
    if (kind === 'node') return { ...view, id, ui: name }
    return { ...this.binding(path), ...view, id, ui: name }
  }

  /** @internal A mounted `<Field ui>` / `<UI>`; returns the release. */
  claimUi(path: string, name: string, kind: UiKind): () => void { return this.uiNodes.claim(path, name, kind) }

  /** @internal React has mounted: writes to UI names that never mount warn from now on (once each). */
  markUiReady(): void { this.uiNodes.markReady() }

  /** @internal Options for a shadow/draft form rooted at `path` (or `list.*`). */
  forkOptions(path: string): FormOptions<any> { return forkEngineOptions({ store: this.store, declarations: this.declarations, trees: this.trees, options: this.options }, path) }
}
