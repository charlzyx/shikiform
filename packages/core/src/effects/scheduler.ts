import type { DraftScope } from '../draft/host'
import { ShikiConflictError, ShikiCycleError, ShikiUsageError, showDraftPath, showStateKey } from '../errors'
import { deepEqual } from '../shared/equal'
import { getAt, parentPath, selfAndAncestors } from '../shared/path'
import type { Notifier } from '../state/notifier'
import type { Pos } from '../shared/tree-ops'
import type { TrackedRow, WriteOp } from '../types'
import { valueChangedAt, WriteJournal, type WorkingValues, type WriteBuffer } from './write-buffer'

interface ValueCommit {
  before: unknown
  after: unknown
  hasStructure: boolean
  structures: Set<string>
  changes: Map<string, boolean>
  rowReaders: Set<string>
  priorRowPaths: Map<string, string>
  finish: (() => void)[]
}

/** One running reaction / watch / selector. Reads become deps, writes are buffered. */
export interface Tracker extends WriteBuffer {
  id: string
  recordDeps: boolean
  recordWrites: boolean
  deps: Set<string>
  rowDeps?: Set<string>
  readingRow?: boolean
  pos?: Pos
  nodePath?: string
  draftScope?: DraftScope
}

/** Bookkeeping for one `reaction.each` installation. */
export interface EachRec {
  effect: Function
  path: string
  instances: Set<string>
  first: boolean
}

/** Occupant changes under one `each` root. Consumed when that `each` re-lists. */
export interface EachDirty {
  /** Array path → indexes whose occupant changed, or `'all'`. Includes nested arrays under the root. */
  rows: Map<string, Set<number> | 'all'>
  /** Tree `posKey`s (`0.1`) whose occupant changed at the selected root. */
  pos: Set<string> | 'all' | undefined
}

export interface RunOptions {
  id: string
  deps: boolean
  writes: boolean
  pos?: Pos
  nodePath?: string
}

/**
 * Draft key → the write-op state it would read back.
 * `$value` / `$enum` / `$rules` are absent: those reads project this pass's pending writes, like UI state.
 * Flags do not, so a second read still sees the old value.
 */
const WRITTEN_STATE: Record<string, string> = {
  $visible: 'visible',
  $disabled: 'disabled',
  $readOnly: 'readOnly',
  $omit: 'omit',
  $required: 'required',
}

const REACTION_PREFIX = /^(reaction|each):/

/** Ids of derivations (`reaction`, `each`). Watches and selectors are not derivations. */
export function isReactionId(id: string): boolean {
  return REACTION_PREFIX.test(id)
}

/** Ids of watch effect runners (`watch:N` and `watch-each:N#...`, not the `watch-each:N` reconciler). */
export function isWatchRunner(id: string): boolean {
  return id.startsWith('watch:') || (id.startsWith('watch-each:') && id.includes('#'))
}

/**
 * Dependency tracking and the reaction / watch run loop.
 *
 * A dep key is `path:state` (`rows.0.cost:value`, `:meta`).
 * Writers add keys to `dirtyDeps`; {@link Scheduler.enqueueFromDirty} queues every runner whose
 * last recorded reads intersect them; {@link Scheduler.flush} runs waves until the queue settles
 * (more than 10 waves is a {@link ShikiCycleError}), then emits notifications.
 */
