/**
 * Pending `$value` / `$enum` / `$rules` writes inside one reaction, watch, or batch.
 *
 * The draft's next read has to see earlier writes in the same pass (`push` twice, or
 * `user.name = 'a'` then `user.city = 'b'` on one object). UI props replay through `FieldUi`.
 * These tags ride on the buffered `WriteOp` so value reads can do the same without applying early.
 *
 * Structural reads (array `push` / `splice` / `delete`) ignore cell writes. Applying those with
 * `setIn` would copy every row, and the following array commit would treat the copies as new rows.
 */

import type { WriteOp } from '../types'
import { getAt } from '../shared/path'
import { DELETE, setIn } from './patch'

export type PendingValue = {
  kind: 'value'
  path: string
  mode: 'set' | 'mutate' | 'delete'
  value?: unknown
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

/** `path`'s value with this pass's value writes applied. `structural` skips cell edits. */
export function projectValue(base: unknown, basePath: string, ops: readonly WriteOp[], structural: boolean): unknown {
  let value = base
  for (const op of ops) {
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
      const childArray = effect.mode === 'mutate' || (effect.mode === 'set' && Array.isArray(effect.value))
      if (structural && !childArray) continue
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

/** The latest buffered `$rules` assignment at `path`. */
export function pendingRules(ops: readonly WriteOp[], path: string): unknown[] | undefined {
  let found: unknown[] | undefined
  for (const op of ops) {
    const effect = tags.get(op)
    if (effect?.kind === 'rules' && effect.path === path && Array.isArray(effect.value)) found = effect.value
  }
  return found
}
