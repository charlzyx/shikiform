/** Tags used to read back this pass's buffered enum and rule assignments. */
import type { WriteOp } from '../types'

type Pending = { kind: 'enum' | 'rules'; path: string; value: unknown }

const tags = new WeakMap<WriteOp, Pending>()

export function tagPending(op: WriteOp, pending: Pending): void {
  tags.set(op, pending)
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
