import { createHandle, createUiHandle, handlePath, isHandle } from './draft'
import { asOptions, isEnumBinding, type EnumOption } from './enum'
import { deepEqual, clone } from './equal'
import { ShikiConflictError, ShikiCycleError, ShikiUiError } from './errors'
import type { DraftHost } from './host'
import { deleteAt, getAt, joinPath, parentPath, setAt } from './path'
import {
  findPos,
  listPositions,
  locateIds,
  moveNode,
  pathOf,
  posKey,
  posOf,
  readRowId,
  scopeOf,
  type Pos,
} from './tree'
import {
  collectSchemaIssues,
  groupSchemaIssues,
  isStandardSchema,
  schemaIssuePath,
  type SchemaIssue,
} from './schema'
import type {
  CommitMode,
  Display,
  Draft,
  EffectDef,
  EffectsAPI,
  EffectsRuntime,
  FieldError,
  FieldPath,
  FieldSpec,
  PathValue,
  FormInstance,
  FormOptions,
  MoveResult,
  Pattern,
  ValidateTrigger,
  WriteOp,
} from './types'
import {
  fieldSchemaIssues,
  isEmpty,
  normalizeRules,
  optionIncludes,
  runRules,
  type Rule,
  type RulesInput,
  type ValidateCtx,
} from './validate'

interface FieldModel {
  path: string
  display?: Display
  hasDisplay: boolean
  displayFromEffect: boolean
  pattern?: Pattern
  hasPattern: boolean
  patternFromEffect: boolean
  required: boolean
  requiredFromEffect: boolean
  virtual: boolean
  virtualExplicit: boolean
  computed: boolean
  rules: Rule[]
  rulesFromEffect: boolean
  errors: string[]
  warnings: string[]
  touched: boolean
  dirty: boolean
  validating: boolean
  schemaErrors: string[]
  abort?: AbortController
  asyncDebounceMs?: number
  enumOptions?: EnumOption[]
  enumLoading: boolean
  enumFromEffect: boolean
  triggers?: ValidateTrigger[]
  asyncSeq: number
  enumSeq: number
}

interface Tracker {
  id: string
  recordDeps: boolean
  recordWrites: boolean
  deps: Set<string>
  writes: WriteOp[]
  pos?: Pos
  nodePath?: string
}

interface EachRec {
  kind: 'each' | 'walk' | 'watch-each'
  select: (d: Draft<any>) => unknown
  effect: Function
  arrayPath: string
  childrenKey: string
  instances: Set<string>
  first: boolean
}

interface UiState {
  display?: Display
  hasDisplay: boolean
  pattern?: Pattern
  hasPattern: boolean
}

const REACTION_PREFIX = /^(reaction|each|walk):/

/**
 * Form engine. Field models are created on `$` access, `registerField`, or `fields`.
 * No React and no UI.
 */
export class FormEngine<T = any> implements FormInstance<T>, DraftHost, EffectsRuntime<T> {
  values: T
  readonly initial: T
  submitting = false
  validating = false
  dirty = false
  submitCount = 0
  devtools: boolean
  readonly draft: Draft<T>
  readonly options: FormOptions<T>

  private fields = new Map<string, FieldModel>()
  private uis = new Map<string, UiState>()
  private uiMounts = new Set<string>()
  private runners = new Map<string, () => void>()
  private runs = new Map<string, number>()
  private depIndex = new Map<string, Set<string>>()
  private reactionDeps = new Map<string, Set<string>>()
  private writeOwners = new Map<string, string>()
  private queued = new Set<string>()
  private dirtyDeps = new Set<string>()
  private dirtyRows = new Map<string, Set<number> | 'all'>()
  private dirtyPos = new Map<string, Set<string> | 'all'>()
  private eachRecs = new Map<string, EachRec>()
  private pathListeners = new Map<string, Set<() => void>>()
  private structListeners = new Map<string, Set<() => void>>()
  private depListeners = new Map<string, Set<() => void>>()
  private debugListeners = new Set<() => void>()
  private pathVersion = new Map<string, number>()
  private structVersion = new Map<string, number>()
  private depVersion = new Map<string, number>()
  private pendingPaths = new Set<string>()
  private pendingStruct = new Set<string>()
  private debugVersion = 0
  private metaVersion = 0
  private pendingMeta = false
  private schemaByPath = new Map<string, string[]>()
  private inflight = new Set<Promise<unknown>>()
  private validateTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private pendingDepNotify = new Set<string>()
  private metaListeners = new Set<() => void>()
  private stack: Tracker[] = []
  private flushing = false
  private batchDepth = 0
  private batchOps: WriteOp[] = []
  private seq = 0
  private trace: string[] = []
  private trees = new Map<string, { childrenKey: string; rowKey: string; canMove?: (args: any) => string | null | undefined }>()
  private arrays = new Map<string, { rowKey?: string }>()
  private ident = new WeakMap<object, string>()
  private identN = 0
  private enumTimers = new Map<string, ReturnType<typeof setTimeout>>()
  private enumAbort = new Map<string, AbortController>()

  constructor(options: FormOptions<T> = {}) {
    this.options = options
    this.devtools = !!options.devtools
    this.initial = clone((options.initialValues ?? {}) as T)
    this.values = clone(this.initial)
    this.draft = createHandle(this, '') as Draft<T>
    for (const [path, spec] of Object.entries(options.trees ?? {})) {
      this.registerTree(path, spec)
    }
    for (const [path, spec] of Object.entries(options.fields ?? {}) as [string, FieldSpec | undefined][]) {
      if (spec) this.registerField(path, spec)
    }
    for (const effect of options.effects ?? []) effect.install(this)
    this.flush()
  }

  get errors(): FieldError[] {
    const out: FieldError[] = []
    for (const [path, field] of this.fields) {
      if (this.effectiveDisplay(path) === 'none') continue
      const messages = shownErrors(field)
      if (messages.length) out.push({ path, messages })
    }
    return out
  }

  get isSubmitting(): boolean {
    return this.submitting
  }

  /**
   * False during submit/validation, or when a field that is not display `none` has errors.
   * Fields that have not been validated yet do not block.
   */
  get canSubmit(): boolean {
    if (this.submitting || this.validating) return false
    for (const field of this.fields.values()) {
      if (field.validating) return false
      if (this.effectiveDisplay(field.path) === 'none') continue
      if (shownErrors(field).length) return false
    }
    return true
  }

  getValue<P extends FieldPath<T>>(path: P): PathValue<T, P> {
    return getAt(this.values, String(path)) as PathValue<T, P>
  }