export class Scheduler {
  devtools: boolean
  /** Runner id → run count, for diagnostics. */
  readonly runs = new Map<string, number>()
  readonly runners = new Map<string, () => void>()
  private depIndex = new Map<string, Set<string>>()
  private reactionDeps = new Map<string, Set<string>>()
  private trackedRows = new Map<string, TrackedRow>()
  private writeOwners = new Map<string, string>()
  /** All keys claimed over the lifetime of a disposable each instance (development only). */
  private ownedByInstance = new Map<string, Set<string>>()
  private queued = new Set<string>()
  /** Keys changed since the last enqueue. */
  readonly dirtyDeps = new Set<string>()
  private readonly structureOnlyDeps = new Set<string>()
  /** Array path → row indexes whose occupant changed. Consumed by `reaction.each` (the root and nested arrays). */
  readonly dirtyRows = new Map<string, Set<number> | 'all'>()
  /** Tree path → `posKey`s whose occupant changed. Consumed by `reaction.each` on that root. */
  readonly dirtyPos = new Map<string, Set<string> | 'all'>()
  /** Keys read by `takeEachDirty` during the current flush; cleared when the flush settles so sibling `each` instances share them. */
  readonly consumedDirtyRows = new Set<string>()
  readonly consumedDirtyPos = new Set<string>()
  readonly eachRecs = new Map<string, EachRec>()
  readonly stack: Tracker[] = []
  flushing = false
  /** True during `createForm` initial flush; suppresses watch runners so initial reactions do not fire watches. */
  initializing = false
  /** Non-zero while `defineEffects` runs the factory. */
  installDepth = 0
  readonly writes = new WriteJournal(this.stack)
  private readonly workByWrites = new WeakMap<WriteOp[], WorkingValues>()
  valueCommit?: ValueCommit
  private flushHolds = 0
  private flushRequested = false
  private readonly afterBatchCallbacks: ((settled: boolean) => void)[] = []
  private seq = 0
  private trace: string[] = []
  /** Development: runner id → where it was declared (`file:line:col`), for error messages. */
  private readonly sites = new Map<string, string>()
  /** Development: runner id → keys its last pass wrote, for error messages. */
  private readonly lastWrites = new Map<string, string[]>()
  /** Runs once a flush settles, before notifications go out. The engine re-derives `dirty` here. */
  onSettle?: () => void

  constructor(private readonly notifier: Notifier, devtools = false) {
    this.devtools = devtools
  }

  nextId(prefix: string, site?: string): string {
    this.seq += 1
    const id = `${prefix}:${this.seq}`
    if (site) this.sites.set(id, site)
    return id
  }

