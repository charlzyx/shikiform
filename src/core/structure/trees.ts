import type { Scheduler } from '../effects/scheduler'
import { setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { MoveResult } from '../types'
import { reindexById } from './migrate'
import { listPositions, locateIds, moveNode, posKey, posOf, type Pos } from '../shared/tree-ops'

export interface TreeConfig {
  childrenKey: string
  rowKey: string
  canMove?: (args: any) => string | null | undefined
}

/** Registered tree roots, `pos` lookup, and `moveTree` with field-model migration. */
export class TreeOps {
  private trees = new Map<string, TreeConfig>()

  constructor(
    private readonly store: FieldStore<any>,
    private readonly scheduler: Scheduler,
  ) {}

  register(path: string, spec: { childrenKey?: string; rowKey?: string; canMove?: TreeConfig['canMove'] } = {}): void {
    const prev = this.trees.get(path)
    this.trees.set(path, {
      childrenKey: spec.childrenKey ?? prev?.childrenKey ?? 'children',
      rowKey: spec.rowKey ?? prev?.rowKey ?? 'id',
      canMove: spec.canMove ?? prev?.canMove,
    })
  }

  /** `reaction.walk` saw this root with this children key. */
  note(path: string, childrenKey: string): void {
    const prev = this.trees.get(path)
    this.trees.set(path, { childrenKey, rowKey: prev?.rowKey ?? 'id', canMove: prev?.canMove })
  }

  /** Longest registered root that contains `path`. */
  root(path: string): string | undefined {
    let best: string | undefined
    for (const root of this.trees.keys()) {
      if ((path === root || path.startsWith(root + '.')) && (!best || root.length > best.length)) best = root
    }
    return best
  }

  config(path: string): TreeConfig {
    return this.trees.get(path) ?? this.trees.get(this.root(path) ?? '') ?? { childrenKey: 'children', rowKey: 'id' }
  }

  /** The running `walk` instance's pos for its own node, else the pos inside the registered tree. */
  readPos(path: string): Pos | undefined {
    const stack = this.scheduler.stack
    for (let i = stack.length - 1; i >= 0; i--) {
      const tracker = stack[i]
      if (tracker?.nodePath && tracker.nodePath === path && tracker.pos) return tracker.pos
    }
    const root = this.root(path)
    if (!root) return undefined
    return posOf(root, path, this.config(root).childrenKey)
  }

  move(path: string, from: Pos, to: Pos): MoveResult {
    const { store, scheduler } = this
    const cfg = this.config(path)
    const before = store.arrayOf(path)
    const oldIds = locateIds(before, path, cfg.childrenKey, cfg.rowKey)
    const result = moveNode(before, from, to, cfg.childrenKey, cfg.canMove)
    if (!result.ok || !result.tree) return { ok: false, reason: result.reason }
    const next = result.tree
    const newIds = locateIds(next, path, cfg.childrenKey, cfg.rowKey)
    reindexById(store.fields, oldIds, newIds)
    store.values = setAt(store.values, path, next)
    const beforePos = new Map(listPositions(before, path, cfg.childrenKey, cfg.rowKey).map((n) => [posKey(n.pos), n.id]))
    const afterPos = new Map(listPositions(next, path, cfg.childrenKey, cfg.rowKey).map((n) => [posKey(n.pos), n.id]))
    const dirty = new Set<string>()
    for (const key of new Set([...beforePos.keys(), ...afterPos.keys()])) {
      if (beforePos.get(key) !== afterPos.get(key)) dirty.add(key)
    }
    scheduler.dirtyPos.set(path, dirty)
    scheduler.markStructure(path)
    scheduler.enqueueFromDirty()
    scheduler.flush()
    return { ok: true }
  }
}
