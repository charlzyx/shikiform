import { orderBufferedWrites } from '../draft/pending'
import { ShikiConflictError, ShikiCycleError, ShikiUsageError, showDraftPath, showStateKey } from '../errors'
import { deepEqual } from '../shared/equal'
import { getAt, parentPath, selfAndAncestors } from '../shared/path'
import type { Notifier } from '../state/notifier'
import type { Pos } from '../shared/tree-ops'
import type { WriteOp } from '../types'

/** One running reaction / watch / selector. Reads become deps, writes are buffered. */
export interface Tracker {
  id: string
  recordDeps: boolean
  recordWrites: boolean
  deps: Set<string>
  writes: WriteOp[]
  pos?: Pos
  nodePath?: string
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
  private writeOwners = new Map<string, string>()
  /** All keys claimed over the lifetime of a disposable each instance (development only). */
  private ownedByInstance = new Map<string, Set<string>>()
  private queued = new Set<string>()
  /** Keys changed since the last enqueue. */
  readonly dirtyDeps = new Set<string>()
  /** Array path → row indexes whose occupant changed. Consumed by `reaction.each` (the root and nested arrays). */
  readonly dirtyRows = new Map<string, Set<number> | 'all'>()
  /** Tree path → `posKey`s whose occupant changed. Consumed by `reaction.each` on that root. */
  readonly dirtyPos = new Map<string, Set<string> | 'all'>()
  readonly eachRecs = new Map<string, EachRec>()
  readonly stack: Tracker[] = []
  flushing = false
  /** Non-zero while `defineEffects` runs the factory. */
  installDepth = 0
  batchDepth = 0
  readonly batchOps: WriteOp[] = []
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

  beginInstall(): void { this.installDepth += 1 }
  endInstall(): void { this.installDepth -= 1 }

  runWith<S>(opts: RunOptions, fn: () => S): { value: S; deps: Set<string>; writes: WriteOp[] } {
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
        throw new Error('reaction and watch must be synchronous. Put async work in an EnumSource loader or a watch that only starts it.')
      }
      return { value, deps: tracker.deps, writes: tracker.writes }
    } finally {
      this.stack.pop()
    }
  }

  trackOnly<S>(fn: () => S): { value: S; deps: Set<string> } {
    return this.runWith({ id: 'track', deps: true, writes: false }, fn)
  }

  /**
   * Development guard: reading a flag this reaction / watch / batch already wrote in the same pass sees the
   * old value (that write is buffered until the pass returns). `$value`, `$enum`, `$rules`, and UI state replay
   * pending writes, so a second read sees the new value and is not checked here.
   */
  assertNotWritten(path: string, draftKey: string): void {
    const state = WRITTEN_STATE[draftKey]
    if (!state) return
    const tracker = this.stack.at(-1)
    const writes = tracker?.recordWrites ? tracker.writes : this.batchDepth > 0 ? this.batchOps : undefined
    if (!writes?.length) return
    const key = `${path}:${state}`
    if (!writes.some((op) => op.key === key)) return
    const shown = `${showDraftPath(path)}.${draftKey}`
    const where = tracker?.recordWrites ? (isReactionId(tracker.id) ? 'reaction' : 'watch') : 'batch'
    throw new ShikiUsageError(
      `Read ${shown} after writing it in the same ${where}. ` +
        `Writes are buffered until the pass returns, so this read sees the old value. ` +
        `Keep the new value in a local: const next = …; ${shown} = next; then use next.`,
    )
  }

  /** Record a read of `path:state` on the running tracker. */
  track(path: string, state: string): void {
    const tracker = this.stack.at(-1)
    if (!tracker?.recordDeps) return
    tracker.deps.add(`${path}:${state}`)
  }

  /** Record reads on `path`, every ancestor and the root (inherited flags: visible, disabled, readOnly, omit). */
  trackChain(path: string, state: string): void {
    for (const cursor of selfAndAncestors(path)) this.track(cursor, state)
  }

  register(id: string, run: () => void, deps: Set<string>): void {
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
    for (const dep of this.reactionDeps.get(id) ?? []) {
      const subscribers = this.depIndex.get(dep)
      subscribers?.delete(id)
      if (!subscribers?.size) this.depIndex.delete(dep)
    }
    this.reactionDeps.delete(id)
    this.runners.delete(id)
    this.queued.delete(id)
    this.runs.delete(id)
    this.lastWrites.delete(id)
    for (const key of this.ownedByInstance.get(id) ?? []) this.writeOwners.delete(key)
    this.ownedByInstance.delete(id)
  }

  /** Every dep key some runner currently reads. */
  depKeys(): IterableIterator<string> {
    return this.depIndex.keys()
  }

  applyWrites(id: string, writes: WriteOp[]): void {
    // Array mutates (including a hole from `delete`) land before cell `$value` writes under that array,
    // so a name edit and a later `push` in either order both survive. Cells are retargeted to the
    // element they addressed when a splice / sort / reverse moved that index.
    const ordered = orderBufferedWrites(writes)
    if (process.env.NODE_ENV !== 'production' && isReactionId(id)) this.lastWrites.set(id, ordered.map((op) => op.key))
    for (const op of ordered) {
      op.apply()
      this.claimOwner(id, op.key)
    }
    this.enqueueFromDirty()
  }

  /** Buffered `form.batch` ops, in apply order, and clear the buffer. */
  takeBatchOps(): WriteOp[] {
    return orderBufferedWrites(this.batchOps.splice(0))
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
  }

  /** Whole-object writes wake ordinary descendant readers. Object entries keep per-key value precision. */
  markReplaced(dep: string, path: string, before: unknown, after: unknown): void {
    const readers = this.depIndex.get(dep)
    if (readers && [...readers].some(isObjectEntry) && deepEqual(getAt(before, path), getAt(after, path))) {
      for (const id of readers) if (!isObjectEntry(id)) this.queue(id)
      this.notifier.bumpDep(dep)
    } else {
      this.markDirty(dep)
    }
  }

  /** Bump the structure version of `path` and dirty `:structure` on it and its ancestors. */
  markStructure(path: string, before?: unknown, after?: unknown): void {
    // A record selected inside a moved row now belongs to a different occupant.
    if (before !== undefined) {
      for (const [id, rec] of this.eachRecs) {
        if (!rec.path.startsWith(path + '.') || !this.depIndex.get(`${rec.path}:keys`)?.has(id)) continue
        if (getAt(before, rec.path) === getAt(after, rec.path)) continue
        this.queue(id)
        for (const inst of rec.instances) this.queue(inst)
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
      if (subs) for (const id of subs) this.queued.add(id)
      this.notifier.bumpDep(dep)
    }
    this.dirtyDeps.clear()
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
    this.flushing = true
    this.trace = []
    try {
      let wave = 0
      while (this.queued.size) {
        wave += 1
        if (wave > 10) throw this.cycleError()
        const ids = [...this.queued]
        this.queued.clear()
        for (const id of ids) {
          const run = this.runners.get(id)
          if (!run) continue
          this.trace.push(id)
          this.runs.set(id, (this.runs.get(id) ?? 0) + 1)
          if (this.devtools) console.debug('[shikiform]', id)
          run()
        }
      }
    } finally {
      this.flushing = false
      this.onSettle?.()
      this.notifier.emit()
    }
  }
}

function isObjectEntry(id: string): boolean {
  return /^each:\d+@/.test(id)
}

function list(items: string[]): string {
  return items.length > 4 ? `${items.slice(0, 4).join(', ')} +${items.length - 4} more` : items.join(', ')
}