  setValue<P extends FieldPath<T>>(path: P, value: PathValue<T, P>): void {
    this.commitExternal(String(path), value)
  }

  batch(fn: (d: Draft<T>) => void): void {
    this.batchDepth++
    try {
      fn(this.draft)
    } finally {
      this.batchDepth--
      if (this.batchDepth === 0) {
        const ops = this.batchOps.splice(0)
        for (const op of ops) op.apply()
        this.enqueueFromDirty()
        this.flush()
      }
    }
  }

  async submit(onValid?: (values: T) => void | Promise<void>) {
    this.submitCount += 1
    this.submitting = true
    this.bumpMeta()
    this.emit()
    try {
      await this.waitAsync()
      const errors = await this.validate()
      if (errors.length) return { ok: false as const, errors }
      const values = this.getSubmitValues()
      if (onValid) await onValid(values)
      return { ok: true as const, values }
    } finally {
      this.submitting = false
      this.bumpMeta()
      this.emit()
    }
  }

  reset(path?: FieldPath<T>): void {
    if (path) this.values = setAt(this.values, String(path), clone(getAt(this.initial, String(path))))
    else this.values = clone(this.initial)
    this.dirty = false
    for (const field of this.fields.values()) {
      if (path && field.path !== path && !field.path.startsWith(String(path) + '.')) continue
      field.errors = []
      field.schemaErrors = []
      field.warnings = []
      field.touched = false
      field.dirty = false
      field.validating = false
      field.abort?.abort()
      this.bumpPath(field.path)
    }
    if (!path) this.schemaByPath = new Map()
    else {
      for (const key of [...this.schemaByPath.keys()]) {
        if (key === path || key.startsWith(String(path) + '.')) this.schemaByPath.delete(key)
      }
    }
    this.bumpMeta()
    for (const rec of this.eachRecs.values()) rec.first = true
    for (const id of this.runners.keys()) {
      if (id.startsWith('watch')) continue
      this.queued.add(id)
    }
    this.flush()
  }

  async validate(path?: string): Promise<FieldError[]> {
    this.validating = true
    this.bumpMeta()
    this.emit()
    try {
      const targets = [...this.fields.keys()].filter((p) => !path || p === path || p.startsWith(path + '.'))
      const collected: SchemaIssue[] = []
      const preserve = new Set<string>()
      for (const target of targets) {
        const result = await this.validateOne(target)
        if (result.stale) preserve.add(target)
        else collected.push(...result.issues)
      }
      if (!path) {
        const validate = this.options.validate
        if (isStandardSchema(validate)) collected.push(...(await collectSchemaIssues(validate, this.values)))
        else if (typeof validate === 'function') collected.push(...recordToIssues(await validate(this.values)))
        if (this.options.resolver) collected.push(...recordToIssues(await this.options.resolver(this.values)))
      }
      this.commitSchemaIssues(path, collected, preserve)
      await this.waitAsync()
      return this.errors.filter((e) => !path || e.path === path || e.path.startsWith(path + '.'))
    } finally {
      this.validating = false
      this.bumpMeta()
      this.emit()
    }
  }

  getSubmitValues(): T {
    let out = clone(this.values)
    const omit = [...this.fields.entries()]
      .filter(([, field]) => field.virtual || this.effectiveDisplay(field.path) === 'none')
      .map(([path]) => path)
      .sort((a, b) => b.length - a.length)
    for (const path of omit) out = deleteAt(out, path)
    return out
  }

  query(path: string, opts?: { ui?: string }): any {
    if (opts?.ui) return createUiHandle(this, path, opts.ui)
    return this.handle(path)
  }

  moveArray(path: string, from: number, to: number): void {
    this.spliceArray(path, from, 1, to, 'move')
  }

  swapArray(path: string, indexA: number, indexB: number): void {
    const before = this.arrayOf(path)
    if (indexA === indexB || indexA < 0 || indexB < 0 || indexA >= before.length || indexB >= before.length) return
    const next = before.slice()
    const tmp = next[indexA]
    next[indexA] = next[indexB]
    next[indexB] = tmp
    this.commitArray(path, before, next, new Set([indexA, indexB]))
  }

  replaceArray(path: string, index: number, row: unknown): void {
    const before = this.arrayOf(path)
    if (index < 0 || index >= before.length) return
    const next = before.slice()
    next[index] = row
    this.commitArray(path, before, next, new Set([index]))
  }

  insertArray(path: string, index: number, row: unknown): void {
    const before = this.arrayOf(path)
    const at = Math.min(Math.max(index, 0), before.length)
    const next = before.slice()
    next.splice(at, 0, row)
    this.commitArray(path, before, next, new Set(Array.from({ length: next.length - at }, (_, i) => at + i)))
  }

  removeArray(path: string, index: number): void {
    const before = this.arrayOf(path)
    if (index < 0 || index >= before.length) return
    const next = before.slice()
    next.splice(index, 1)
    const dirty = new Set<number>()
    for (let i = index; i < next.length; i++) dirty.add(i)
    this.commitArray(path, before, next, dirty)
  }

  pushArray(path: string, row: unknown): void {
    const before = this.arrayOf(path)
    this.commitArray(path, before, [...before, row], new Set([before.length]))
  }

  moveTree(path: string, from: Pos, to: Pos): MoveResult {
    const cfg = this.treeCfg(path)
    const before = this.arrayOf(path)
    const oldIds = locateIds(before, path, cfg.childrenKey, cfg.rowKey)
    const result = moveNode(before, from, to, cfg.childrenKey, cfg.canMove)
    if (!result.ok || !result.tree) return { ok: false, reason: result.reason }
    const next = result.tree
    const newIds = locateIds(next, path, cfg.childrenKey, cfg.rowKey)
    this.reindexById(oldIds, newIds)
    this.values = setAt(this.values, path, next)
    const beforePos = new Map(listPositions(before, path, cfg.childrenKey, cfg.rowKey).map((n) => [posKey(n.pos), n.id]))
    const afterPos = new Map(listPositions(next, path, cfg.childrenKey, cfg.rowKey).map((n) => [posKey(n.pos), n.id]))
    const dirty = new Set<string>()
    for (const key of new Set([...beforePos.keys(), ...afterPos.keys()])) {
      if (beforePos.get(key) !== afterPos.get(key)) dirty.add(key)
    }
    this.dirtyPos.set(path, dirty)
    this.markStructure(path)
    this.enqueueFromDirty()
    this.flush()
    return { ok: true }
  }

  getDebugStats(): { runs: Record<string, number> } {
    return { runs: Object.fromEntries(this.runs) }
  }

