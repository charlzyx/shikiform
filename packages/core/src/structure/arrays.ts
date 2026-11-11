import { unwrapReadonly } from '../draft/readonly'
import type { Declarations } from '../declarations/declarations'
import type { Scheduler } from '../effects/scheduler'
import { getAt, joinPath, parentPath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { Validator } from '../validation/validator'
import { reindexById } from './migrate'
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
   * A value write rebuilt the objects on its path (immutable `setAt`). Rows of registered arrays above the
   * written path are new objects with the same occupant: hand their identity to the new object, so an
   * id-less row keeps its render key (and its selection / expansion) after a cell edit.
   */
  carryIdentity(writtenPath: string, before: unknown, after: unknown): void {
    for (const path of this.arrays.keys()) {
      if (!writtenPath.startsWith(path + '.')) continue
      const index = Number(writtenPath.slice(path.length + 1).split('.')[0])
      if (!Number.isInteger(index)) continue
      const oldRow = getAt(before, joinPath(path, String(index)))
      const newRow = getAt(after, joinPath(path, String(index)))
      if (oldRow === newRow || !oldRow || !newRow || typeof oldRow !== 'object' || typeof newRow !== 'object') continue
      const id = this.ident.get(oldRow)
      if (id && !this.ident.has(newRow)) this.ident.set(newRow, id)
    }
  }

  /** Row keys for rendering. Uses `rowKey` or `id` when present, otherwise a stable object identity. */
  keys(path: string, rowKey?: string): { key: string; index: number }[] {
    return this.store.arrayOf(path).map((row, index) => ({ key: this.rowIdent(row, index, rowKey ?? this.arrays.get(path)?.rowKey), index }))
  }

  move(path: string, from: number, to: number): void {
    const before = this.store.arrayOf(path)
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
    this.commit(path, before, next, dirty)
  }

  swap(path: string, indexA: number, indexB: number): void {
    const before = this.store.arrayOf(path)
    if (indexA === indexB || indexA < 0 || indexB < 0 || indexA >= before.length || indexB >= before.length) return
    const next = before.slice()
    const tmp = next[indexA]
    next[indexA] = next[indexB]
    next[indexB] = tmp
    this.commit(path, before, next, new Set([indexA, indexB]))
  }

  replace(path: string, index: number, row: unknown): void {
    const before = this.store.arrayOf(path)
    if (index < 0 || index >= before.length) return
    const next = before.slice()
    next[index] = row
    this.commit(path, before, next, new Set([index]))
  }

  insert(path: string, index: number, row: unknown): void {
    const before = this.store.arrayOf(path)
    const at = Math.min(Math.max(index, 0), before.length)
    const next = before.slice()
    next.splice(at, 0, row)
    this.commit(path, before, next, new Set(Array.from({ length: next.length - at }, (_, i) => at + i)))
  }

  remove(path: string, index: number): void {
    const before = this.store.arrayOf(path)
    if (index < 0 || index >= before.length) return
    const next = before.slice()
    next.splice(index, 1)
    const dirty = new Set<number>()
    for (let i = index; i < next.length; i++) dirty.add(i)
    this.commit(path, before, next, dirty)
  }

  push(path: string, row: unknown): void {
    const before = this.store.arrayOf(path)
    this.commit(path, before, [...before, row], new Set([before.length]))
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

  private commit(path: string, before: any[], next: any[], dirty: Set<number>): void {
    // Development: a row taken from a reaction's `$value` is a read-only view; store plain data.
    if (process.env.NODE_ENV !== 'production') next = unwrapReadonly(next)
    const { store, scheduler } = this
    const rowKey = this.arrays.get(path)?.rowKey
    const oldIds = new Map<string, string>()
    before.forEach((row, index) => oldIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    const newIds = new Map<string, string>()
    next.forEach((row, index) => newIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    store.onReindex?.(reindexById(store.fields, oldIds, newIds))
    store.onReindexIds?.(oldIds, newIds)
    store.values = setAt(store.values, path, next)
    scheduler.dirtyRows.set(path, dirty)
    scheduler.markStructure(path)
    // The array value itself changed: wake readers of `$value` on it and its ancestors (useWatch, reactions).
    // Row-level deps stay on dirtyRows, so `each` instances whose occupant did not change still skip.
    for (let cursor: string | null = path; cursor; cursor = parentPath(cursor)) scheduler.markDirty(`${cursor}:value`)
    scheduler.markDirty(':value')
    this.declarations.applyItemTemplates()
    scheduler.enqueueFromDirty()
    scheduler.flush()
    // A shown array-level error is re-checked now, the way a shown field error is re-checked on edit.
    // Only this path: descendants wait for the next submit, so the new row stays quiet.
    this.validator.recheckOwn(path)
  }
}
