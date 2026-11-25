import { unwrapReadonly } from '../draft/readonly'
import type { Scheduler } from '../effects/scheduler'
import { normalizePath, setAt } from '../shared/path'
import type { FieldStore } from '../state/field-store'
import type { MoveResult } from '../types'
import type { FormMessages } from '../validation/messages'
import { movedFieldPaths, reindexById } from './migrate'
import { cloneNodes, deleteNode, getNode, insertNode, listPositions, locateIds, moveTreeNode, posKey, posOf, pushNode, replaceNode, type Pos } from '../shared/tree-ops'

export interface TreeConfig {
  childrenKey: string
  rowKey: string
  canMove?: (args: any) => string | null | undefined
}

/** Registered tree roots, `pos` lookup, and `moveTree` with field-model migration. */
export class TreeOps {
  private trees = new Map<string, TreeConfig>()
  private readonly pendingNodeIds = new WeakMap<object, symbol>()

  constructor(
    private readonly store: FieldStore<any>,
    private readonly scheduler: Scheduler,
    private readonly messages?: Partial<FormMessages>,
  ) {}

  /** Registered trees, including roots from `options.trees`. */
  entries(): Record<string, { childrenKey: string; rowKey: string }> {
    const out: Record<string, { childrenKey: string; rowKey: string }> = {}
    for (const [path, cfg] of this.trees) {
      out[path] = { childrenKey: cfg.childrenKey, rowKey: cfg.rowKey }
    }
    return out
  }

  register(path: string, spec: { childrenKey?: string; rowKey?: string; canMove?: TreeConfig['canMove'] } = {}): void {
    path = normalizePath(path)
    const prev = this.trees.get(path)
    this.trees.set(path, {
      childrenKey: spec.childrenKey ?? prev?.childrenKey ?? 'children',
      rowKey: spec.rowKey ?? prev?.rowKey ?? 'id',
      canMove: spec.canMove ?? prev?.canMove,
    })
  }

  /** A tree root addressed before React mounts, or seen with this children key. */
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
    const cfg = this.config(path)
    const before = this.store.arrayOf(path)
    const result = moveTreeNode(before, from, to, cfg.childrenKey, cfg.canMove, this.messages, this.cloneForEdit)
    if (!result.ok || !result.tree) return { ok: false, reason: result.reason }
    this.commit(path, before, result.tree)
    return { ok: true }
  }

  /** Append `node` at the root, or as the last child of `parentPos`. A missing children array is created. */
  push(path: string, node: unknown, parentPos?: Pos): void {
    const cfg = this.config(path)
    const before = this.store.arrayOf(path)
    const next = pushNode(before, node, parentPos, cfg.childrenKey, this.cloneForEdit)
    if (next) this.commit(path, before, next)
  }

  /** Insert `node` so it sits at `pos`. Later siblings shift. A missing children array on an existing parent is created. */
  insert(path: string, pos: Pos, node: unknown): void {
    const cfg = this.config(path)
    const before = this.store.arrayOf(path)
    const next = insertNode(before, pos, node, cfg.childrenKey, this.cloneForEdit)
    if (next) this.commit(path, before, next)
  }

  /** Remove the node at `pos`. Its field model is dropped. Later siblings follow their ids. */
  remove(path: string, pos: Pos): void {
    const cfg = this.config(path)
    const before = this.store.arrayOf(path)
    const next = deleteNode(before, pos, cfg.childrenKey, this.cloneForEdit)
    if (next) this.commit(path, before, next)
  }

  /** Replace the node at `pos`. The previous node's field model is dropped. */
  replace(path: string, pos: Pos, node: unknown): void {
    const cfg = this.config(path)
    const before = this.store.arrayOf(path)
    const next = replaceNode(before, pos, node, cfg.childrenKey, this.cloneForEdit)
    if (next) this.commit(path, before, next)
  }

  private readonly cloneForEdit = (before: any[], childrenKey: string): any[] => {
    const next = cloneNodes(before)
    if (!this.scheduler.hasBufferedWrites()) return next
    const carryIds = (source: any[], clone: any[]) => {
      source.forEach((node, index) => {
        if (!node || typeof node !== 'object') return
        // The clone and original denote the same node even when it has no rowKey.
        const id = this.pendingNodeIds.get(node) ?? Symbol()
        this.pendingNodeIds.set(node, id)
        this.pendingNodeIds.set(clone[index], id)
        if (Array.isArray(node[childrenKey])) carryIds(node[childrenKey], clone[index][childrenKey])
      })
    }
    carryIds(before, next)
    return next
  }

  /** Migrate field models by node id, then notify structure and value readers. `before` / `next` are the root arrays. */
  private commit(path: string, before: any[], next: any[]): void {
    const { store, scheduler } = this
    const cfg = this.config(path)
    if (process.env.NODE_ENV !== 'production') next = unwrapReadonly(next)
    const oldIds = locateIds(before, path, cfg.childrenKey, cfg.rowKey)
    const newIds = locateIds(next, path, cfg.childrenKey, cfg.rowKey)
    const reindexed = reindexById(store.fields, oldIds, newIds)
    const moved = movedFieldPaths(reindexed)
    store.onReindex?.(reindexed)
    scheduler.reindexWatchRows(oldIds, newIds)
    store.onReindexIds?.(oldIds, newIds)
    const previous = store.values
    store.values = setAt(previous, path, next)
    const beforeNodes = listPositions(before, path, cfg.childrenKey, cfg.rowKey)
    const afterNodes = listPositions(next, path, cfg.childrenKey, cfg.rowKey)
    if (scheduler.hasBufferedWrites()) {
      const newPaths = new Map<symbol, string>()
      for (const node of afterNodes) {
        const id = this.pendingNodeIds.get(getNode(next, node.pos, cfg.childrenKey))
        if (id) newPaths.set(id, node.path)
      }
      const destinations = new Map<string, string | undefined>()
      for (const node of beforeNodes) {
        const id = this.pendingNodeIds.get(getNode(before, node.pos, cfg.childrenKey))
        if (id) destinations.set(node.path, newPaths.get(id))
      }
      scheduler.reindexPendingValues(path, destinations)
    }
    store.onRestructure?.()
    const beforePos = new Map(beforeNodes.map((n) => [posKey(n.pos), n.id]))
    const afterPos = new Map(afterNodes.map((n) => [posKey(n.pos), n.id]))
    const dirty = new Set<string>()
    for (const key of new Set([...beforePos.keys(), ...afterPos.keys()])) {
      if (beforePos.get(key) !== afterPos.get(key)) dirty.add(key)
    }
    scheduler.markDirtyPos(path, dirty)
    scheduler.markStructure(path, previous, store.values)
    scheduler.markValueChanged(path, { before: previous, after: store.values, moved })
    scheduler.enqueueFromDirty()
    scheduler.flush()
  }
}
