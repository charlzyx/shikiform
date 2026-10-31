import { ShikiConflictError, ShikiCycleError, ShikiUsageError, showDraftPath } from '../errors'
import { parentPath } from '../shared/path'
import type { Notifier } from '../state/notifier'
import type { Pos } from '../shared/tree-ops'
import type { Draft, WriteOp } from '../types'

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

/** Bookkeeping for one `reaction.each` / `reaction.walk` installation. */
export interface EachRec {
  kind: 'each' | 'walk' | 'watch-each'
  select: (d: Draft<any>) => unknown
  effect: Function
  arrayPath: string
  childrenKey: string
  instances: Set<string>
  first: boolean
}

export interface RunOptions {
  id: string
  deps: boolean
  writes: boolean
  pos?: Pos
  nodePath?: string
}

/** Draft key → the write-op state it would read back. */
const WRITTEN_STATE: Record<string, string> = {
  $value: 'value',
  $visible: 'display',
  $display: 'display',
  $pattern: 'pattern',
  $disabled: 'pattern',
  $required: 'required',
  $enum: 'enum',
  $rules: 'rules',
}

const REACTION_PREFIX = /^(reaction|each|walk):/

/** Ids of derivations (`reaction`, `each`, `walk`). Watches and selectors are not derivations. */
export function isReactionId(id: string): boolean {
  return REACTION_PREFIX.test(id)
}

/**
 * Dependency tracking and the reaction / watch run loop.
 *
 * A dep key is `path:state` (`rows.0.cost:value`, `:meta`, `@ui:path#name:display`).
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
  private queued = new Set<string>()
  /** Keys changed since the last enqueue. */
  readonly dirtyDeps = new Set<string>()
  /** Array path → row indexes whose occupant changed. Consumed by `reaction.each`. */
  readonly dirtyRows = new Map<string, Set<number> | 'all'>()
  /** Tree path → `posKey`s whose occupant changed. Consumed by `reaction.walk`. */
  readonly dirtyPos = new Map<string, Set<string> | 'all'>()
  readonly eachRecs = new Map<string, EachRec>()
  readonly stack: Tracker[] = []
  flushing = false
  batchDepth = 0
  readonly batchOps: WriteOp[] = []
  private seq = 0
  private trace: string[] = []
  /** Runs once a flush settles, before notifications go out. The engine re-derives `dirty` here. */
  onSettle?: () => void

  constructor(private readonly notifier: Notifier, devtools = false) {
    this.devtools = devtools
  }

  nextId(prefix: string): string {
    this.seq += 1
    return `${prefix}:${this.seq}`
  }

  current(): Tracker | undefined {
    return this.stack.at(-1)
  }

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
        throw new Error('reaction and watch must be synchronous. Put async work in an Enum loader or a watch that only starts it.')
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
   * Development guard: reading a `$` state this reaction / watch already wrote in the same pass sees the old value
   * (writes are buffered until the pass returns). UI state (`$title`, `$componentProps`, …) is exempt: it replays.
   */
  assertNotWritten(path: string, draftKey: string): void {
    const tracker = this.stack.at(-1)
    if (!tracker?.recordWrites || !tracker.writes.length) return
    const state = WRITTEN_STATE[draftKey]
    if (!state) return
    const key = `${path}:${state}`
    if (!tracker.writes.some((op) => op.key === key)) return
    const shown = `${showDraftPath(path)}.${draftKey}`
    throw new ShikiUsageError(
      `Read ${shown} after writing it in the same ${isReactionId(tracker.id) ? 'reaction' : 'watch'}. ` +
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

  /** Record reads on `path` and every ancestor (inherited states: display, pattern). */
  trackChain(path: string, state: string): void {
    let cursor: string | null = path
    while (cursor) {
      this.track(cursor, state)
      cursor = parentPath(cursor)
    }
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
    this.setDeps(id, new Set())
    this.runners.delete(id)
  }

  /** Every dep key some runner currently reads. */
  depKeys(): IterableIterator<string> {
    return this.depIndex.keys()
  }

  applyWrites(id: string, writes: WriteOp[]): void {
    for (const op of writes) {
      op.apply()
      this.claimOwner(id, op.key)
    }
    this.enqueueFromDirty()
  }

  /** Two different reactions writing the same key is a dev error. Watches may share keys. */
  private claimOwner(id: string, key: string): void {
    if (!isReactionId(id)) return
    const owner = this.writeOwners.get(key)
    if (owner && owner !== id && process.env.NODE_ENV !== 'production') {
      throw new ShikiConflictError(key, owner, id)
    }
    this.writeOwners.set(key, id)
  }

  markDirty(dep: string): void {
    this.dirtyDeps.add(dep)
  }

  /** Bump the structure version of `path` and dirty `:structure` on it and its ancestors. */
  markStructure(path: string): void {
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

  flush(): void {
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
      this.onSettle?.()
      this.notifier.emit()
    }
  }
}
