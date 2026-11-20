/**
 * Pending `$value` / `$enum` / `$rules` writes inside one reaction, watch, or batch.
 *
 * The draft's next read has to see earlier writes in the same pass (`push` twice, or
 * `user.name = 'a'` then `user.city = 'b'` on one object). UI props replay through `FieldUi`.
 * These tags ride on the buffered `WriteOp` so value reads can do the same without applying early.
 *
 * Structural reads (array `push` / `splice` / `delete`) ignore cell writes. Applying those with
 * `setIn` would copy every row, and the following array commit would treat the copies as new rows.
 * {@link orderBufferedWrites} applies the array op first and the cell writes after, so either order in
 * the effect keeps the cell. A splice / sort / reverse moves indexes, so each cell records the element
 * it addressed and is retargeted (or dropped, when that element was removed) before it lands.
 */

import type { WriteOp } from '../types'
import { arrayIndex, hasArrayIndex } from '../shared/dense-array'
import { getAt } from '../shared/path'
import { DELETE, setIn } from './patch'

/** One array index a cell write addressed, outermost array first. */
export interface CellAnchor {
  /** Path of the array, as written (`orders.0.lines`). */
  array: string
  /** Segment index of this array's index inside the full field path. */
  at: number
  index: number
  /** Element at `index` when the cell was written. */
  slot: unknown
  /** Structural array `slot` was read from. */
  list: readonly unknown[]
}

export type PendingValue = {
  kind: 'value'
  path: string
  mode: 'set' | 'mutate' | 'delete'
  value?: unknown
  /** Set on a cell write. */
  anchors?: readonly CellAnchor[]
  /** The element this cell addressed was removed by the array op. Skip the write. */
  drop?: boolean
  /** Array a mutate copied from. Distinguishes a later splice of the same list from a reused path. */
  base?: readonly unknown[]
}

export type PendingEnum = { kind: 'enum'; path: string; value: unknown }
export type PendingRules = { kind: 'rules'; path: string; value: unknown }
export type Pending = PendingValue | PendingEnum | PendingRules

const tags = new WeakMap<WriteOp, Pending>()

export function tagPending(op: WriteOp, pending: Pending): void {
  tags.set(op, pending)
}

export function pendingOf(op: WriteOp): Pending | undefined {
  return tags.get(op)
}

export function joinKeys(base: string, keys: readonly string[]): string {
  if (!keys.length) return base
  const extra = keys.join('.')
  return base ? `${base}.${extra}` : extra
}

function isUnder(parent: string, path: string): boolean {
  if (path === parent) return false
  if (!parent) return path.length > 0
  return path.startsWith(parent + '.')
}

function relative(parent: string, path: string): string[] {
  const rest = parent ? path.slice(parent.length + 1) : path
  return rest ? rest.split('.') : []
}

/** The array a pending mutate will commit at `path`, if this pass has one. */
export function latestMutate(ops: readonly WriteOp[], path: string): unknown[] | undefined {
  let found: unknown[] | undefined
  for (const op of ops) {
    const effect = tags.get(op)
    if (effect?.kind === 'value' && effect.mode === 'mutate' && effect.path === path && Array.isArray(effect.value)) {
      found = effect.value
    }
  }
  return found
}

/**
 * `path`'s value with this pass's value writes applied. `structural` skips cell edits.
 * Cells are applied after array mutates and at the index of the element they addressed, matching commit.
 */
export function projectValue(base: unknown, basePath: string, ops: readonly WriteOp[], structural: boolean): unknown {
  const ordered = ops.length ? orderBufferedWrites(ops) : ops
  let value = base
  for (const op of ordered) {
    const effect = tags.get(op)
    if (!effect || effect.kind !== 'value') continue
    if (effect.path === basePath) {
      if (effect.mode === 'delete') {
        if (!structural) value = undefined
        continue
      }
      if (structural && effect.mode === 'set' && !Array.isArray(effect.value)) continue
      value = effect.value
      continue
    }
    if (isUnder(basePath, effect.path)) {
      // A structural read of the parent keeps the stored row objects. Nested array ops commit on
      // their own path (retargeted after the parent moves), so folding them in here would copy the
      // row and the parent op would treat it as a new identity.
      if (structural) continue
      const keys = relative(basePath, effect.path)
      if (!keys.length) continue
      value = setIn(value ?? numericBase(keys), keys, effect.mode === 'delete' ? DELETE : effect.value)
      continue
    }
    if (isUnder(effect.path, basePath) && effect.mode !== 'delete') {
      value = getAt(effect.value, relative(effect.path, basePath).join('.'))
    }
  }
  return value
}

