import { Declarations, type RegisterSpec } from '../declarations/declarations'
import { createHandle, createUiHandle, handlePath } from '../draft/handle'
import type { DraftHost } from '../draft/host'
import { readonlyValue } from '../draft/readonly'
import type { EachDirty, EachRec } from '../effects/scheduler'
import { Scheduler } from '../effects/scheduler'
import { clone } from '../shared/equal'
import { deleteAt, getAt, normalizePath, setAt } from '../shared/path'
import { shownErrors } from '../state/field-model'
import { FieldStore } from '../state/field-store'
import { Notifier } from '../state/notifier'
import { ArrayOps } from '../structure/arrays'
import { findPos, pathOf, type Pos } from '../shared/tree-ops'
import { TreeOps, type TreeConfig } from '../structure/trees'
import { formatMessage, type FormMessageKey, type MessageArgs } from '../validation/messages'
import { SubmitSupersededError } from '../errors'
import type {
  FieldUiSpec,
  ArrayItemOf,
  ArrayPath,
  Draft,
  EffectsRuntime,
  FieldError,
  FieldPath,
  FieldSpec,
  FormInstance,
  MoveResult,
  PathValue,
  ValuePath,
  SubmitResolved,
  WriteOp,
} from '../types'
import type { FormOptions } from '../types-effects'
import { Validator } from '../validation/validator'
import { Baseline, errorEntries } from './baseline'
import { FieldUi, uiKeyOf } from './field-ui'
import { forkEngineOptions } from './fork'
import { pathDomId, uiDomId } from './dom-id'
import { UiNodes, type UiJsx, type UiKind, type UiNodeView } from './ui-nodes'
import { StateWriter } from './writes'