  subscribePath(path: string, listener: () => void): () => void {
    return addListener(this.pathListeners, path, listener)
  }

  subscribeStructure(path: string, listener: () => void): () => void {
    return addListener(this.structListeners, path, listener)
  }

  subscribeMeta(listener: () => void): () => void {
    this.metaListeners.add(listener)
    return () => this.metaListeners.delete(listener)
  }

  getMetaVersion(): number {
    return this.metaVersion
  }

  subscribeDebug(listener: () => void): () => void {
    this.debugListeners.add(listener)
    return () => this.debugListeners.delete(listener)
  }

  subscribeDep(dep: string, listener: () => void): () => void {
    return addListener(this.depListeners, dep, listener)
  }

  getPathVersion(path: string): number {
    return this.pathVersion.get(path) ?? 0
  }

  getStructureVersion(path: string): number {
    return this.structVersion.get(path) ?? 0
  }

  getDebugVersion(): number {
    return this.debugVersion
  }

  getDepVersion(dep: string): number {
    return this.depVersion.get(dep) ?? 0
  }

  trackSelector<S>(selector: (d: Draft<T>) => S): { value: S; deps: string[] } {
    const tracked = this.trackOnly(selector as () => S)
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
    return this.treeCfg(path).childrenKey
  }

  noteTree(path: string, childrenKey: string): void {
    const prev = this.trees.get(path)
    this.trees.set(path, { childrenKey, rowKey: prev?.rowKey ?? 'id', canMove: prev?.canMove })
  }

  dirtyRowSet(path: string): Set<number> | 'all' | undefined {
    return this.dirtyRows.get(path)
  }

  takeDirtyRows(path: string): Set<number> | 'all' | undefined {
    const value = this.dirtyRows.get(path)
    this.dirtyRows.delete(path)
    return value
  }

  takeDirtyPos(path: string): Set<string> | 'all' | undefined {
    const value = this.dirtyPos.get(path)
    this.dirtyPos.delete(path)
    return value
  }

