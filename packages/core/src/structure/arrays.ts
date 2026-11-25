import { copyData } from '../draft/plain-clone'
import { peelReadonly, unwrapReadonly } from '../draft/readonly'
import type { Declarations } from '../declarations/declarations'
import type { Scheduler } from '../effects/scheduler'
import { ShikiUsageError, showDraftPath } from '../errors'
import { deepEqual } from '../shared/equal'
import { joinPath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { Validator } from '../validation/validator'
import { movedFieldPaths, reindexById } from './migrate'
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

  constructor(
    private readonly store: FieldStore<any>,
    private readonly scheduler: Scheduler,
    private readonly declarations: Declarations,
    private readonly validator: Validator,
  ) {}

  register(path: string, rowKey?: string): void {
    this.arrays.set(path, { rowKey })
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
      const id = this.ident.get(oldNode)
      if (id && !this.ident.has(newNode)) this.ident.set(newNode, id)
    }
  }

  /** Row keys for rendering. Uses `rowKey` or `id` when present, otherwise a stable object identity. */
  keys(path: string, rowKey?: string): { key: string; index: number }[] {
    return this.store.arrayOf(path).map((row, index) => ({ key: this.rowIdent(row, index, rowKey ?? this.arrays.get(path)?.rowKey), index }))
  }

  private arrayForEdit(path: string): unknown[] | undefined {
    const value = this.store.getValue(path)
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
    const rowKey = this.arrays.get(path)?.rowKey
    const beforeIds = before.map((item, index) => this.rowIdent(item, index, rowKey))
    const afterIds = next.map((item, index) => this.rowIdent(item, index, rowKey))
    const dirty = new Set<number>()
    for (let i = 0; i < afterIds.length; i++) if (beforeIds[i] !== afterIds[i]) dirty.add(i)
    this.commit(path, before, next, dirty)
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
    if (!before || deepEqual(before, next)) return false
    const stored = next.slice()
    const known = new Set<object>()
    for (let i = 0; i < before.length; i++) {
      const row = before[i]
      if (row && typeof row === 'object') known.add(row)
    }
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
    const rowKey = this.arrays.get(path)?.rowKey
    const beforeIds = occupantIds(this, before, rowKey)
    const afterIds = occupantIds(this, stored, rowKey)
    const dirty = new Set<number>()
    for (let i = 0; i < stored.length; i++) if (beforeIds[i] !== afterIds[i]) dirty.add(i)
    this.commit(path, before, stored, dirty)
    return true
  }

  rowIdent(row: unknown, index: number, rowKey?: string): string {
    // A row read through `getValue` / `form.values` is a view. Identity is stored on the underlying object.
    if (process.env.NODE_ENV !== 'production') row = peelReadonly(row)
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

  private commit(path: string, before: any[], next: any[], dirty: Set<number>): void {
    // Development: a row taken from a reaction's `$value` is a read-only view; store plain data.
    if (process.env.NODE_ENV !== 'production') next = unwrapReadonly(next)
    const { store, scheduler } = this
    const rowKey = this.arrays.get(path)?.rowKey
    const oldIds = new Map<string, string>()
    before.forEach((row, index) => oldIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    const newIds = new Map<string, string>()
    next.forEach((row, index) => newIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    const reindexed = reindexById(store.fields, oldIds, newIds)
    const moved = movedFieldPaths(reindexed)
    store.onReindex?.(reindexed)
    scheduler.reindexWatchRows(oldIds, newIds)
    store.onReindexIds?.(oldIds, newIds)
    const previous = store.values
    store.values = setAt(previous, path, next)
    this.carryIdentity(path, previous, store.values)
    scheduler.markDirtyRows(path, dirty)
    scheduler.markStructure(path, previous, store.values)
    scheduler.markValueChanged(path, { before: previous, after: store.values, moved })
    this.declarations.applyItemTemplates()
    scheduler.enqueueFromDirty()
    scheduler.flush()
    // A shown array-level error is re-checked now, the way a shown field error is re-checked on edit.
    // Only this path: descendants wait for the next submit, so the new row stays quiet.
    scheduler.afterBatch(() => this.validator.recheckOwn(path))
  }
}

function occupantIds(ops: ArrayOps, rows: unknown[], rowKey: string | undefined): (string | undefined)[] {
  const out: (string | undefined)[] = []
  for (let i = 0; i < rows.length; i++) {
    if (!Object.prototype.hasOwnProperty.call(rows, i)) out.push(undefined)
    else out.push(ops.rowIdent(rows[i], i, rowKey))
  }
  return out
}