/** Form engine. No React and no UI. Parts: see `design/ARCHITECTURE.md`. */
export class FormEngine<T = any, TSubmit = T> implements FormInstance<T, TSubmit>, DraftHost, EffectsRuntime<T> {
  /** Root draft. Prefer {@link FormEngine.batch} so writes flush once. */
  readonly draft: Draft<T>
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
  private pendingSubmits = 0
  /** Bumped at the start of each `submit`. An older call rejects once a newer one has started. */
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
    })
    this.fieldUi = this.writer.attachUi(new FieldUi(store, notifier, scheduler, (path, key, value) => this.writeState(path, key, value)))
    this.uiNodes = new UiNodes(store, notifier, scheduler, this.writer, this.fieldUi)
    this.draft = createHandle(this, '') as Draft<T>
    this.baseline = new Baseline({ store, notifier, scheduler, validator, declarations })
    scheduler.onSettle = () => this.baseline.sync()
    for (const [path, spec] of Object.entries(options.trees ?? {}) as [string, { childrenKey?: string; rowKey?: string } | undefined][]) {
      if (spec) this.registerTree(path, spec)
    }
    for (const [path, spec] of Object.entries(options.fields ?? {}) as [string, FieldSpec | undefined][]) {
      if (spec) this.registerField(path, spec)
    }
    if (options.pattern) this.writeState('', '$pattern', options.pattern)
    for (const effect of options.effects ?? []) effect.install(this)
    scheduler.flush()
    declarations.applyItemTemplates()
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }

  // —— form state (read-only, #36: writes go through setValue / batch / reset / submit so subscribers hear them) ——

  /** Current values. Write with `setValue`, `batch`, or `reset(values)`. Array and tree structure ops stay on this engine for handles. */
  get values(): T { return this.store.values }

  /** Baseline `reset()` restores and `dirty` compares against. Cloned on create; replaced by `reset(values)` / `setInitialValues`. */
  get initial(): T { return this.store.initial }

  /** True for the duration of {@link FormEngine.submit}, including the validation it waits for. */
  get submitting(): boolean { return this.store.submitting }

  /** True while a validate pass is running, including the async rules it waits for. */
  get validating(): boolean { return this.store.validating }

  /** Values differ from {@link FormEngine.initial} (deep; reverting clears it). `display: 'virtual'` / computed fields are ignored. `none` counts. */
  get dirty(): boolean { return this.baseline.formDirty() }

  /** Sticky: a user edit (`setValue`, `binding().onChange`) happened since `reset`. A reaction write does not count. */
  get edited(): boolean { return this.store.edited }

  /** Incremented once per {@link FormEngine.submit}, including calls that fail validation. */
  get submitCount(): number { return this.store.submitCount }

  /** When true, each reaction pass is traced. */
  get devtools(): boolean {
    return this.scheduler.devtools
  }
  set devtools(on: boolean) {
    this.scheduler.devtools = on
  }

  /** Messages for every field whose effective display is not `none`. */
  get errors(): FieldError[] {
    return this.validator.errors()
  }

  /**
   * False during submit/validation, or when a field that is not display `none` has errors.
   * Fields that have not been validated yet do not block.
   */
  get canSubmit(): boolean {
    const store = this.store
    if (store.submitting || store.validating) return false
    for (const field of store.fields.values()) {
      if (field.validating) return false
      if (store.effectiveDisplay(field.path) === 'none') continue
      if (shownErrors(field).length) return false
    }
    return true
  }

  // —— values ——

  /** Read one typed path (`a.b.0` or `a.b[0]`). Object/array results are live references; use the write APIs instead of mutating them in place. */
  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P>
  getValue<P extends string>(path: ValuePath<T, P>): PathValue<T, P>
  getValue(path: string): unknown {
    return getAt(this.store.values, String(path))
  }

  /** Write one path from outside a reaction (`a.b.0` or `a.b[0]`). Marks the field dirty and runs `onChange` validation when configured. */
  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void
  setValue<P extends string>(path: ValuePath<T, P>, value: PathValue<T, P>): void
  setValue(path: string, value: unknown): void {
    this.writer.commitExternal(normalizePath(String(path)), value)
  }

  /** One draft, one reaction pass, one notification. */
  batch(fn: (d: Draft<T>) => void): void {
    const scheduler = this.scheduler
    scheduler.batchDepth++
    try {
      fn(this.draft)
    } finally {
      scheduler.batchDepth--
      if (scheduler.batchDepth === 0) {
        const ops = scheduler.batchOps.splice(0)
        for (const op of ops) op.apply()
        scheduler.enqueueFromDirty()
        scheduler.flush()
      }
    }
  }

  /**
   * Values with the submit switch off removed (`virtual`, `none`, and everything under them).
   * `hidden` is kept. A node that reads as `hidden` because a hidden ancestor outranks its own `virtual`
   * is still omitted. Typed `TSubmit` (default `T`, see `SubmitValues`).
   */
  getSubmitValues(): TSubmit {
    let out = clone(this.store.values)
    const omit = [...this.store.fields.keys()]
      .filter((path) => path && !this.store.displayFlags(path).submit)
      .sort((a, b) => b.length - a.length)
    for (const path of omit) out = deleteAt(out, path)
    return out as unknown as TSubmit
  }

  // —— submit / reset / validate ——

  /**
   * Validate, then call `onValid` with {@link FormEngine.getSubmitValues}.
   * Resolves the submit values, or `onValid`'s return when that is not `undefined`.
   * Rejects `FieldError[]` on validation failure. `onValid` and a form-level `validate` reject as-is.
   * A later `submit`, or values that never settle, reject `SubmitSupersededError` before `onValid`.
   */
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
      if (serial !== this.submitSerial || errors === null) {
        throw new SubmitSupersededError(this.message('superseded', { path: '', value: store.values }))
      }
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

  /**
   * Validate `path` and its descendants, or the whole form. An array validates those paths in one pass.
   * Resolves when the scope is clean. Rejects `FieldError[]` when it is not. Display `none` is skipped; `hidden` is not.
   */
  async validate(path?: FieldPath<T> | readonly FieldPath<T>[]): Promise<void> {
    const errors = await this.validator.validate(path as string | readonly string[] | undefined)
    if (errors.length) {
      this.notifier.validateFailed(errors)
      throw errors
    }
  }

  /** Untyped handle for an exact path. Prefer {@link FormEngine.getValue} and {@link FormEngine.batch}. */
  query(path: string): any {
    return this.handle(path)
  }

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

  // —— effects runtime ——

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

  /** Dirty row indexes under `root` (the array and nested arrays) plus tree positions at `root`. */
  takeEachDirty(root: string): EachDirty {
    const rows = new Map<string, Set<number> | 'all'>()
    for (const path of [...this.scheduler.dirtyRows.keys()]) {
      if (path === root || path.startsWith(`${root}.`)) {
        rows.set(path, this.scheduler.dirtyRows.get(path)!)
        this.scheduler.dirtyRows.delete(path)
      }
    }
    const pos = this.scheduler.dirtyPos.get(root)
    if (pos !== undefined) this.scheduler.dirtyPos.delete(root)
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
    if (key === '$ui') return (name: string) => createUiHandle(this, path, name)
    if (process.env.NODE_ENV !== 'production') scheduler.assertNotWritten(path, key)
    if (key === '$value') {
      scheduler.track(path, 'value')
      const value = getAt(store.values, path)
      // Development: reaction / watch / `batch` reads are read-only views, so `$value.y = 1` / `.push()` throw (#35).
      const guard = process.env.NODE_ENV !== 'production' && (scheduler.current()?.recordWrites || scheduler.batchDepth > 0)
      return (guard ? readonlyValue(value, path) : value) as never
    }
    const uiKey = uiKeyOf(key)
    if (uiKey) return this.fieldUi.read(path, uiKey)
    if (key === '$errors') return this.validator.aggregate(path, 'errors')
    if (key === '$warnings') return this.validator.aggregate(path, 'warnings')
    const field = store.ensure(path)
    if (key === '$visible') {
      scheduler.trackChain(path, 'display')
      // True whenever the field renders: `visible` or `virtual`, and no ancestor `hidden` / `none`.
      return store.displayFlags(path).render
    }
    if (key === '$hidden') {
      scheduler.trackChain(path, 'display')
      return store.effectiveDisplay(path) === 'hidden'
    }
    if (key === '$display') {
      scheduler.trackChain(path, 'display')
      return store.effectiveDisplay(path)
    }
    if (key === '$pattern') {
      scheduler.trackChain(path, 'pattern')
      return store.effectivePattern(path)
    }
    if (key === '$disabled') {
      scheduler.trackChain(path, 'pattern')
      return store.effectivePattern(path) === 'disabled'
    }
    if (key === '$required') {
      scheduler.track(path, 'required')
      return field.required
    }
    if (key === '$enum') {
      scheduler.track(path, 'enum')
      return field.enumOptions ?? []
    }
    if (key === '$rules') {
      scheduler.track(path, 'rules')
      return field.rules
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

  /**
   * Apply JSX `rules` and `required` while `<Field>` is mounted.
   * Does not replace `$rules`. Pair with {@link releaseJsxField} on unmount so a declaration or item template is restored.
   * Returns a lease to pass back to `releaseJsxField`.
   */
  mountJsxField(path: string, spec: FieldSpec = {}): unknown {
    return this.declarations.mountJsxField(path, spec)
  }

  /**
   * Drop JSX `rules` / `required` for `path`.
   * Restores a declaration or item template, recomputes built-in errors immediately, and drops an unresolved validator.
   * Custom validators and schemas run once through the queued validation pass.
   * Leaves `$rules` and `$required` from a reaction in place.
   * With the `lease` from `mountJsxField`, does nothing once a row or tree move has put another field at `path`:
   * the leased field moved with its row and its component re-mounts it at the new path.
   */
  releaseJsxField(path: string, lease?: unknown): void {
    this.declarations.releaseJsxField(path, lease)
  }

  /**
   * Apply a JSX `<Field enum>` (static list, primitives, or `EnumSource.with(params)`) to `path`.
   * Precedence: reaction `$enum` > JSX `enum` > `fields` / `registerField` > item template. `useField` calls it with
   * `'render'` during render (static lists only, so the first paint has options) and `'commit'` in an effect
   * (async loads, `enumPolicy` on updates, reactions reading `$enum`). Returns a lease for {@link releaseJsxEnum}.
   */
  applyJsxEnum(path: string, input: unknown, phase: 'render' | 'commit' = 'commit'): unknown {
    return this.writer.applyJsxEnum(path, input, phase)
  }

  /** Drop the JSX `enum` on `path` and restore the declared / template enum. A lease from another row's model is ignored. */
  releaseJsxEnum(path: string, lease?: unknown): void {
    this.writer.releaseJsxEnum(path, lease)
  }

  /**
   * Input props for `path`: value, errors, display, pattern, touched, dirty, validating, and UI state.
   * `errors` is empty when the effective display is `none`. `ui` is the render-time JSX layer (`<Field title>`).
   */
  binding(path: string, ui?: FieldUiSpec) {
    const store = this.store
    const field = store.get(path)
    const pattern = store.effectivePattern(path)
    const display = store.effectiveDisplay(path)
    return {
      path,
      value: getAt(store.values, path),
      onChange: (value: unknown) => this.writer.commitExternal(path, value),
      onBlur: () => this.blur(path),
      errors: field ? shownErrors(field) : [],
      warnings: field?.warnings.slice() ?? [],
      display,
      pattern,
      required: !!field?.required,
      disabled: pattern === 'disabled',
      readOnly: pattern === 'readOnly',
      touched: field?.touched ?? false,
      dirty: path ? this.baseline.fieldDirty(path) : this.baseline.formDirty(),
      edited: path ? (field?.edited ?? false) : store.edited,
      validating: field?.validating ?? false,
      options: field?.enumOptions ?? [],
      loading: field?.enumLoading ?? false,
      id: pathDomId(path),
      ...this.fieldUi.view(path, ui),
    }
  }

  /** Mark the field touched. Validates when the trigger list includes `onBlur`. */
  blur(path: string): void { this.writer.blur(path) }

  /**
   * A named UI on `path`: `'field'` (`<Field ui>`) = the field binding with this instance's display / pattern / UI
   * state and id `<path>--<ui>` (React then adds the `<Form>` prefix: `id` prop or `useId()`); `'node'` (`<UI>`) = only UI state. Subscribe to `uiId(path, name)` and `path`.
   */
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: 'field'): ReturnType<FormEngine['binding']> & { ui: string }
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: 'node'): UiNodeView & { id: string; ui: string }
  uiBinding(path: string, name: string, jsx: UiJsx | undefined, kind: UiKind): any {
    const view = this.uiNodes.view(path, name, jsx, kind)
    const id = uiDomId(path, name)
    if (kind === 'node') return { ...view, id, ui: name }
    return { ...this.binding(path), ...view, id, ui: name, disabled: view.pattern === 'disabled', readOnly: view.pattern === 'readOnly' }
  }

  /** @internal A mounted `<Field ui>` / `<UI>`; returns the release. */
  claimUi(path: string, name: string, kind: UiKind): () => void { return this.uiNodes.claim(path, name, kind) }

  /** @internal React has mounted: writes to UI names that never mount warn from now on (once each). */
  markUiReady(): void { this.uiNodes.markReady() }

  /** @internal Options for a shadow/draft form rooted at `path` (or `list.*`). */
  forkOptions(path: string): FormOptions<any> { return forkEngineOptions({ store: this.store, declarations: this.declarations, trees: this.trees, options: this.options }, path) }
}
