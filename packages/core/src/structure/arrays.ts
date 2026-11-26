import { copyData } from '../draft/plain-clone'
import { peelReadonly } from '../draft/readonly'
import type { Declarations } from '../declarations/declarations'
import type { Scheduler } from '../effects/scheduler'
import { ShikiUsageError, showDraftPath } from '../errors'
import { getAt, joinPath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { WriteOp } from '../types'
import type { Validator } from '../validation/validator'
import { movedFieldPaths, priorRowPath, reindexById, type RowTransition } from './migrate'
import { readRowId } from '../shared/tree-ops'

/**
 * Array row operations. Every op computes the next array, migrates field models by row id,
 * marks the indexes whose occupant changed (for `reaction.each`), bumps the structure version,
 * re-expands item templates, and flushes once.
 */
export class ArrayOps {
  private arrays = new Map<string, { rowKey?: string }>()
  private ident = new WeakMap<object, string>()
  private identN = 0
  private readonly mutators = new WeakMap<WriteOp, { path: string; before: unknown[] }>()

  constructor(
    private readonly store: FieldStore<any>,
    private readonly scheduler: Scheduler,
    private readonly declarations: Declarations,
    private readonly validator: Validator,
  ) {}

  register(path: string, rowKey?: string): void {
    this.arrays.set(path, { rowKey })
  }

  rowKey(path: string): string | undefined {
    return this.arrays.get(path)?.rowKey
  }

  /**
   * Immutable writes rebuild ancestors. Carry an observed row's identity to its copy along this path.
   */
  carryIdentity(writtenPath: string, before: unknown, after: unknown): void {
    let oldNode = before
    let newNode = after
    for (const segment of writtenPath.split('.')) {
      if (!oldNode || !newNode || typeof oldNode !== 'object' || typeof newNode !== 'object') break
      const wasArray = Array.isArray(oldNode)
      oldNode = (oldNode as Record<string, unknown>)[segment]
      newNode = (newNode as Record<string, unknown>)[segment]
      if (!wasArray || !oldNode || !newNode || typeof oldNode !== 'object' || typeof newNode !== 'object') continue
      if (!this.ident.has(newNode)) this.ident.set(newNode, this.objectIdentity(oldNode))
    }
  }

  /** Row keys for rendering. Uses `rowKey` or `id` when present, otherwise a stable object identity. */
  keys(path: string, rowKey?: string): { key: string; index: number }[] {
    return this.store.arrayOf(path).map((row, index) => ({ key: this.rowIdent(row, index, rowKey ?? this.arrays.get(path)?.rowKey), index }))
  }

  private arrayForEdit(path: string): unknown[] | undefined {
    const value = getAt(this.scheduler.writes.values(this.store.values), path)
    if (Array.isArray(value)) return value
    if (value == null) return []
    if (process.env.NODE_ENV !== 'production') {
      throw new ShikiUsageError(`Cannot edit rows at ${showDraftPath(path)}: the current value is not an array. Restore an array before calling row operations.`)
    }
    return undefined
  }

  move(path: string, from: number, to: number): void {
    const before = this.arrayForEdit(path)
    if (!before || from === to || from < 0 || from >= before.length) return
    const next = before.slice()
    const [row] = next.splice(from, 1)
    const dest = Math.min(Math.max(to, 0), next.length)
    next.splice(dest, 0, row)
    this.commit(path, before, next, this.changedRows(path, before, next))
  }

  swap(path: string, indexA: number, indexB: number): void {
    const before = this.arrayForEdit(path)
    if (!before || indexA === indexB || indexA < 0 || indexB < 0 || indexA >= before.length || indexB >= before.length) return
    const next = before.slice()
    const tmp = next[indexA]
    next[indexA] = next[indexB]
    next[indexB] = tmp
    this.commit(path, before, next, new Set([indexA, indexB]))
  }

  replace(path: string, index: number, row: unknown): void {
    const before = this.arrayForEdit(path)
    if (!before || index < 0 || index >= before.length) return
    const next = before.slice()
    next[index] = copyData(row)
    this.commit(path, before, next, new Set([index]))
  }

  insert(path: string, index: number, row: unknown): void {
    const before = this.arrayForEdit(path)
    if (!before) return
    const at = Math.min(Math.max(index, 0), before.length)
    const next = before.slice()
    next.splice(at, 0, copyData(row))
    this.commit(path, before, next, new Set(Array.from({ length: next.length - at }, (_, i) => at + i)))
  }

  remove(path: string, index: number): void {
    const before = this.arrayForEdit(path)
    if (!before || index < 0 || index >= before.length) return
    const next = before.slice()
    next.splice(index, 1)
    const dirty = new Set<number>()
    for (let i = index; i < next.length; i++) dirty.add(i)
    this.commit(path, before, next, dirty)
  }

  push(path: string, row: unknown): void {
    const before = this.arrayForEdit(path)
    if (!before) return
    this.commit(path, before, [...before, copyData(row)], new Set([before.length]))
  }

  /**
   * Commit an array produced by a draft mutator (`push`, `splice`, `sort`, a hole from `delete`).
   * Rows already in `before` keep their object identity so field models follow them. New objects are copied.
   * The same object in a second slot is copied too, so one reference is not two row identities.
   * Indexes whose occupant changed are the only `dirtyRows`. A no-op (same elements, same holes) writes nothing.
   */
  commitNext(path: string, next: unknown[]): boolean {
    const before = this.arrayForEdit(path)
    if (!before || sameSlots(before, next)) return false
    const previous = this.scheduler.writes.pending.at(-1)
    const priorMutation = previous && this.mutators.get(previous)
    const first = priorMutation?.path === path ? priorMutation.before : before
    const stored = next.slice()
    const known = new Set<object>()
    for (const row of first) if (row && typeof row === 'object') known.add(row)
    if (first !== before) for (const row of before) if (row && typeof row === 'object') known.add(row)
    // A row already in `before` keeps its object. The same object in a second slot is a copy:
    // one reference cannot be two row identities, and a later edit of one slot must not change the other.
    const seen = new Set<object>()
    for (let i = 0; i < stored.length; i++) {
      if (!Object.prototype.hasOwnProperty.call(stored, i)) continue
      const row = stored[i]
      if (!row || typeof row !== 'object') continue
      if (seen.has(row) || !known.has(row)) stored[i] = copyData(row)
      seen.add(row)
    }
    this.commit(path, first, stored, this.changedRows(path, first, stored), priorMutation?.path === path ? previous : undefined, true)
    return true
  }

  rowIdent(row: unknown, index: number, rowKey?: string): string {
    // A row read through `getValue` / `form.values` is a view. Identity is stored on the underlying object.
    if (process.env.NODE_ENV !== 'production') row = peelReadonly(row)
    const named = readRowId(row, index, rowKey)
    if (!named.startsWith('#')) return named
    return row && typeof row === 'object' ? this.objectIdentity(row) : named
  }

  private objectIdentity(row: object): string {
    let id = this.ident.get(row)
    if (!id) {
      id = `obj${++this.identN}`
      this.ident.set(row, id)
    }
    return id
  }

  private changedRows(path: string, before: unknown[], after: unknown[]): Set<number> {
    const rowKey = this.arrays.get(path)?.rowKey
    const dirty = new Set<number>()
    for (let i = 0; i < after.length; i++) {
      if (Object.hasOwn(before, i) !== Object.hasOwn(after, i)) dirty.add(i)
      else if (!Object.is(before[i], after[i])) {
        const row = after[i]
        if (!row || typeof row !== 'object' || this.rowIdent(before[i], i, rowKey) !== this.rowIdent(row, i, rowKey)) dirty.add(i)
      }
    }
    return dirty
  }

  private commit(path: string, before: any[], next: any[], dirty: Set<number>, previous?: WriteOp, mutator = false): void {
    const { store, scheduler } = this
    if (!scheduler.writes.recording) {
      this.apply(path, before, next, dirty)
      return
    }
    const root = scheduler.writes.values(store.values)
    const after = setAt(root, path, next)
    const transition = this.rowTransition(path, before, next)
    this.carryIdentity(path, root, after)
    const op: WriteOp = {
      key: `${path}:value`,
      apply: () => {
        if (mutator && sameSlots(before, next)) return false
        this.apply(path, before, next, dirty, store.values === root ? after : undefined, transition)
        return true
      },
    }
    if (mutator) this.mutators.set(op, { path, before })
    scheduler.writes.stageValue(after, op, { previous, priorPath: priorRowPath(transition) })
  }

  private rowTransition(path: string, before: unknown[], next: unknown[]): RowTransition {
    const rowKey = this.arrays.get(path)?.rowKey
    const identify = (rows: unknown[]) => {
      const ids = new Map<string, string>()
      rows.forEach((row, index) => ids.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
      return ids
    }
    let ids: ReturnType<RowTransition> | undefined
    return () => ids ??= [identify(before), identify(next)]
  }

  private apply(path: string, before: any[], next: any[], dirty: Set<number>, after?: any, transition = this.rowTransition(path, before, next)): void {
    const { store, scheduler } = this
    const [oldIds, newIds] = transition()
    // Queue row-relative value edits while their readers still use the pre-move paths.
    if (scheduler.valueCommit) scheduler.enqueueFromDirty()
    const reindexed = reindexById(store.fields, oldIds, newIds)
    const moved = movedFieldPaths(reindexed)
    store.onReindex?.(reindexed, oldIds, newIds)
    scheduler.reindexRows(oldIds, newIds)
    store.onReindexIds?.(oldIds, newIds)
    const previous = store.values
    store.values = after ?? setAt(previous, path, next)
    this.carryIdentity(path, previous, store.values)
    const commit = scheduler.valueCommit
    if (!commit) scheduler.markDirtyRows(path, dirty)
    else if (!commit.structures.has(path)) {
      commit.structures.add(path)
      const start = getAt(commit.before, path)
      const end = getAt(commit.after, path)
      scheduler.markDirtyRows(path, this.changedRows(path, Array.isArray(start) ? start : [], Array.isArray(end) ? end : []))
    }
    scheduler.markStructure(path, previous, store.values)
    scheduler.markValueChanged(path, { before: previous, after: store.values, moved })
    this.declarations.applyItemTemplates()
    // A later operation in this batch can install the array's first rule on this model.
    const field = store.get(path) ?? (commit ? store.ensure(path) : undefined)
    scheduler.enqueueFromDirty()
    scheduler.flush()
    // A shown array-level error is re-checked now, the way a shown field error is re-checked on edit.
    // Only this path: descendants wait for the next submit, so the new row stays quiet.
    if (field) this.validator.queueEdit(field, 'own')
  }
}

function sameSlots(before: readonly unknown[], after: readonly unknown[]): boolean {
  if (before.length !== after.length) return false
  for (let i = 0; i < before.length; i++) {
    if (Object.hasOwn(before, i) !== Object.hasOwn(after, i) || !Object.is(before[i], after[i])) return false
  }
  return true
}
