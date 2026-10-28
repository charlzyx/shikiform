import type { Declarations } from '../declarations/declarations'
import type { Scheduler } from '../effects/scheduler'
import { joinPath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import { reindexById } from './migrate'
import { readRowId } from './tree-ops'

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
  ) {}

  register(path: string, rowKey?: string): void {
    this.arrays.set(path, { rowKey })
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
    const { store, scheduler } = this
    const rowKey = this.arrays.get(path)?.rowKey
    const oldIds = new Map<string, string>()
    before.forEach((row, index) => oldIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    const newIds = new Map<string, string>()
    next.forEach((row, index) => newIds.set(this.rowIdent(row, index, rowKey), joinPath(path, String(index))))
    reindexById(store.fields, oldIds, newIds)
    store.values = setAt(store.values, path, next)
    scheduler.dirtyRows.set(path, dirty)
    scheduler.markStructure(path)
    this.declarations.applyItemTemplates()
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }
}
