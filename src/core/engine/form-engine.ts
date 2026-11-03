import { Declarations, type RegisterSpec } from '../declarations/declarations'
import { createHandle, createUiHandle, handlePath } from '../draft/handle'
import type { DraftHost } from '../draft/host'
import { readonlyValue } from '../draft/readonly'
import type { EachRec } from '../effects/scheduler'
import { Scheduler } from '../effects/scheduler'
import { clone } from '../shared/equal'
import { deleteAt, getAt, setAt } from '../shared/path'
import { shownErrors } from '../state/field-model'
import { FieldStore } from '../state/field-store'
import { Notifier } from '../state/notifier'
import { ArrayOps } from '../structure/arrays'
import { findPos, pathOf, type Pos } from '../shared/tree-ops'
import { TreeOps, type TreeConfig } from '../structure/trees'
import { formatMessage, type FormMessageKey, type MessageArgs } from '../validation/messages'
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
  FormOptions,
  MoveResult,
  PathValue,
  SubmitResult,
  WriteOp,
} from '../types'
import { Validator } from '../validation/validator'
import { Baseline, errorEntries } from './baseline'
import { FieldUi, uiKeyOf } from './field-ui'
import { pathDomId, uiDomId } from './dom-id'
import { UiNodes, type UiJsx, type UiKind, type UiNodeView } from './ui-nodes'
import { StateWriter } from './writes'

