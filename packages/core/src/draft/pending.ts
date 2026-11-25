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
import { appendValueKey, getAt, parentPath } from '../shared/path'
import { DELETE, setIn } from './patch'

/** One array index a cell write addressed, outermost array first. */
export interface CellAnchor {
  /** Segment index of this array's index inside the full field path. */
  at: number
  index: number
  /** Element at `index` when the cell was written. */
  slot: unknown
}

export type PendingValue = {
  kind: 'value'
  path: string
  /** Original path at write time, so repeated retargeting (on intermediate reads) stays idempotent. */
  origin?: string
  mode: 'set' | 'mutate' | 'delete'
  value?: unknown
  /** Array rows this write belongs to. */
  anchors?: readonly CellAnchor[]
  /** Base location after a tree edit has committed. Null means its node was removed. */
  treeTarget?: { path: string; anchors?: readonly CellAnchor[] } | null
  /** The element this cell addressed was removed by the array op. Skip the write. */
  drop?: boolean
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

/** Projection can retarget existing ops, so a discarded batch must restore their metadata as well. */
export function saveWriteTargets(ops: readonly WriteOp[]): () => void {
  const targets = ops.flatMap((op) => {
    const pending = tags.get(op)
    return pending?.kind === 'value' ? [{ op, key: op.key, pending, state: { ...pending } }] : []
  })
  return () => {
    let migrated = false
    for (const { op, key, pending, state } of targets) {
      migrated ||= pending.treeTarget !== state.treeTarget
      op.key = key
      pending.path = state.path
      pending.origin = state.origin
      pending.drop = state.drop
    }
    // Tree actions commit immediately, including inside a nested batch that later throws.
    if (migrated) orderBufferedWrites(ops)
  }
}

/** Rebase the same pending writes used by array mutators after an immediate tree commit. */
export function reindexValueWrites(ops: Iterable<WriteOp>, root: string, destinations: ReadonlyMap<string, string | undefined>): void {
  const rootDepth = root ? root.split('.').length : 0
  for (const op of ops) {
    const pending = tags.get(op)
    if (pending?.kind !== 'value' || pending.treeTarget === null) continue
    const path = pending.treeTarget?.path ?? pending.origin ?? pending.path
    let owner: string | null = path
    while (owner && !destinations.has(owner)) owner = parentPath(owner)
    if (!owner) continue
    const target = destinations.get(owner)
    if (target === owner) continue
    if (target === undefined) {
      pending.treeTarget = null
      continue
    }
    const ownerDepth = owner.split('.').length
    const offset = target.split('.').length - ownerDepth
    const anchors = (pending.treeTarget?.anchors ?? pending.anchors)
      ?.filter(({ at }) => at < rootDepth || at >= ownerDepth)
      .map((anchor) => anchor.at < rootDepth ? anchor : { ...anchor, at: anchor.at + offset })
    pending.treeTarget = { path: target + path.slice(owner.length), anchors }
  }
}

export function joinKeys(base: string, keys: readonly string[]): string {
  return keys.reduce(appendValueKey, base)
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

/** Latest live replacement at a path in the structural projection. */
export function latestValueWrite(ops: readonly WriteOp[], path: string): PendingValue | undefined {
  for (let i = ops.length - 1; i >= 0; i--) {
    const effect = tags.get(ops[i]!)
    if (effect?.kind === 'value' && effect.path === path && !effect.drop && effect.mode !== 'delete') return effect
  }
  return undefined
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
  const arrays = new Map<string, { op: WriteOp; next: readonly unknown[] }>()
  const mutates = ops.filter((op) => {
    const pending = tags.get(op)
    return pending?.kind === 'value' && pending.mode === 'mutate'
  })
  // Resolve parents first so each anchor can find the row in its parent's final array.
  // Record final paths separately from the write buffer, where two writes can exchange paths.
  mutates.sort((a, b) => depth(a) - depth(b))
  for (const op of mutates) {
    const pending = tags.get(op) as PendingValue
    retarget(op, pending, arrays)
    if (!pending.drop) arrays.set(pending.path, { op, next: pending.value as unknown[] })
  }

  const early: WriteOp[] = []
  const cells: WriteOp[] = []
  const appended = new Set<WriteOp>()
  for (const op of ops) {
    const pending = tags.get(op)
    if (pending?.kind === 'value' && pending.mode !== 'mutate') retarget(op, pending, arrays)
    if (isDropped(op)) continue
    if (pending?.kind === 'value' && pending.mode === 'mutate') {
      for (const [path, { op: parent }] of arrays) {
        if (isUnder(path, pending.path) && !appended.has(parent)) {
          early.push(parent)
          appended.add(parent)
        }
      }
    } else if (pending?.kind === 'value' && [...arrays.keys()].some((path) => isUnder(path, pending.path))) {
      cells.push(op)
      continue
    }
    if (!appended.has(op)) early.push(op)
    appended.add(op)
  }
  return [...early, ...cells]
}

function depth(op: WriteOp): number {
  const pending = tags.get(op) as PendingValue
  const path = pending.treeTarget?.path ?? pending.origin ?? pending.path
  return path ? path.split('.').length : 0
}

export function isDropped(op: WriteOp): boolean {
  const pending = tags.get(op)
  return pending?.kind === 'value' && pending.drop === true
}

function retarget(
  op: WriteOp,
  pending: PendingValue,
  arrays: ReadonlyMap<string, { next: readonly unknown[] }>,
): void {
  if (pending.treeTarget === null) {
    pending.drop = true
    return
  }
  const anchors = pending.treeTarget ? pending.treeTarget.anchors : pending.anchors
  if (!anchors?.length && !pending.treeTarget) return
  pending.origin ??= pending.path
  const parts = (pending.treeTarget?.path ?? pending.origin).split('.')
  pending.drop = false
  for (const anchor of anchors ?? []) {
    const parent = arrays.get(parts.slice(0, anchor.at).join('.'))
    if (!parent) continue
    const index = locateSlot(parent.next, anchor)
    if (index === undefined) {
      pending.drop = true
      return
    }
    parts[anchor.at] = String(index)
  }
  pending.path = parts.join('.')
  op.key = `${pending.path}:value`
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

/** The latest buffered `$rules` assignment at `path`. */
export function pendingRules(ops: readonly WriteOp[], path: string): unknown[] | undefined {
  let found: unknown[] | undefined
  for (const op of ops) {
    const effect = tags.get(op)
    if (effect?.kind === 'rules' && effect.path === path && Array.isArray(effect.value)) found = effect.value
  }
  return found
}