function numericBase(keys: string[]): unknown {
  return /^\d+$/.test(keys[0] ?? '') ? [] : {}
}

/** The latest buffered `$enum` assignment at `path`, or `undefined` when this pass has not written it. */
export function pendingEnum(ops: readonly WriteOp[], path: string): { hit: true; value: unknown } | undefined {
  let found: { hit: true; value: unknown } | undefined
  for (const op of ops) {
    const effect = tags.get(op)
    if (effect?.kind === 'enum' && effect.path === path) found = { hit: true, value: effect.value }
  }
  return found
}

/**
 * Array mutates, including a hole from `delete`, commit before `$value` writes under that array.
 * A cell edit and a `push` in the same pass then both survive, whichever was written first.
 * Relative order of everything else is kept.
 */
export function orderBufferedWrites(ops: readonly WriteOp[]): WriteOp[] {
  retargetShiftedCells(ops)
  retargetNestedMutates(ops)
  const live = ops.filter((op) => !isDropped(op))
  const mutatePaths: string[] = []
  for (const op of live) {
    const pending = tags.get(op)
    if (pending?.kind === 'value' && pending.mode === 'mutate') mutatePaths.push(pending.path)
  }
  if (!mutatePaths.length) return live
  const early: WriteOp[] = []
  const cells: WriteOp[] = []
  for (const op of live) {
    const pending = tags.get(op)
    const underMutate = pending?.kind === 'value'
      && pending.mode !== 'mutate'
      && mutatePaths.some((path) => pending.path.startsWith(path + '.'))
    if (underMutate) cells.push(op)
    else early.push(op)
  }
  early.sort(ancestorMutateFirst)
  return cells.length ? [...early, ...cells] : early
}

/** A parent array mutate lands before a nested array mutate, whichever was written first. */
function ancestorMutateFirst(a: WriteOp, b: WriteOp): number {
  const left = tags.get(a)
  const right = tags.get(b)
  if (left?.kind !== 'value' || right?.kind !== 'value' || left.mode !== 'mutate' || right.mode !== 'mutate') return 0
  if (right.path.startsWith(left.path + '.')) return -1
  if (left.path.startsWith(right.path + '.')) return 1
  return 0
}

function isDropped(op: WriteOp): boolean {
  const pending = tags.get(op)
  return pending?.kind === 'value' && pending.drop === true
}

interface MutateNext {
  next: readonly unknown[]
  base?: readonly unknown[]
}

/**
 * Point each cell at the element it addressed. Array ops run first and change indexes;
 * the path recorded at the write (`rows.0.name`) would otherwise hit whatever sits there afterwards.
 * An element a splice / delete removed is dropped. A path reused by a different array (a nested list
 * whose parent row moved) is left for the outer anchor to retarget.
 */
function retargetShiftedCells(ops: readonly WriteOp[]): void {
  const mutates = new Map<string, MutateNext>()
  for (const op of ops) {
    const pending = tags.get(op)
    if (pending?.kind === 'value' && pending.mode === 'mutate' && Array.isArray(pending.value)) {
      mutates.set(pending.path, { next: pending.value, base: pending.base })
    }
  }
  if (mutates.size === 0) return
  for (const op of ops) {
    const pending = tags.get(op)
    if (!pending || pending.kind !== 'value' || pending.mode === 'mutate' || !pending.anchors?.length) continue
    pending.drop = false
    let path = pending.path
    for (const anchor of pending.anchors) {
      const spec = mutates.get(anchor.array)
      if (!spec) continue
      const at = locateSlot(spec.next, anchor)
      if (at !== undefined) {
        if (at !== anchor.index) path = replaceSegment(path, anchor.at, at)
        continue
      }
      const sameList = spec.base === anchor.list || relatedArrays(anchor.list, spec.next)
      if (sameList) {
        pending.drop = true
        break
      }
    }
    if (pending.drop || path === pending.path) continue
    pending.path = path
    op.key = `${path}:value`
  }
}

/**
 * A nested array op records the index it saw (`orders.0.lines`). When a parent array op in the same
 * pass moves that row, commit the nested op at the row's new index. Parent ops run first
 * ({@link ancestorMutateFirst}) and keep the original row objects, so the nested array is found by reference.
 */
