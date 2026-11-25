/** Tags used to read back this pass's buffered enum and rule assignments. */
import type { WriteOp } from '../types'

type Pending = { kind: 'enum' | 'rules'; path: string; value: unknown }

const tags = new WeakMap<WriteOp, Pending>()

export function tagPending(op: WriteOp, pending: Pending): void {
  tags.set(op, pending)
}

export function pendingAt(op: WriteOp, path: string, kind: Pending['kind']): Pending | undefined {
  const pending = tags.get(op)
  return pending?.kind === kind && pending.path === path ? pending : undefined
}