  nextId(prefix: string): string {
    this.seq += 1
    return `${prefix}:${this.seq}`
  }

  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> } {
    return this.runWith({ id: 'track', deps: true, writes: false }, fn)
  }

  runWith<S>(opts: { id: string; deps: boolean; writes: boolean; pos?: Pos; nodePath?: string }, fn: () => S) {
    const tracker: Tracker = {
      id: opts.id,
      recordDeps: opts.deps,
      recordWrites: opts.writes,
      deps: new Set(),
      writes: [],
      pos: opts.pos,
      nodePath: opts.nodePath,
    }
    this.stack.push(tracker)
    try {
      const value = fn()
      if (value && typeof (value as unknown as Promise<unknown>).then === 'function') {
        throw new Error('reaction and watch must be synchronous. Put async work in an Enum loader or a watch that only starts it.')
      }
      return { value, deps: tracker.deps, writes: tracker.writes }
    } finally {
      this.stack.pop()
    }
  }

  applyWrites(id: string, writes: WriteOp[]): void {
    for (const op of writes) {
      op.apply()
      this.claimOwner(id, op.key)
    }
    this.enqueueFromDirty()
  }

  registerReaction(id: string, run: () => void, deps: Set<string>): void {
    this.runners.set(id, run)
    this.setDeps(id, deps)
  }

  registerWatch(id: string, run: () => void, deps: Set<string>): void {
    this.runners.set(id, run)
    this.setDeps(id, deps)
  }

  queue(id: string): void {
    this.queued.add(id)
  }

  setDeps(id: string, deps: Set<string>): void {
    const prev = this.reactionDeps.get(id)
    if (prev) {
      for (const dep of prev) this.depIndex.get(dep)?.delete(id)
    }
    this.reactionDeps.set(id, deps)
    for (const dep of deps) {
      let set = this.depIndex.get(dep)
      if (!set) this.depIndex.set(dep, (set = new Set()))
      set.add(id)
    }
  }

  dropDeps(id: string): void {
    this.setDeps(id, new Set())
    this.runners.delete(id)
  }

  // —— draft host ——

  readState(path: string, key: string): unknown {
    if (key === '$path') return path
    if (key === '$pos') return this.readPos(path)
    if (key === '$ui') return (name: string) => createUiHandle(this, path, name)
    if (key === '$find') {
      return (pred: (node: any, pos: Pos) => boolean) => {
        this.track(path, 'value')
        const childrenKey = this.childrenKey(this.treeRoot(path) ?? path)
        const pos = findPos(getAt(this.values, path), pred, childrenKey)
        return pos ? this.handle(pathOf(path, pos, childrenKey)) : undefined
      }
    }
    if (key === '$pathOf') {
      return (pos: Pos) => pathOf(path, pos, this.childrenKey(this.treeRoot(path) ?? path))
    }
    if (key === '$value') {
      this.track(path, 'value')
      return getAt(this.values, path) as never
    }
    if (key === '$errors') return this.aggregate(path, 'errors')
    if (key === '$warnings') return this.aggregate(path, 'warnings')
    const field = this.ensure(path)
    if (key === '$visible') {
      this.trackChain(path, 'display')
      return this.effectiveDisplay(path) === 'visible'
    }
    if (key === '$display') {
      this.trackChain(path, 'display')
      return this.effectiveDisplay(path)
    }
    if (key === '$pattern') {
      this.trackChain(path, 'pattern')
      return this.effectivePattern(path)
    }
    if (key === '$disabled') {
      this.trackChain(path, 'pattern')
      return this.effectivePattern(path) === 'disabled'
    }
    if (key === '$required') {
      this.track(path, 'required')
      return field.required
    }
    if (key === '$enum') {
      this.track(path, 'enum')
      return field.enumOptions ?? []
    }
    if (key === '$rules') {
      this.track(path, 'rules')
      return field.rules
    }
    if (key === '$validating') {
      this.track(path, 'validating')
      return field.validating
    }
    if (key === '$touched') {
      this.track(path, 'touched')
      return field.touched
    }
    if (key === '$dirty') {
      if (!path) {
        this.track('', 'meta')
        return this.dirty
      }
      this.track(path, 'dirty')
      return field.dirty
    }
    if (key === '$canSubmit' || key === '$submitting' || key === '$submitCount') {
      this.track('', 'meta')
      if (key === '$canSubmit') return this.canSubmit
      if (key === '$submitting') return this.submitting
      return this.submitCount
    }
    return undefined
  }

  writeState(path: string, key: string, value: unknown): void {
    const op = this.makeOp(path, key, value)
    const tracker = this.stack.at(-1)
    if (tracker) {
      if (!tracker.recordWrites) return
      const index = tracker.writes.findIndex((item) => item.key === op.key)
      if (index >= 0) tracker.writes[index] = op
      else tracker.writes.push(op)
      return
    }
    if (this.batchDepth > 0) {
      this.batchOps.push(op)
      return
    }
    if (op.apply()) this.enqueueFromDirty()
    this.flush()
  }

  readUi(path: string, name: string, key: string): unknown {
    const ui = this.uis.get(uiKey(path, name))
    this.track(uiDep(path, name), 'display')
    if (key === '$visible') return ui?.hasDisplay ? ui.display !== 'hidden' && ui.display !== 'none' : true
    if (key === '$display') return ui?.hasDisplay ? ui.display : 'visible'
    if (key === '$pattern') return ui?.hasPattern ? ui.pattern : undefined
    return undefined
  }

  writeUi(path: string, name: string, key: string, value: unknown): void {
    const op: WriteOp = {
      key: `${uiDep(path, name)}:${key === '$pattern' ? 'pattern' : 'display'}`,
      apply: () => {
        const ui = this.ensureUi(path, name)
        if (key === '$pattern') {
          ui.hasPattern = value !== undefined
          ui.pattern = value as Pattern | undefined
        } else if (key === '$visible') {
          ui.hasDisplay = true
          ui.display = value ? 'visible' : 'hidden'
        } else if (key === '$display') {
          ui.hasDisplay = true
          ui.display = value as Display
        } else return false
        this.bumpPath(path)
        this.dirtyDeps.add(op.key)
        return true
      },
    }
    const tracker = this.stack.at(-1)
    if (tracker) {
      if (!tracker.recordWrites) return
      tracker.writes.push(op)
      return
    }
    if (this.batchDepth > 0) {
      this.batchOps.push(op)
      return
    }
    op.apply()
    this.enqueueFromDirty()
    this.flush()
  }

  // —— react / test registration ——

  registerField(
    path: string,
    spec: FieldSpec & { trigger?: ValidateTrigger[]; validator?: Rule['validator']; warning?: Rule['validator']; rules?: RulesInput } = {},
  ): void {
    const field = this.ensure(path)
    if (spec.virtual !== undefined) {
      field.virtual = spec.virtual
      field.virtualExplicit = true
    }
    if (spec.trigger) field.triggers = spec.trigger
    if (spec.asyncDebounceMs !== undefined) field.asyncDebounceMs = spec.asyncDebounceMs
    if (!field.rulesFromEffect && (spec.rules !== undefined || spec.validator || spec.warning)) {
      const rules = spec.rules !== undefined ? normalizeRules(spec.rules) : field.rules.filter((rule) => !rule.validator)
      if (spec.validator) rules.push({ validator: spec.validator })
      if (spec.warning) rules.push({ validator: spec.warning })
      field.rules = rules
    }
    if (spec.pattern !== undefined && !field.patternFromEffect) {
      field.pattern = spec.pattern
      field.hasPattern = true
    }
    if (spec.display !== undefined && !field.displayFromEffect) {
      field.display = spec.display
      field.hasDisplay = true
    }
    if (spec.required !== undefined && !field.requiredFromEffect) field.required = spec.required
    if (spec.enum && !field.enumFromEffect) field.enumOptions = asOptions(spec.enum) ?? []
  }

  registerArray(path: string, rowKey?: string): void {
    this.arrays.set(path, { rowKey })
  }

  registerTree(
    path: string,
    spec: { childrenKey?: string; rowKey?: string; canMove?: (args: any) => string | null | undefined } = {},
  ): void {
    const prev = this.trees.get(path)
    this.trees.set(path, {
      childrenKey: spec.childrenKey ?? prev?.childrenKey ?? 'children',
      rowKey: spec.rowKey ?? prev?.rowKey ?? 'id',
      canMove: spec.canMove ?? prev?.canMove,
    })
  }

  claimUi(path: string, name: string): void {
    const key = uiKey(path, name)
    if (this.uiMounts.has(key) && process.env.NODE_ENV !== 'production') {
      throw new ShikiUiError(`ui "${name}" is already mounted on ${path || 'root'}`)
    }
    this.uiMounts.add(key)
  }

  releaseUi(path: string, name: string): void {
    this.uiMounts.delete(uiKey(path, name))
  }

  binding(path: string) {
    const field = this.fields.get(path)
    const pattern = this.effectivePattern(path)
    const display = this.effectiveDisplay(path)
    return {
      path,
      value: getAt(this.values, path),
      onChange: (value: unknown) => this.commitExternal(path, value),
      onBlur: () => this.blur(path),
      errors: field ? shownErrors(field) : [],
      warnings: field?.warnings.slice() ?? [],
      display,
      pattern,
      required: !!field?.required,
      disabled: pattern === 'disabled',
      readOnly: pattern === 'readOnly',
      touched: field?.touched ?? false,
      dirty: path ? (field?.dirty ?? false) : this.dirty,
      validating: field?.validating ?? false,
      options: field?.enumOptions ?? [],
      loading: field?.enumLoading ?? false,
      id: path.replace(/[^a-zA-Z0-9_-]/g, '-') || 'field',
    }
  }

  uiVisible(path: string, name: string | undefined, region: string | undefined): boolean {
    if (this.effectiveDisplay(path) !== 'visible') return false
    if (region && this.uiHidden('', region)) return false
    if (name && this.uiHidden(path, name)) return false
    return true
  }

  blur(path: string): void {
    const field = this.ensure(path)
    field.touched = true
    this.bumpPath(path)
    this.dirtyDeps.add(`${path}:touched`)
    if (this.triggersFor(path).includes('onBlur')) this.scheduleValidate(path)
    else this.emit()
  }

  structureKeys(path: string, rowKey?: string): { key: string; index: number }[] {
    return this.arrayOf(path).map((row, index) => ({ key: this.rowIdent(row, index, rowKey ?? this.arrays.get(path)?.rowKey), index }))
  }

  // —— private ——

  private commitExternal(path: string, value: unknown): void {
    if (!this.commitValue(path, value, false)) return
    const field = this.ensure(path)
    if (!field.dirty) {
      field.dirty = true
      this.dirtyDeps.add(`${path}:dirty`)
      this.bumpPath(path)
    }
    if (!this.dirty) {
      this.dirty = true
      this.bumpMeta()
    }
    this.enqueueFromDirty()
    this.flush()
    if (this.triggersFor(path).includes('onChange')) this.scheduleValidate(path)
  }

  private commitValue(path: string, value: unknown, fromReaction: boolean): boolean {
    const old = getAt(this.values, path)
    if (deepEqual(old, value)) return false
    this.values = setAt(this.values, path, value)
    if (fromReaction) {
      const field = this.ensure(path)
      field.computed = true
      if (!field.virtualExplicit) field.virtual = true
    }
    this.bumpPath(path)
    let cursor: string | null = path
    while (cursor) {
      this.dirtyDeps.add(`${cursor}:value`)
      cursor = parentPath(cursor)
    }
    if (Array.isArray(old) || Array.isArray(value)) {
      this.dirtyRows.set(path, 'all')
      this.markStructure(path)
    }
    if (value != null && typeof value === 'object') this.dirtyUnder(path)
    return true
  }

  private dirtyUnder(path: string): void {
    const prefix = path + '.'
    for (const dep of this.depIndex.keys()) {
      const depPath = dep.slice(0, dep.lastIndexOf(':'))
      if (depPath === path || depPath.startsWith(prefix)) this.dirtyDeps.add(dep)
    }
    for (const fieldPath of this.fields.keys()) {
      if (fieldPath.startsWith(prefix)) this.bumpPath(fieldPath)
    }
  }

  private makeOp(path: string, key: string, value: unknown): WriteOp {
    if (key === '$value') {
      const fromReaction = REACTION_PREFIX.test(this.stack.at(-1)?.id ?? '')
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
    const field = this.ensure(path)
    if (field.hasDisplay && field.display === display) return false
    field.hasDisplay = true
    field.display = display
    if (fromEffect) field.displayFromEffect = true
    this.bumpPath(path)
    this.bumpDescendants(path)
    this.dirtyDeps.add(`${path}:display`)
    if (display === 'none' || this.effectiveDisplay(path) === 'none') this.clearHiddenErrors(path)
    return true
  }

  private setPattern(path: string, pattern: Pattern | undefined, fromEffect: boolean): boolean {
    const field = this.ensure(path)
    const has = pattern !== undefined
    if (field.hasPattern === has && field.pattern === pattern) return false
    field.hasPattern = has
    field.pattern = pattern
    if (fromEffect) field.patternFromEffect = true
    this.bumpPath(path)
    this.bumpDescendants(path)
    this.dirtyDeps.add(`${path}:pattern`)
    return true
  }

  private setRequired(path: string, required: boolean): boolean {
    const field = this.ensure(path)
    field.requiredFromEffect = true
    if (field.required === required) return false
    field.required = required
    this.bumpPath(path)
    this.dirtyDeps.add(`${path}:required`)
    return true
  }

  private setRules(path: string, rules: Rule[]): boolean {
    const field = this.ensure(path)
    field.rulesFromEffect = true
    if (deepEqual(field.rules, rules)) return false
    field.rules = rules.slice()
    this.bumpPath(path)
    this.dirtyDeps.add(`${path}:rules`)
    return true
  }

  private setEnum(path: string, value: unknown): boolean {
    const field = this.ensure(path)
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

  private loadEnum(path: string, binding: { source: { debounce: number; cached: (p: any) => EnumOption[] | undefined; load: (p: any, s: AbortSignal) => Promise<EnumOption[]> }; params: unknown }): void {
    const field = this.ensure(path)
    const seq = ++field.enumSeq
    const start = () => {
      this.enumAbort.get(path)?.abort()
      const ac = new AbortController()
      this.enumAbort.set(path, ac)
      field.enumLoading = true
      this.bumpPath(path)
      void binding.source.load(binding.params, ac.signal).then(
        (options) => {
          if (field.enumSeq !== seq) return
          field.enumOptions = options
          field.enumLoading = false
          this.afterEnum(path)
          this.enqueueFromDirty()
          this.flush()
        },
        () => {
          if (field.enumSeq !== seq) return
          field.enumLoading = false
          this.bumpPath(path)
          this.emit()
        },
      )
    }
    const prev = this.enumTimers.get(path)
    if (prev) clearTimeout(prev)
    const wait = binding.source.debounce
    if (wait > 0) this.enumTimers.set(path, setTimeout(start, wait))
    else start()
  }

  private afterEnum(path: string): void {
    this.bumpPath(path)
    this.dirtyDeps.add(`${path}:enum`)
    const policy = this.options.enumPolicy ?? 'none'
    if (policy === 'clear') {
      const field = this.fields.get(path)
      const current = getAt(this.values, path)
      if (!isEmpty(current) && field?.enumOptions && !optionIncludes(field.enumOptions, current)) {
        this.commitValue(path, undefined, false)
      }
    }
  }

  private effectiveDisplay(path: string): Display {
    let hidden = false
    let cursor: string | null = path
    while (cursor) {
      const display = this.fields.get(cursor)
      if (display?.hasDisplay && display.display === 'none') return 'none'
      if (display?.hasDisplay && display.display === 'hidden') hidden = true
      cursor = parentPath(cursor)
    }
    return hidden ? 'hidden' : 'visible'
  }

  private effectivePattern(path: string): Pattern {
    let cursor: string | null = path
    while (cursor) {
      const field = this.fields.get(cursor)
      if (field?.hasPattern && field.pattern) return field.pattern
      cursor = parentPath(cursor)
    }
    if (this.fields.get(path)?.computed) return 'readPretty'
    return 'editable'
  }

  private triggersFor(path: string): ValidateTrigger[] {
    return this.fields.get(path)?.triggers ?? this.options.validateTrigger ?? ['onBlur', 'onSubmit']
  }

  private async validateOne(path: string): Promise<{ stale: boolean; issues: SchemaIssue[] }> {
    const field = this.fields.get(path)
    if (!field) return { stale: false, issues: [] }
    if (this.effectiveDisplay(path) === 'none' || field.computed) {
      this.setErrors(path, [])
      return { stale: false, issues: [] }
    }
    field.abort?.abort()
    const ac = new AbortController()
    field.abort = ac
    const seq = ++field.asyncSeq
    const scope = scopeOf(path)
    const value = getAt(this.values, path)
    const pos = this.readPos(path)
    const ctx: ValidateCtx = {
      path,
      value,
      record: scope.recordPath ? getAt(this.values, scope.recordPath) : this.values,
      root: this.values,
      parent: scope.parentPath ? getAt(this.values, scope.parentPath) : this.values,
      array: scope.arrayPath ? (getAt(this.values, scope.arrayPath) as any[]) : undefined,
      index: scope.index,
      get: (p) => getAt(this.values, p),
      pos: pos ?? undefined,
      depth: pos?.length,
      signal: ac.signal,
    }
    const rules = field.rules.slice()
    if (this.options.enumPolicy === 'error' && field.enumOptions && !optionIncludes(field.enumOptions, value)) {
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
      if (was) this.bumpMeta()
      return { stale: false as const, issues }
    }
    if (!pending.length && !schemaPending.length) return apply([])
    field.validating = true
    this.bumpPath(path)
    this.bumpMeta()
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

  /** Debounce async rules. Sync-only fields validate on the next turn of `validate`. */
  private scheduleValidate(path: string): void {
    const field = this.ensure(path)
    const ms = field.asyncDebounceMs ?? this.options.asyncDebounceMs ?? 0
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

  private commitSchemaIssues(scope: string | undefined, issues: SchemaIssue[], preserve: Set<string>): void {
    const filtered = issues.filter((issue) => {
      if (!issue.message) return false
      if (!issue.path) return this.effectiveDisplay('') !== 'none'
      return this.effectiveDisplay(issue.path) !== 'none'
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
    const paths = new Set([...this.schemaByPath.keys(), ...next.keys()])
    this.schemaByPath = next
    let changed = false
    for (const path of paths) {
      const field = this.ensure(path)
      const messages = next.get(path) ?? []
      if (deepEqual(field.schemaErrors, messages)) continue
      field.schemaErrors = messages.slice()
      this.bumpPath(path)
      this.markErrorDeps(path)
      changed = true
    }
    if (!changed) return
    this.bumpMeta()
    if (!this.flushing) {
      this.enqueueFromDirty()
      this.flush()
    }
  }

  private clearHiddenErrors(path: string): void {
    for (const [fieldPath, field] of this.fields) {
      if (fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      if (this.effectiveDisplay(fieldPath) !== 'none') continue
      this.setErrors(fieldPath, [])
      field.schemaErrors = []
      this.schemaByPath.delete(fieldPath)
      this.bumpPath(fieldPath)
    }
    this.bumpMeta()
  }

  private setErrors(path: string, messages: string[]): void {
    const field = this.ensure(path)
    if (deepEqual(field.errors, messages)) return
    field.errors = messages
    this.bumpPath(path)
    this.markErrorDeps(path)
    this.bumpMeta()
    if (!this.flushing) {
      this.enqueueFromDirty()
      this.flush()
    }
  }

  private async waitAsync(): Promise<void> {
    for (const timer of this.validateTimers.values()) clearTimeout(timer)
    this.validateTimers.clear()
    while (this.inflight.size) await Promise.allSettled([...this.inflight])
  }

  private aggregate(path: string, kind: 'errors' | 'warnings'): string[] {
    this.track(path, kind)
    const out: string[] = []
    for (const [fieldPath, field] of this.fields) {
      if (path && fieldPath !== path && !fieldPath.startsWith(path + '.')) continue
      if (this.effectiveDisplay(fieldPath) === 'none') continue
      if (kind === 'errors') out.push(...shownErrors(field))
      else out.push(...field.warnings)
    }
    return out
  }

  /** Include the root (`:errors`) so `d.$errors` updates when any field does. */
  private markErrorDeps(path: string): void {
    let cursor: string | null = path
    while (cursor !== null) {
      this.dirtyDeps.add(`${cursor}:errors`)
      if (!cursor) break
      cursor = parentPath(cursor)
    }
  }

  private bumpMeta(): void {
    this.metaVersion += 1
    this.pendingMeta = true
    this.depVersion.set(':meta', (this.depVersion.get(':meta') ?? 0) + 1)
    this.pendingDepNotify.add(':meta')
    const subs = this.depIndex.get(':meta')
    if (subs) for (const id of subs) this.queued.add(id)
  }

  private readPos(path: string): Pos | undefined {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const tracker = this.stack[i]
      if (tracker?.nodePath && tracker.nodePath === path && tracker.pos) return tracker.pos
    }
    const root = this.treeRoot(path)
    if (!root) return undefined
    return posOf(root, path, this.treeCfg(root).childrenKey)
  }

  private treeRoot(path: string): string | undefined {
    let best: string | undefined
    for (const root of this.trees.keys()) {
      if ((path === root || path.startsWith(root + '.')) && (!best || root.length > best.length)) best = root
    }
    return best
  }

  treeConfig(path: string): { childrenKey: string; rowKey: string; canMove?: (args: any) => string | null | undefined } {
    return this.treeCfg(path)
  }

  holdEach(id: string, rec: EachRec): void {
    this.eachRecs.set(id, rec)
  }

  private treeCfg(path: string): { childrenKey: string; rowKey: string; canMove?: (args: any) => string | null | undefined } {
    return this.trees.get(path) ?? this.trees.get(this.treeRoot(path) ?? '') ?? { childrenKey: 'children', rowKey: 'id' }
  }

  private track(path: string, state: string): void {
    const tracker = this.stack.at(-1)
    if (!tracker?.recordDeps) return
    tracker.deps.add(`${path}:${state}`)
  }

  private trackChain(path: string, state: string): void {
    let cursor: string | null = path
    while (cursor) {
      this.track(cursor, state)
      cursor = parentPath(cursor)
    }
  }

  private ensure(path: string): FieldModel {
    let field = this.fields.get(path)
    if (!field) {
      field = {
        path,
        hasDisplay: false,
        displayFromEffect: false,
        hasPattern: false,
        patternFromEffect: false,
        required: false,
        requiredFromEffect: false,
        virtual: false,
        virtualExplicit: false,
        computed: false,
        rules: [],
        rulesFromEffect: false,
        errors: [],
        schemaErrors: [],
        warnings: [],
        touched: false,
        dirty: false,
        validating: false,
        enumLoading: false,
        enumFromEffect: false,
        asyncSeq: 0,
        enumSeq: 0,
      }
      this.fields.set(path, field)
    }
    return field
  }

  private ensureUi(path: string, name: string): UiState {
    const key = uiKey(path, name)
    let ui = this.uis.get(key)
    if (!ui) {
      ui = { hasDisplay: false, hasPattern: false }
      this.uis.set(key, ui)
    }
    return ui
  }

  private uiHidden(path: string, name: string): boolean {
    const ui = this.uis.get(uiKey(path, name))
    return !!ui?.hasDisplay && (ui.display === 'hidden' || ui.display === 'none')
  }

  private claimOwner(id: string, key: string): void {
    if (!REACTION_PREFIX.test(id)) return
    const owner = this.writeOwners.get(key)
    if (owner && owner !== id && process.env.NODE_ENV !== 'production') {
      throw new ShikiConflictError(key, owner, id)
    }
    this.writeOwners.set(key, id)
  }

  private arrayOf(path: string): any[] {
    const value = getAt(this.values, path)
    return Array.isArray(value) ? value : []
  }

  private rowIdent(row: unknown, index: number, rowKey?: string): string {
    const named = readRowId(row, index, rowKey)
    if (!named.startsWith('#')) return named
    if (row && typeof row === 'object') {
      let id = this.ident.get(row)
      if (!id) {
        this.identN += 1
        id = `obj${this.identN}`
        this.ident.set(row, id)
      }
      return id
    }
    return named
  }

  private spliceArray(path: string, from: number, _deleteCount: number, to: number, _mode: 'move'): void {
    const before = this.arrayOf(path)
    if (from === to || from < 0 || from >= before.length) return
    const next = before.slice()
    const [row] = next.splice(from, 1)
    const dest = Math.min(Math.max(to, 0), next.length)
    next.splice(dest, 0, row)
    const rowKey = this.arrays.get(path)?.rowKey
    const beforeIds = before.map((item, index) => this.rowIdent(item, index, rowKey))
    const afterIds = next.map((item, index) => this.rowIdent(item, index, rowKey))
    const dirty = new Set<number>()
    for (let i = 0; i < afterIds.length; i++) if (beforeIds[i] !== afterIds[i]) dirty.add(i)
    this.commitArray(path, before, next, dirty)
  }

  private commitArray(path: string, before: any[], next: any[], dirty: Set<number>): void {
    const rowKey = this.arrays.get(path)?.rowKey
    const oldIds = new Map<string, string>()
    before.forEach((row, index) => oldIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    const newIds = new Map<string, string>()
    next.forEach((row, index) => newIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    this.reindexById(oldIds, newIds)
    this.values = setAt(this.values, path, next)
    this.dirtyRows.set(path, dirty)
    this.markStructure(path)
    this.enqueueFromDirty()
    this.flush()
  }

  private reindexById(oldIds: Map<string, string>, newIds: Map<string, string>): void {
    const owned: string[] = []
    const moves: { to: string; model: FieldModel }[] = []
    for (const [fieldPath, model] of this.fields) {
      let best = ''
      let bestId = ''
      for (const [id, nodePath] of oldIds) {
        if ((fieldPath === nodePath || fieldPath.startsWith(nodePath + '.')) && nodePath.length > best.length) {
          best = nodePath
          bestId = id
        }
      }
      if (!best) continue
      owned.push(fieldPath)
      const target = newIds.get(bestId)
      if (!target) continue
      moves.push({ to: target + fieldPath.slice(best.length), model })
    }
    for (const path of owned) this.fields.delete(path)
    for (const move of moves) {
      move.model.path = move.to
      this.fields.set(move.to, move.model)
    }
  }

  private markStructure(path: string): void {
    this.structVersion.set(path, (this.structVersion.get(path) ?? 0) + 1)
    this.pendingStruct.add(path)
    let cursor: string | null = path
    while (cursor) {
      this.dirtyDeps.add(`${cursor}:structure`)
      cursor = parentPath(cursor)
    }
  }

  private bumpPath(path: string): void {
    this.pathVersion.set(path, (this.pathVersion.get(path) ?? 0) + 1)
    this.pendingPaths.add(path)
  }

  private bumpDescendants(path: string): void {
    const prefix = path + '.'
    for (const fieldPath of this.fields.keys()) {
      if (fieldPath.startsWith(prefix)) this.bumpPath(fieldPath)
    }
  }

  private enqueueFromDirty(): void {
    for (const dep of this.dirtyDeps) {
      this.depVersion.set(dep, (this.depVersion.get(dep) ?? 0) + 1)
      const subs = this.depIndex.get(dep)
      if (subs) for (const id of subs) this.queued.add(id)
      this.pendingDepNotify.add(dep)
    }
    this.dirtyDeps.clear()
  }

  private flush(): void {
    if (this.flushing) return
    this.flushing = true
    this.trace = []
    try {
      let wave = 0
      while (this.queued.size) {
        wave += 1
        if (wave > 10) throw new ShikiCycleError(this.trace.slice(-12))
        const ids = [...this.queued]
        this.queued.clear()
        for (const id of ids) {
          this.trace.push(id)
          this.runs.set(id, (this.runs.get(id) ?? 0) + 1)
          if (this.devtools) console.debug('[shikiform]', id)
          this.runners.get(id)?.()
        }
      }
    } finally {
      this.flushing = false
      this.emit()
    }
  }

  private emit(): void {
    this.debugVersion += 1
    const paths = [...this.pendingPaths]
    const structs = [...this.pendingStruct]
    this.pendingPaths.clear()
    this.pendingStruct.clear()
    for (const path of paths) this.pathListeners.get(path)?.forEach((fn) => fn())
    for (const path of structs) this.structListeners.get(path)?.forEach((fn) => fn())
    if (this.pendingMeta) {
      this.pendingMeta = false
      this.metaListeners.forEach((fn) => fn())
    }
    const deps = [...this.pendingDepNotify]
    this.pendingDepNotify.clear()
    for (const dep of deps) this.depListeners.get(dep)?.forEach((fn) => fn())
    this.debugListeners.forEach((fn) => fn())
  }
}

function addListener(map: Map<string, Set<() => void>>, key: string, listener: () => void): () => void {
  let set = map.get(key)
  if (!set) map.set(key, (set = new Set()))
  set.add(listener)
  return () => set!.delete(listener)
}

function uiKey(path: string, name: string): string {
  return `${path}#${name}`
}

function uiDep(path: string, name: string): string {
  return `@ui:${path}#${name}`
}

/** Build an effect module. The factory runs once per form, against that form's draft. */
export function defineEffects<T>(factory: (api: EffectsAPI<T>) => void): EffectDef<T> {
  return {
    install(form) {
      const runtime = form as EffectsRuntime<T>
      const reaction = Object.assign(
        (effect: (d: Draft<T>) => void) => {
          const id = runtime.nextId('reaction')
          const run = () => {
            const result = runtime.runWith({ id, deps: true, writes: true }, () => effect(runtime.draft))
            runtime.setDeps(id, result.deps)
            runtime.applyWrites(id, result.writes)
          }
          runtime.registerReaction(id, run, new Set())
          runtime.queue(id)
        },
        {
          each(select: (d: Draft<T>) => unknown, effect: Function) {
            installEach(runtime, 'each', select as (d: Draft<any>) => unknown, effect)
          },
          walk(select: (d: Draft<T>) => unknown, effect: Function, opts?: { childrenKey?: string }) {
            installEach(runtime, 'walk', select as (d: Draft<any>) => unknown, effect, opts?.childrenKey ?? 'children')
          },
        },
      ) as EffectsAPI<T>['reaction']

      const watch = Object.assign(
        (source: (d: Draft<T>) => unknown, effect: (d: Draft<T>) => void) => {
          const id = runtime.nextId('watch')
          const scout = runtime.trackOnly(() => source(runtime.draft))
          const run = () => {
            const result = runtime.runWith({ id, deps: false, writes: true }, () => effect(runtime.draft))
            runtime.applyWrites(id, result.writes)
          }
          runtime.registerWatch(id, run, scout.deps)
        },
        {
          each(select: (d: Draft<T>) => unknown, effect: Function) {
            installWatchEach(runtime, select as (d: Draft<any>) => unknown, effect)
          },
        },
      ) as EffectsAPI<T>['watch']

      factory({
        reaction,
        watch,
        query: (path, opts) => (opts?.ui ? createUiHandle(runtime as unknown as DraftHost, path, opts.ui) : runtime.handle(path)),
      })
    },
  }
}

function installEach(
  runtime: EffectsRuntime<any>,
  kind: 'each' | 'walk',
  select: (d: Draft<any>) => unknown,
  effect: Function,
  childrenKey = 'children',
): void {
  const engine = runtime as FormEngine
  const id = runtime.nextId(kind)
  const rec: EachRec = { kind, select, effect, arrayPath: '', childrenKey, instances: new Set(), first: true }
  engine.holdEach(id, rec)
  const run = () => {
    const selected = runtime.trackOnly(() => select(runtime.draft))
    const arrayPath = runtime.readPath(selected.value)
    if (!arrayPath) throw new Error(`${kind}() selector must return a draft handle`)
    rec.arrayPath = arrayPath
    if (kind === 'walk') runtime.noteTree(arrayPath, childrenKey)
    if (kind === 'each') runArrayEach(engine, runtime, rec, id)
    else runWalk(engine, runtime, rec, id)
    rec.first = false
    const deps = new Set(selected.deps)
    deps.add(`${arrayPath}:structure`)
    runtime.setDeps(id, deps)
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

function runArrayEach(engine: FormEngine, runtime: EffectsRuntime<any>, rec: EachRec, id: string): void {
  const arr = (runtime.getValue(rec.arrayPath) as unknown[]) ?? []
  const dirty = rec.first ? 'all' : engine.takeDirtyRows(rec.arrayPath)
  const seen = new Set<string>()
  for (let index = 0; index < arr.length; index++) {
    const inst = `${id}#${index}`
    seen.add(inst)
    const fresh = !rec.instances.has(inst)
    if (fresh) {
      const captured = index
      runtime.registerReaction(
        inst,
        () => {
          const result = runtime.runWith({ id: inst, deps: true, writes: true }, () =>
            rec.effect(runtime.handle(`${rec.arrayPath}.${captured}`), runtime.draft, captured),
          )
          runtime.setDeps(inst, result.deps)
          runtime.applyWrites(inst, result.writes)
        },
        new Set(),
      )
      rec.instances.add(inst)
    }
    const should = dirty === 'all' || (dirty instanceof Set && dirty.has(index))
    if (fresh || should) runtime.queue(inst)
  }
  for (const inst of rec.instances) {
    if (!seen.has(inst)) {
      runtime.dropDeps(inst)
      rec.instances.delete(inst)
    }
  }
}

function runWalk(engine: FormEngine, runtime: EffectsRuntime<any>, rec: EachRec, id: string): void {
  const cfg = engine.treeConfig(rec.arrayPath)
  const nodes = listPositions(runtime.getValue(rec.arrayPath), rec.arrayPath, rec.childrenKey || cfg.childrenKey, cfg.rowKey)
  const dirty = rec.first ? 'all' : engine.takeDirtyPos(rec.arrayPath)
  const seen = new Set<string>()
  for (const node of nodes) {
    const key = posKey(node.pos)
    const inst = `${id}@${key}`
    seen.add(inst)
    const fresh = !rec.instances.has(inst)
    if (fresh) {
      const captured = node
      runtime.registerReaction(
        inst,
        () => {
          const result = runtime.runWith(
            { id: inst, deps: true, writes: true, pos: captured.pos, nodePath: captured.path },
            () => rec.effect(runtime.handle(captured.path), runtime.draft, captured.pos),
          )
          runtime.setDeps(inst, result.deps)
          runtime.applyWrites(inst, result.writes)
        },
        new Set(),
      )
      rec.instances.add(inst)
    }
    const should = dirty === 'all' || (dirty instanceof Set && dirty.has(key))
    if (fresh || should) runtime.queue(inst)
  }
  for (const inst of rec.instances) {
    if (!seen.has(inst)) {
      runtime.dropDeps(inst)
      rec.instances.delete(inst)
    }
  }
}

function installWatchEach(runtime: EffectsRuntime<any>, select: (d: Draft<any>) => unknown, effect: Function): void {
  const engine = runtime as FormEngine
  const id = runtime.nextId('watch-each')
  const known = new Set<string>()
  const run = () => {
    const selected = runtime.trackOnly(() => select(runtime.draft))
    const arrayPath = runtime.readPath(selected.value)
    if (!arrayPath) throw new Error('watch.each selector must return a draft handle')
    const arr = (runtime.getValue(arrayPath) as unknown[]) ?? []
    const seen = new Set<string>()
    for (let index = 0; index < arr.length; index++) {
      const inst = `${id}#${index}`
      seen.add(inst)
      if (!known.has(inst)) {
        const scout = runtime.runWith({ id: inst, deps: true, writes: false }, () =>
          effect(runtime.handle(`${arrayPath}.${index}`), runtime.draft, index),
        )
        runtime.setDeps(inst, scout.deps)
        runtime.registerWatch(inst, () => {
          const result = runtime.runWith({ id: inst, deps: false, writes: true }, () =>
            effect(runtime.handle(`${arrayPath}.${index}`), runtime.draft, index),
          )
          runtime.applyWrites(inst, result.writes)
        }, scout.deps)
        known.add(inst)
      }
    }
    for (const inst of known) {
      if (!seen.has(inst)) {
        runtime.dropDeps(inst)
        known.delete(inst)
      }
    }
    runtime.setDeps(id, new Set([`${arrayPath}:structure`, ...selected.deps]))
  }
  runtime.registerReaction(id, run, new Set())
  runtime.queue(id)
}

export function createForm<T>(options: FormOptions<T> = {}): FormEngine<T> {
  return new FormEngine(options)
}

function shownErrors(field: FieldModel): string[] {
  if (!field.errors.length && !field.schemaErrors.length) return []
  return [...field.errors, ...field.schemaErrors]
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