function retargetNestedMutates(ops: readonly WriteOp[]): void {
  const specs = new Map<string, { op: WriteOp; pending: PendingValue; next: readonly unknown[] }>()
  for (const op of ops) {
    const pending = tags.get(op)
    if (pending?.kind === 'value' && pending.mode === 'mutate' && Array.isArray(pending.value)) {
      specs.set(pending.path, { op, pending, next: pending.value })
    }
  }
  if (specs.size < 2) return
  for (const path of [...specs.keys()].sort((a, b) => a.length - b.length)) {
    const spec = specs.get(path)
    if (!spec?.pending.base) continue
    let ancestor = ''
    for (const other of specs.keys()) {
      if (path.startsWith(other + '.') && other.length > ancestor.length) ancestor = other
    }
    if (!ancestor) continue
    const parent = specs.get(ancestor)
    if (!parent) continue
    const at = ancestor.split('.').length
    const held = indexHolding(parent.next, spec.pending.base)
    if (held === undefined) continue
    const current = arrayIndex(path.split('.')[at] ?? '')
    if (current === undefined || held === current) continue
    rewriteMutatePrefix(specs, path, replaceSegment(path, at, held))
  }
}

function rewriteMutatePrefix(
  specs: Map<string, { op: WriteOp; pending: PendingValue; next: readonly unknown[] }>,
  from: string,
  to: string,
): void {
  for (const path of [...specs.keys()]) {
    if (path !== from && !path.startsWith(from + '.')) continue
    const spec = specs.get(path)
    if (!spec) continue
    specs.delete(path)
    const next = path === from ? to : to + path.slice(from.length)
    spec.pending.path = next
    spec.op.key = `${next}:value`
    specs.set(next, spec)
  }
}

function indexHolding(rows: readonly unknown[], target: readonly unknown[]): number | undefined {
  let found: number | undefined
  let count = 0
  for (let i = 0; i < rows.length; i++) {
    if (!hasArrayIndex(rows, i) || !containsRef(rows[i], target)) continue
    count += 1
    found = i
    if (count > 1) return undefined
  }
  return found
}

function containsRef(node: unknown, target: object, seen = new Set<object>()): boolean {
  if (node === target) return true
  if (!node || typeof node !== 'object' || seen.has(node)) return false
  seen.add(node)
  if (Array.isArray(node)) {
    for (let i = 0; i < node.length; i++) {
      if (hasArrayIndex(node, i) && containsRef(node[i], target, seen)) return true
    }
    return false
  }
  const proto = Object.getPrototypeOf(node)
  if (proto !== Object.prototype && proto !== null) return false
  for (const key of Object.keys(node as Record<string, unknown>)) {
    if (containsRef((node as Record<string, unknown>)[key], target, seen)) return true
  }
  return false
}

function locateSlot(next: readonly unknown[], anchor: CellAnchor): number | undefined {
  if (hasArrayIndex(next, anchor.index) && Object.is(next[anchor.index], anchor.slot)) return anchor.index
  let count = 0
  let first = -1
  for (let i = 0; i < next.length; i++) {
    if (!hasArrayIndex(next, i) || !Object.is(next[i], anchor.slot)) continue
    count += 1
    if (first < 0) first = i
  }
  if (count === 1) return first
  if (count === 0) return undefined
  // The same object twice: the first survivor keeps the identity. Duplicate primitives stay on the written index.
  if (anchor.slot !== null && typeof anchor.slot === 'object') return first
  return anchor.index
}

/** `next` still holds an element of `list` (a splice / sort of it), or removed every element. */
function relatedArrays(list: readonly unknown[], next: readonly unknown[]): boolean {
  if (next.length === 0) return true
  for (let i = 0; i < next.length; i++) {
    if (!hasArrayIndex(next, i)) continue
    const item = next[i]
    for (let j = 0; j < list.length; j++) {
      if (hasArrayIndex(list, j) && Object.is(list[j], item)) return true
    }
  }
  return false
}

function replaceSegment(path: string, at: number, index: number): string {
  const parts = path.split('.')
  if (at < 0 || at >= parts.length) return path
  parts[at] = String(index)
  return parts.join('.')
}

/** The latest buffered `$rules` assignment at `path`. */
export function pendingRules(ops: readonly WriteOp[], path: string): unknown[] | undefined {
  let found: unknown[] | undefined
  for (const op of ops) {
    const effect = tags.get(op)
    if (effect?.kind === 'rules' && effect.path === path && Array.isArray(effect.value)) found = effect.value
  }
  return found
}