  /** `reaction:2 at src/x.ts:12:5: reads d.a.$value; writes d.b.$value`; row / node instances name their row. */
  describe(id: string): string {
    const base = id.replace(/[#@].*$/, '')
    const kind = base.replace(/:\d+$/, '')
    const row = id.length > base.length ? ` [${id[base.length] === '#' ? 'row' : 'node'} ${id.slice(base.length + 1)}]` : ''
    const site = this.sites.get(base)
    const reads = [...(this.reactionDeps.get(id) ?? [])].map(showStateKey)
    const writes = (this.lastWrites.get(id) ?? []).map(showStateKey)
    const parts = [`reads ${reads.length ? list(reads) : 'nothing'}`]
    if (writes.length) parts.push(`writes ${list(writes)}`)
    const name = kind === 'reaction' ? base : `reaction.${base}`
    return `${name}${row}${site ? ` at ${site}` : ''}: ${parts.join('; ')}`
  }

  current(): Tracker | undefined {
    return this.stack.at(-1)
  }

  reactionScope(): DraftScope | undefined {
    const active = this.current()
    if (active?.recordWrites && isReactionId(active.id)) return (active.draftScope ??= {})
  }

  beginInstall(): void { this.installDepth += 1 }
  endInstall(): void { this.installDepth -= 1 }

  runWith<S>(opts: RunOptions, fn: () => S): { value: S; deps: Set<string>; rowDeps?: Set<string>; writes: WriteOp[] } {
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
        if (tracker.draftScope) tracker.draftScope.rejectedAsync = true
        // The caller gets the synchronous diagnostic; the abandoned promise may fail later.
        void Promise.resolve(value).catch(() => undefined)
        throw new ShikiUsageError('reaction and watch must be synchronous. Put async work in an EnumSource loader or a watch that only starts it.')
      }
      if (tracker.working) this.workByWrites.set(tracker.writes, tracker.working)
      return { value, deps: tracker.deps, rowDeps: tracker.rowDeps, writes: tracker.writes }
    } finally {
      this.stack.pop()
    }
  }

  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> } {
    return this.runWith({ id: 'track', deps: true, writes: false }, fn)
  }

  /** Record a read of `path:state` on the running tracker. */
  track(path: string, state: string): void {
    const tracker = this.stack.at(-1)
    if (!tracker?.recordDeps) return
    const deps = tracker.readingRow ? (tracker.rowDeps ??= new Set()) : tracker.deps
    deps.add(`${path}:${state}`)
  }

  /** Track reads reached through the row handle separately from fixed paths on the root draft. */
  trackRowRead<T>(read: () => T): T {
    const tracker = this.current()
    if (!tracker?.recordDeps || tracker.readingRow || !tracker.nodePath) return read()
    tracker.readingRow = true
    try { return read() }
    finally { tracker.readingRow = false }
  }

  /** Record reads on `path`, every ancestor and the root (inherited flags: visible, disabled, readOnly, omit). */
  trackChain(path: string, state: string): void {
    for (const cursor of selfAndAncestors(path)) this.track(cursor, state)
  }

  register(id: string, run: () => void, deps: Set<string>, row?: TrackedRow): void {
    if (row) this.trackedRows.set(id, row)
    this.runners.set(id, run)
    this.setDeps(id, deps)
  }

  queue(id: string): void {
    this.queued.add(id)
  }

  setDeps(id: string, deps: Set<string>): void {
    const prev = this.reactionDeps.get(id)
    if (prev) {
      for (const dep of prev) {
        if (deps.has(dep)) continue
        const subscribers = this.depIndex.get(dep)
        subscribers?.delete(id)
        if (!subscribers?.size) this.depIndex.delete(dep)
      }
    }
    this.reactionDeps.set(id, deps)
    for (const dep of deps) {
      let set = this.depIndex.get(dep)
      if (!set) this.depIndex.set(dep, (set = new Set()))
      set.add(id)
    }
  }

  dropDeps(id: string): void {
    for (const dep of this.reactionDeps.get(id) ?? []) {
      const subscribers = this.depIndex.get(dep)
      subscribers?.delete(id)
      if (!subscribers?.size) this.depIndex.delete(dep)
    }
    this.reactionDeps.delete(id)
    this.trackedRows.delete(id)
    this.runners.delete(id)
    this.queued.delete(id)
    this.runs.delete(id)
    this.lastWrites.delete(id)
    this.releaseOwnership(id)
  }

  private releaseOwnership(id: string): void {
    for (const key of this.ownedByInstance.get(id) ?? []) this.writeOwners.delete(key)
    this.ownedByInstance.delete(id)
  }

  /** Move row dependencies before publishing dirty keys. An already queued runner follows the same row. */
  reindexRows(oldIds: ReadonlyMap<string, string>, newIds: ReadonlyMap<string, string>): void {
    if (!this.trackedRows.size) return
    const idsByPath = new Map([...oldIds].map(([id, path]) => [path, id]))
    for (const [id, row] of this.trackedRows) {
      const from = row.path!
      let owner: string | null = from
      while (owner && !idsByPath.has(owner)) owner = parentPath(owner)
      if (!owner) continue
      const destination = newIds.get(idsByPath.get(owner)!)
      const to = destination === undefined ? undefined : destination + from.slice(owner.length)
      if (to === from) continue
      if (this.valueCommit && !this.valueCommit.priorRowPaths.has(id)) this.valueCommit.priorRowPaths.set(id, from)
      row.path = to
      this.queue(id.slice(0, id.indexOf('#')))
      if (to === undefined) {
        this.dropDeps(id)
        continue
      }
      this.releaseOwnership(id)
      if (!row.rowDeps?.size) continue
      const moved = new Set<string>()
      for (const dep of row.rowDeps) {
        if (dep.startsWith(from + ':') || dep.startsWith(from + '.') || dep.startsWith(from + '#')) {
          moved.add(to + dep.slice(from.length))
        } else {
          // An inherited flag read through the row also tracks its ancestors.
          const colon = dep.lastIndexOf(':')
          const path = dep.slice(0, colon)
          if (!path || from.startsWith(path + '.')) {
            for (const ancestor of selfAndAncestors(parentPath(to) ?? '')) moved.add(ancestor + dep.slice(colon))
          } else moved.add(dep)
        }
      }
      row.rowDeps = moved
      this.setDeps(id, new Set([...row.deps, ...moved]))
    }
  }

  depKeys(): IterableIterator<string> {
    return this.depIndex.keys()
  }

  applyWrites(id: string, writes: WriteOp[], before: unknown): void {
    this.applyBuffered(writes, before, this.workByWrites.get(writes), id)
  }

  applyBatch(before: unknown): void {
    const { writes, working } = this.writes.takeBatch()
    this.applyBuffered(writes, before, working)
  }

  private applyBuffered(writes: WriteOp[], before: unknown, working?: WorkingValues, id?: string): void {
    this.holdFlush(() => {
      const parent = this.valueCommit
      const commit: ValueCommit | undefined = working && {
        before, after: working.values, hasStructure: working.hasStructure, structures: new Set(), changes: new Map(),
        rowReaders: new Set(), priorRowPaths: new Map(), finish: [],
      }
      this.valueCommit = commit
      try {
        if (id && process.env.NODE_ENV !== 'production' && isReactionId(id)) this.lastWrites.set(id, writes.map((op) => op.key))
        for (const op of writes) {
          op.apply()
          if (id) this.claimOwner(id, op.key)
        }
        this.enqueueFromDirty()
        if (commit?.hasStructure) this.queueChangedRows(commit)
      } finally {
        this.valueCommit = parent
      }
      for (const finish of commit?.finish ?? []) finish()
      this.enqueueFromDirty()
      if (!id) this.flush()
    })
  }

  /** Hold notifications and effects until every buffered operation has applied. */
  holdFlush(fn: () => void): void {
    this.flushHolds++
    try {
      fn()
    } finally {
      if (--this.flushHolds === 0) {
        const callbacks = this.afterBatchCallbacks.splice(0)
        let settled = false
        try {
          if (this.flushRequested) {
            this.flushRequested = false
            this.flush()
          }
          settled = true
        } finally {
          for (const callback of callbacks) callback(settled)
        }
      }
    }
  }

  afterBatch(callback: (settled: boolean) => void): void {
    if (this.flushHolds) this.afterBatchCallbacks.push(callback)
    else callback(true)
  }

  /** Two different reactions writing the same key is a dev error. Watches may share keys. */
  private claimOwner(id: string, key: string): void {
    if (process.env.NODE_ENV === 'production' || !isReactionId(id)) return
    const owner = this.writeOwners.get(key)
    if (owner && owner !== id) {
      throw new ShikiConflictError(
        key,
        owner,
        id,
        `${showStateKey(key)} is written by two reactions:\n  1. ${this.describe(owner)}\n  2. ${this.describe(id)}\n` +
          `A derived state has one writer: compute it in one reaction from both inputs, ` +
          `or move the write that is an action ("when X changes, set Y") into watch.`,
      )
    }
    this.writeOwners.set(key, id)
    if (id.startsWith('each:')) {
      let keys = this.ownedByInstance.get(id)
      if (!keys) this.ownedByInstance.set(id, (keys = new Set()))
      keys.add(key)
    }
  }

  markDirty(dep: string): void {
    this.dirtyDeps.add(dep)
    this.structureOnlyDeps.delete(dep)
  }

  markStructureDep(dep: string): void {
    if (!this.dirtyDeps.has(dep)) this.structureOnlyDeps.add(dep)
    this.dirtyDeps.add(dep)
  }

  private changedInCommit(path: string): boolean {
    const commit = this.valueCommit
    if (!commit) return true
    const known = commit.changes.get(path)
    if (known !== undefined) return known
    const changed = valueChangedAt(commit.before, path, commit.after, path)
    commit.changes.set(path, changed)
    return changed
  }

  private queueChangedRows(commit: ValueCommit): void {
    for (const id of commit.rowReaders) {
      const row = this.trackedRows.get(id)
      if (row?.path === undefined) continue
      const start = commit.priorRowPaths.get(id) ?? row.path
      for (const dep of row.rowDeps ?? []) {
        if (!dep.endsWith(':value')) continue
        const path = dep.slice(0, -':value'.length)
        if (valueChangedAt(commit.before, start + path.slice(row.path.length), commit.after, path)) {
          this.queue(id)
          break
        }
      }
    }
  }

  private collectRowValueReaders(path: string): void {
    const commit = this.valueCommit
    if (!commit?.hasStructure) return
    const dep = `${path}:value`
    for (const id of this.depIndex.get(dep) ?? []) {
      if (isReactionId(id) && this.trackedRows.get(id)?.rowDeps?.has(dep)) commit.rowReaders.add(id)
    }
  }

  /** Wake value ancestors and readers below a replaced value or edited structure. */
  markValueChanged(path: string, replacement?: {
    before: unknown
    after: unknown
    fields?: Iterable<string>
    moved?: ReadonlySet<string>
  }, compareCommit = true): void {
    const changedInCommit = (key: string) => !compareCommit || this.changedInCommit(key)
    if (changedInCommit(path)) this.notifier.bumpPath(path)
    for (const cursor of selfAndAncestors(path)) {
      if (!replacement?.moved) this.collectRowValueReaders(cursor)
      if (changedInCommit(cursor)) this.markDirty(`${cursor}:value`)
      else if (this.valueCommit?.hasStructure && !replacement?.moved) {
        // A row edit can survive a move even if another row puts the old value back at this index.
        const dep = `${cursor}:value`
        const rowMoved = changedInCommit(parentPath(cursor) ?? '')
        if (!rowMoved) continue
        for (const id of this.depIndex.get(dep) ?? []) {
          if (!this.initializing && isWatchRunner(id) && this.trackedRows.get(id)?.rowDeps?.has(dep)) this.queue(id)
        }
      }
    }
    const changedParent = changedInCommit(path)
    if (!replacement || (!replacement.moved && !changedParent && !this.valueCommit?.hasStructure)) return
    const { before, after, fields = [], moved } = replacement
    const descendant = (key: string) => key !== path && (!path || key.startsWith(path + '.'))
    const changed = (key: string) => !Object.is(getAt(before, key), getAt(after, key))
    const deps = new Set([...this.depKeys(), ...this.notifier.depListenerKeys()])
    for (const dep of deps) {
      const at = dep.lastIndexOf(':')
      const key = dep.slice(0, at)
      const state = dep.slice(at + 1)
      if (!descendant(key) && (moved || key !== path || state === 'value')) continue
      if (!moved) {
        if (state === 'value') this.collectRowValueReaders(key)
        if (changedParent) this.markReplaced(dep, key, before, after)
      } else if ((state !== 'value' && moved.has(key)) || (changed(key) && changedInCommit(key))) this.markStructureDep(dep)
    }
    if (!moved && !changedParent) return
    const paths = new Set([...fields, ...this.notifier.pathListenerKeys(), ...(moved ?? [])])
    for (const key of paths) {
      if (descendant(key) && (!moved || moved.has(key) || (changed(key) && changedInCommit(key)))) this.notifier.bumpPath(key)
    }
  }

  /** Merge dirty row indexes for `path` (keeps `'all'` if either side is `'all'`). Cleared when `flush` settles. */
  markDirtyRows(path: string, dirty: Set<number> | 'all'): void {
    const prev = this.dirtyRows.get(path)
    if (prev === 'all' || dirty === 'all') {
      this.dirtyRows.set(path, 'all')
      return
    }
    if (!prev) {
      this.dirtyRows.set(path, new Set(dirty))
      return
    }
    for (const index of dirty) prev.add(index)
  }

  /** Merge dirty tree positions for `path` (keeps `'all'` if either side is `'all'`). Cleared when `flush` settles. */
  markDirtyPos(path: string, dirty: Set<string> | 'all'): void {
    const prev = this.dirtyPos.get(path)
    if (prev === 'all' || dirty === 'all') {
      this.dirtyPos.set(path, 'all')
      return
    }
    if (!prev) {
      this.dirtyPos.set(path, new Set(dirty))
      return
    }
    for (const pos of dirty) prev.add(pos)
  }

  /** Whole-object writes wake ordinary descendant readers. Object entries keep per-key value precision. */
  private markReplaced(dep: string, path: string, before: unknown, after: unknown): void {
    const readers = this.depIndex.get(dep)
    const sameObjectEntry = readers && [...readers].some(isObjectEntry) && deepEqual(getAt(before, path), getAt(after, path))
    if (!sameObjectEntry) {
      this.markDirty(dep)
      return
    }
    for (const id of readers ?? []) {
      if (isObjectEntry(id)) continue
      if (this.initializing && isWatchRunner(id)) continue
      this.queue(id)
    }
    this.notifier.bumpDep(dep)
  }

  /** Bump the structure version of `path` and dirty `:structure` on it and its ancestors. */
  markStructure(path: string, before?: unknown, after?: unknown): void {
    // A record selected inside a moved row now belongs to a different occupant.
    if (before !== undefined) {
      for (const [id, rec] of this.eachRecs) {
        if ((path && !rec.path.startsWith(path + '.')) || rec.path === path) continue
        if (getAt(before, rec.path) === getAt(after, rec.path)) continue
        this.queue(id)
        if (this.depIndex.get(`${rec.path}:keys`)?.has(id)) {
          for (const inst of rec.instances) this.queue(inst)
        }
      }
      for (const [dep, readers] of this.depIndex) {
        if (!dep.endsWith(':structure')) continue
        const root = dep.slice(0, -':structure'.length)
        if ((path && !root.startsWith(path + '.')) || root === path) continue
        if (getAt(before, root) === getAt(after, root)) continue
        for (const id of readers) {
          if (id.startsWith('watch-each:') && !isWatchRunner(id)) this.queue(id)
        }
      }
    }
    this.notifier.bumpStructure(path)
    let cursor: string | null = path
    while (cursor) {
      this.dirtyDeps.add(`${cursor}:structure`)
      cursor = parentPath(cursor)
    }
  }

  /** Form-level meta changed: notify meta listeners and queue runners reading `:meta`. */
  bumpMeta(): void {
    this.notifier.bumpMeta()
    const subs = this.depIndex.get(':meta')
    if (subs) for (const id of subs) this.queued.add(id)
  }

  /** Queue reactions and watches whose recorded reads intersect this batch's dirty keys. */
  enqueueFromDirty(): void {
    for (const dep of this.dirtyDeps) {
      const subs = this.depIndex.get(dep)
      if (subs) {
        for (const id of subs) {
          if (this.initializing && isWatchRunner(id)) continue
          const structureOnly = this.structureOnlyDeps.has(dep)
          if (structureOnly && id.startsWith('watch-each:') && isWatchRunner(id)) continue
          const commit = this.valueCommit
          const row = this.trackedRows.get(id)
          if (commit?.hasStructure && isReactionId(id) && row?.rowDeps?.has(dep)) {
            if (dep.endsWith(':value')) {
              commit.rowReaders.add(id)
              if (!row.deps.has(dep)) continue
            } else if (structureOnly && !row.deps.has(dep)) continue
          }
          this.queued.add(id)
        }
      }
      this.notifier.bumpDep(dep)
    }
    this.dirtyDeps.clear()
    this.structureOnlyDeps.clear()
  }

  private cycleError(): ShikiCycleError {
    const tail = this.trace.slice(-12)
    if (process.env.NODE_ENV === 'production') return new ShikiCycleError(tail)
    const loop: string[] = []
    for (const id of tail) if (!loop.includes(id)) loop.push(id)
    const chain = loop.map((id) => `  ${this.describe(id)}`).join('\n')
    return new ShikiCycleError(
      tail,
      `Reactions did not settle after 10 passes; these keep re-running each other:\n${chain}\n` +
        `A reaction must not write a state that (through other reactions) feeds back into what it reads. ` +
        `Derive one direction only, or use watch for the reverse edit.`,
    )
  }

  flush(): void {
    if (this.flushing) return
    if (this.flushHolds) {
      this.flushRequested = true
      return
    }
    this.flushing = true
    this.trace = []
    try {
      let wave = 0
      let failure: { error: unknown } | undefined
      while (this.queued.size) {
        wave += 1
        if (wave > 10) throw failure ? failure.error : this.cycleError()
        const ids = new Set<string>()
        for (const id of this.queued) {
          if (this.trackedRows.has(id)) {
            const parent = id.slice(0, id.indexOf('#'))
            if (this.queued.has(parent)) ids.add(parent)
          }
          ids.add(id)
        }
        for (const id of ids) {
          // A runner earlier in this wave can change the row again before we reach it.
          if (this.trackedRows.has(id) && this.queued.has(id.slice(0, id.indexOf('#')))) continue
          if (!this.queued.delete(id)) continue
          const run = this.runners.get(id)
          if (!run || (failure && isWatchRunner(id))) continue
          this.trace.push(id)
          this.runs.set(id, (this.runs.get(id) ?? 0) + 1)
          if (this.devtools) console.debug('[shikiform]', id)
          try {
            run()
          } catch (error) {
            if (!isReactionId(id)) throw failure ? failure.error : error
            // Other derivations still need to see this edit, including downstream waves.
            failure ??= { error }
          }
        }
      }
      if (failure) throw failure.error
    } finally {
      this.queued.clear()
      this.dirtyDeps.clear()
      this.structureOnlyDeps.clear()
      for (const path of this.consumedDirtyRows) this.dirtyRows.delete(path)
      this.consumedDirtyRows.clear()
      for (const path of this.consumedDirtyPos) this.dirtyPos.delete(path)
      this.consumedDirtyPos.clear()
      this.flushing = false
      this.onSettle?.()
      this.notifier.emit()
    }
  }
}
/** This development diagnostic can be removed when its guarded call is folded out. */
export function assertNotWritten(scheduler: Scheduler, path: string, draftKey: string): void {
  const state = WRITTEN_STATE[draftKey]
  if (!state) return
  const tracker = scheduler.current()
  let written = false
  scheduler.writes.project(path, (op, at) => { written ||= op.key === `${at}:${state}` })
  if (!written) return
  const shown = `${showDraftPath(path)}.${draftKey}`
  const where = tracker?.recordWrites ? (isReactionId(tracker.id) ? 'reaction' : 'watch') : 'batch'
  throw new ShikiUsageError(
    `Read ${shown} after writing it in the same ${where}. ` +
      `Writes are buffered until the pass returns, so this read sees the old value. ` +
      `Keep the new value in a local: const next = …; ${shown} = next; then use next.`,
  )
}

/** These form actions escape a reaction's write buffer. */
export function guardReactionAction(scheduler: Scheduler, action: 'reset' | 'submit'): boolean {
  const tracker = scheduler.current()
  if (!tracker?.recordWrites || !isReactionId(tracker.id)) return false
  if (process.env.NODE_ENV !== 'production') {
    throw new ShikiUsageError(
      `form.${action}() runs inside a reaction. Write field values through the draft or move the action to a watch.`,
    )
  }
  return true
}

function isObjectEntry(id: string): boolean {
  return /^each:\d+@/.test(id)
}

function list(items: string[]): string {
  return items.length > 4 ? `${items.slice(0, 4).join(', ')} +${items.length - 4} more` : items.join(', ')
}