/**
 * Form engine. No React and no UI.
 *
 * A facade over the engine parts (see `design/ARCHITECTURE.md`): `FieldStore` (state), `Notifier` (versions),
 * `Scheduler` (reaction / watch), `Validator`, `Declarations`, `ArrayOps` / `TreeOps`, `StateWriter`.
 *
 * Declared fields (`fields`, `registerField`, `$rules` / `$required`, `rows.*.x`) validate without a mounted `<Field>`;
 * JSX `rules` / `required` apply only while mounted. `hidden` validates and submits; `none` (or an ancestor's) does neither.
 */
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
  private readonly baseline: Baseline

  constructor(options: FormOptions<T> = {}) {
    this.options = options
    const store = (this.store = new FieldStore<T>((options.initialValues ?? {}) as T))
    const notifier = (this.notifier = new Notifier())
    const scheduler = (this.scheduler = new Scheduler(notifier, !!options.devtools))
    const trees = (this.trees = new TreeOps(store, scheduler, options.messages))
    const validator = (this.validator = new Validator({ store, notifier, scheduler, options, readPos: (path) => trees.readPos(path) }))
    const declarations = (this.declarations = new Declarations(store, notifier, validator))
    validator.prepare = () => declarations.applyItemTemplates()
    this.arrays = new ArrayOps(store, scheduler, declarations)
    this.writer = new StateWriter({
      store, notifier, scheduler, validator, declarations, options,
      carryRowIdentity: (path, before, after) => this.arrays.carryIdentity(path, before, after),
    })
    this.fieldUi = this.writer.attachUi(new FieldUi(store, notifier, scheduler, (path, key, value) => this.writeState(path, key, value)))
    this.uiNodes = new UiNodes(store, notifier, scheduler, this.writer, this.fieldUi)
    this.draft = createHandle(this, '') as Draft<T>
    this.baseline = new Baseline({ store, notifier, scheduler, validator, declarations })
    scheduler.onSettle = () => this.baseline.sync()
    for (const [path, spec] of Object.entries(options.trees ?? {})) {
      this.registerTree(path, spec)
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

  /** Current values. Write with `setValue`, `batch`, `reset(values)`, or the array and tree methods. */
  get values(): T { return this.store.values }

  /** Baseline `reset()` restores and `dirty` compares against. Cloned on create; replaced by `reset(values)` / `setInitialValues`. */
  get initial(): T { return this.store.initial }

  /** True for the duration of {@link FormEngine.submit}, including the validation it waits for. */
  get submitting(): boolean { return this.store.submitting }

  /** True while a validate pass is running, including the async rules it waits for. */
  get validating(): boolean { return this.store.validating }

  /** Values differ from {@link FormEngine.initial} (deep; reverting clears it). `virtual` / computed fields are ignored. */
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

  /** Read one typed path. Object/array results are live references; use the write APIs instead of mutating them in place. */
  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P> {
    return getAt(this.store.values, String(path)) as PathValue<T, P>
  }

  /** Write one path from outside a reaction. Marks the field dirty and runs `onChange` validation when configured. */
  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void {
    this.writer.commitExternal(String(path), value)
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

  /** Values with `virtual` and display `none` removed. `hidden` is kept. Typed `TSubmit` (default `T`, see `SubmitValues`). */
  getSubmitValues(): TSubmit {
    let out = clone(this.store.values)
    const omit = [...this.store.fields.entries()]
      .filter(([, field]) => field.virtual || this.store.effectiveDisplay(field.path) === 'none')
      .map(([path]) => path)
      .sort((a, b) => b.length - a.length)
    for (const path of omit) out = deleteAt(out, path)
    return out as unknown as TSubmit
  }

  // —— submit / reset / validate ——

  /**
   * Bump `submitCount`, wait for in-flight async rules, validate, then call `onValid` with {@link FormEngine.getSubmitValues}.
   * `virtual` and display `none` are omitted. `hidden` is kept. A computed field is omitted only when
   * it was declared `virtual: true`.
   *
   * Only values its own pass validated are submitted (#6, #41; see `Validator.submitVerdict`). Never rejects (#38).
   */
  async submit(onValid?: (values: TSubmit) => void | Promise<void>): Promise<SubmitResult<TSubmit>> {
    const { store, scheduler, notifier, validator } = this
    store.submitCount += 1
    this.pendingSubmits += 1
    store.submitting = true
    scheduler.bumpMeta()
    notifier.emit()
    try {
      const failed = await validator.submitVerdict()
      if (failed) return failed
      const values = this.getSubmitValues()
      if (onValid) await onValid(values)
      return { ok: true, values }
    } catch (error) {
      return { ok: false, reason: 'error', errors: [], error }
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

  /** One field's external messages. Same lifetime as {@link FormEngine.setErrors}. `''` is the form root. `null` clears the path's external messages. */
  setFieldError(path: FieldPath<T> | '', messages: string | string[] | null): void {
    this.setErrors({ [path]: messages } as never)
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
   * Validate `path` and its descendants, or the whole form.
   * Declared fields, `registerField`, `$rules`, and item templates are included even if no `<Field>` is mounted.
   * JSX rules count only while mounted. Display `none` skips the field. `hidden` does not.
   * The form-level schema always runs. A scoped call replaces schema issues under `path` only.
   * A newer `validate` supersedes an in-flight form schema or resolver; the older pass does not write errors.
   * Pass an array to validate several paths (and their descendants) in one pass: `validate(['name', 'address'])`.
   */
  validate(path?: FieldPath<T> | readonly FieldPath<T>[]): Promise<FieldError[]> {
    const run = this.validator.validate(path as string | readonly string[] | undefined)
    return run.then((errors) => (this.notifier.validateFailed(errors), errors))
  }

  /** Untyped handle for an exact path. Prefer {@link FormEngine.getValue} and {@link FormEngine.batch}. */
  query(path: string): any {
    return this.handle(path)
  }

  // —— structure ——

  /** Move an array row. `to` is the final index. Field models follow the row id. */
  moveArray<P extends ArrayPath<T>>(path: P, from: number, to: number): void {
    this.arrays.move(path, from, to)
  }

  /** Exchange two indexes. Field models follow the row ids. */
  swapArray<P extends ArrayPath<T>>(path: P, indexA: number, indexB: number): void {
    this.arrays.swap(path, indexA, indexB)
  }

  /** Replace the row at `index`. The previous row's field model is dropped. */
  replaceArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void {
    this.arrays.replace(path, index, row)
  }

  /** Insert `row` at `index`. Later field models follow row id. Item templates apply to the new index. */
  insertArray<P extends ArrayPath<T>>(path: P, index: number, row: ArrayItemOf<T, P & string>): void {
    this.arrays.insert(path, index, row)
  }

  /** Remove the row at `index`. Its field model is dropped. */
  removeArray<P extends ArrayPath<T>>(path: P, index: number): void {
    this.arrays.remove(path, index)
  }

  /** Append `row`. Item templates (`rows.*.name`) apply to the new index. */
  pushArray<P extends ArrayPath<T>>(path: P, row: ArrayItemOf<T, P & string>): void {
    this.arrays.push(path, row)
  }

  /**
   * Move a tree node to its final `pos`.
   * Refuses a move into the node's own descendant. Field models follow `rowKey`.
   */
  moveTree(path: string, from: Pos, to: Pos): MoveResult {
    return this.trees.move(path, from, to)
  }

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

  /** After a `submit()` with `reason: 'invalid'` or a `validate()` that found errors (not change / blur runs): its errors. */
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

  takeDirtyPos(path: string): Set<string> | 'all' | undefined {
    const value = this.scheduler.dirtyPos.get(path)
    this.scheduler.dirtyPos.delete(path)
    return value
  }

  holdEach(id: string, rec: EachRec): void {
    this.scheduler.eachRecs.set(id, rec)
  }

  nextId(prefix: string): string {
    return this.scheduler.nextId(prefix)
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
      return store.effectiveDisplay(path) === 'visible'
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
}

/**
 * Create a form engine. No React.
 *
 * `T` is inferred from `initialValues`. `getValue`, `setValue`, and `batch` then use that type.
 * `fields` declares models that validate even when no `<Field>` is mounted.
 * A key such as `rows.*.name` is an item template copied onto every current index.
 *
 * @example
 * const form = createForm({
 *   initialValues: { code: '', rows: [{ name: '' }] },
 *   fields: { code: { required: true }, 'rows.*.name': { required: true } },
 * })
 */
export function createForm<T, TSubmit = T>(options: FormOptions<T> = {}): FormEngine<T, TSubmit> {
  return new FormEngine<T, TSubmit>(options)
}
