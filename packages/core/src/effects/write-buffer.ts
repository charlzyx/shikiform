import { deepEqual } from '../shared/equal'
import { getAt, parentPath } from '../shared/path'
import type { WriteOp } from '../types'

export function valueChangedAt(before: unknown, from: string, after: unknown, to: string): boolean {
  if (!deepEqual(getAt(before, from), getAt(after, to))) return true
  const has = (root: unknown, path: string) => {
    const parent = parentPath(path) ?? ''
    return Object.hasOwn(getAt(root, parent) ?? {}, path.slice(parent ? parent.length + 1 : 0))
  }
  return !!to && has(before, from) !== has(after, to)
}

export interface WorkingValues {
  values: unknown
  hasStructure: boolean
}

export interface WriteBuffer {
  writes: WriteOp[]
  working?: WorkingValues
}

type Recording = WriteBuffer & { recordWrites: boolean }
type PriorPath = (path: string) => string | undefined

/** An ordered journal. State and structure edits compose in the same order at commit time. */
export class WriteJournal {
  depth = 0
  private batch: WriteBuffer = { writes: [] }
  private readonly projections = new WeakMap<WriteOp, PriorPath>()

  constructor(private readonly stack: readonly Recording[]) {}

  private get active(): WriteBuffer | undefined {
    const tracker = this.stack.at(-1)
    if (tracker) return tracker.recordWrites ? tracker : undefined
    return this.depth ? this.batch : undefined
  }

  get recording(): boolean { return this.active !== undefined }
  get pending(): readonly WriteOp[] { return this.active?.writes ?? [] }

  values<T>(committed: T): T {
    for (let i = this.stack.length - 1; i >= 0; i--) {
      const working = this.stack[i]?.working
      if (working) return working.values as T
    }
    return this.batch.working ? this.batch.working.values as T : committed
  }

  takeBatch(): WriteBuffer {
    const batch = this.batch
    this.batch = { writes: [] }
    return batch
  }

  batchLayer(fn: () => void): void {
    const tracker = this.stack.at(-1)
    const source = tracker ?? this.batch
    const parent = { writes: source.writes, working: source.working }
    const child = { writes: source.writes.slice(), working: source.working }
    if (tracker) Object.assign(tracker, child)
    else this.batch = child
    this.depth++
    try {
      fn()
    } catch (error) {
      if (tracker) Object.assign(tracker, parent)
      else this.batch = parent
      throw error
    } finally {
      this.depth--
    }
  }

  stageValue(values: unknown, op: WriteOp, structure?: { previous?: WriteOp; priorPath: PriorPath }): boolean {
    const buffer = this.active
    if (!buffer) return false
    buffer.working = { values, hasStructure: !!structure || !!buffer.working?.hasStructure }
    if (structure) this.projections.set(op, structure.priorPath)
    if (structure?.previous && buffer.writes.at(-1) === structure.previous) buffer.writes.pop()
    buffer.writes.push(op)
    return true
  }

  stageState(op: WriteOp, patch: boolean): boolean {
    const buffer = this.active
    if (!buffer) return false
    const { writes } = buffer
    for (let i = writes.length - 1; i >= 0; i--) {
      const earlier = writes[i]
      // A coordinate means the same row only within one side of a structural edit.
      if (this.projections.has(earlier)) break
      if (earlier.key !== op.key) continue
      if (!patch) {
        writes[i] = op
        return true
      }
      writes.splice(i, 1)
      break
    }
    writes.push(op)
    return true
  }

  /** Actions apply in call order without claiming ownership of a derived state. */
  stageAction(apply: () => void): boolean {
    const buffer = this.active
    if (!buffer) return false
    buffer.writes.push({ key: '', apply: () => {
      apply()
      return true
    } })
    return true
  }

  /** Trace the current row/node back through the journal, visiting its coordinate at each write. */
  project(path: string, visit?: (op: WriteOp, at: string) => void): string | undefined {
    const ops = this.pending
    for (let i = ops.length - 1; i >= 0; i--) {
      const op = ops[i]
      const priorPath = this.projections.get(op)
      if (!priorPath) {
        visit?.(op, path)
        continue
      }
      const prior = priorPath(path)
      if (prior === undefined) return
      path = prior
    }
    return path
  }
}
