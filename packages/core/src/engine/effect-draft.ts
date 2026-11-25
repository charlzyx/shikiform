/**
 * Writable drafts for object and array `$` reads inside a recording effect (`reaction`, `watch`, `batch`).
 * One proxy (`createPatchDraft`). The commit depends on the key: UI props stay a sparse patch, `$enum` and
 * `$rules` replace the whole list, object `$value` writes are path writes, and array `$value` mutators go
 * through `ArrayOps` (or a clear error on a registered tree).
 */

import type { Declarations } from '../declarations/declarations'
import { joinKeys, latestValueWrite, pendingEnum, pendingRules, projectValue, type CellAnchor } from '../draft/pending'
import { createPatchDraft, DELETE, isPatchable, setIn } from '../draft/patch'
import { readonlyValue } from '../draft/readonly'
import type { Scheduler } from '../effects/scheduler'
import { asOptions, isEnumBinding, toEnumBinding, type EnumBinding } from '../enum/enum-source'
import { showDraftPath, ShikiUsageError } from '../errors'
import { arrayIndex, deleteArrayIndex, hasArrayIndex } from '../shared/dense-array'
import { appendValueKey, assertUnambiguousWritePath, getAt, parentPath, pathSegments } from '../shared/path'
import { OBJECT_UI_KEYS, type UiKey } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { TreeOps } from '../structure/trees'
import { uiNestedWrite, type FieldUi } from './field-ui'
import type { StateWriter } from './writes'

export interface EffectDraftDeps {
  store: FieldStore<any>
  scheduler: Scheduler
  writer: StateWriter
  fieldUi: FieldUi
  trees: TreeOps
  declarations: Declarations
}

export class EffectDrafts {
  constructor(private readonly deps: EffectDraftDeps) {}

  peekValue(path: string): unknown {
    return projectValue(getAt(this.deps.store.values, path), path, pendingOps(this.deps.scheduler), false)
  }

  readValue(path: string): unknown {
    const stored = getAt(this.deps.store.values, path)
    if (!recording(this.deps.scheduler)) {
      return process.env.NODE_ENV !== 'production' ? readonlyValue(stored, path) : stored
    }
    const preview = () => this.peekValue(path)
    const structural = (keys: readonly string[]) => {
      const target = joinKeys(path, keys)
      assertUnambiguousWritePath(target)
      return projectValue(getAt(this.deps.store.values, target), target, pendingOps(this.deps.scheduler), true)
    }
    if (!isPatchable(preview())) return preview()
    return createPatchDraft(
      preview, (keys, value, kind) => this.commitValue(path, keys, value, kind),
      this.deps.scheduler.reactionScope(), structural,
    )
  }

  readUiKey(path: string, key: UiKey): unknown {
    const value = this.deps.fieldUi.read(path, key)
    if (!recording(this.deps.scheduler) || !OBJECT_UI_KEYS.has(key) || !isPatchable(value)) return value
    return createPatchDraft(
      () => this.deps.fieldUi.live(path, key),
      (keys, next) => {
        this.assertOpen(path, `$${key}`)
        this.deps.writer.writeState(path, `$${key}`, uiNestedWrite(keys, next))
      },
      this.deps.scheduler.reactionScope(),
    )
  }

  readEnum(path: string): unknown {
    const list = () => this.enumList(path)
    if (!recording(this.deps.scheduler) || !isPatchable(list())) return list()
    return createPatchDraft(list, (keys, value, kind) => {
      this.assertOpen(path, '$enum')
      if (this.enumBinding(path)) throw enumBindingMutation(path)
      const base = list()
      const next = keys.length === 0 && kind === 'mutate' ? value : setIn(Array.isArray(base) ? base : [], keys, kind === 'delete' ? DELETE : value)
      this.deps.writer.writeState(path, '$enum', next)
    }, this.deps.scheduler.reactionScope())
  }

  readRules(path: string, rules: readonly unknown[]): unknown {
    const list = () => pendingRules(pendingOps(this.deps.scheduler), path) ?? rules
    if (!recording(this.deps.scheduler) || !Array.isArray(list())) return list()
    return createPatchDraft(list, (keys, value, kind) => {
      this.assertOpen(path, '$rules')
      const base = list()
      const next = keys.length === 0 && kind === 'mutate' ? value : setIn(Array.isArray(base) ? base : [], keys, kind === 'delete' ? DELETE : value)
      this.deps.writer.writeState(path, '$rules', next)
    }, this.deps.scheduler.reactionScope())
  }

  private commitValue(path: string, keys: string[], value: unknown, kind: 'set' | 'mutate' | 'delete'): void {
    this.assertOpen(joinKeys(path, keys), '$value')
    if (kind === 'mutate') {
      this.commitArray(joinKeys(path, keys), value as unknown[])
      return
    }
    if (kind === 'delete') {
      const target = joinKeys(path, keys)
      const parent = parentPath(target)
      const leaf = parent === null ? target : target.slice(parent.length + 1)
      const index = arrayIndex(leaf)
      const parentValue = projectValue(
        parent === null ? this.deps.store.values : getAt(this.deps.store.values, parent),
        parent ?? '',
        pendingOps(this.deps.scheduler),
        true,
      )
      if (Array.isArray(parentValue) && index !== undefined) {
        const next = parentValue.slice()
        deleteArrayIndex(next, index)
        this.commitArray(parent ?? '', next)
        return
      }
      this.deps.writer.dropField(target)
      return
    }
    const full = joinKeys(path, keys)
    this.deps.writer.writeState(full, '$value', value, this.cellAnchors(full))
  }

  private commitArray(path: string, next: unknown[]): void {
    if (isTreeArray(this.deps.trees, path)) throw treeArrayMutation(path)
    this.deps.writer.writeArray(path, next, this.cellAnchors(path))
  }

  /**
   * Array elements this cell write addressed. Uses the pending array itself, not a `setIn` copy,
   * so a later splice / sort can find the same object and retarget the path.
   */
  private cellAnchors(path: string): CellAnchor[] | undefined {
    if (!path) return undefined
    const keys = pathSegments(path)
    const ops = pendingOps(this.deps.scheduler)
    const anchors: CellAnchor[] = []
    const root = latestValueWrite(ops, '')
    let node: unknown = root ? root.value : this.deps.store.values
    let prefix = ''
    for (let i = 0; i < keys.length; i++) {
      const key = keys[i]!
      if (Array.isArray(node)) {
        const index = arrayIndex(key)
        if (index !== undefined && hasArrayIndex(node, index)) {
          anchors.push({ at: i, index, slot: node[index] })
        }
      }
      prefix = appendValueKey(prefix, key)
      const replaced = latestValueWrite(ops, prefix)
      node = replaced ? replaced.value : (node as Record<string, unknown> | null | undefined)?.[key]
    }
    return anchors.length ? anchors : undefined
  }

  /** A draft captured inside a pass and mutated after it returns would write with no subscriber context. */
  private assertOpen(path: string, key: string): void {
    const scheduler = this.deps.scheduler
    const tracker = scheduler.current()
    if (tracker?.recordWrites || (!tracker && scheduler.batchDepth > 0)) return
    if (process.env.NODE_ENV === 'production') return
    const shown = `${showDraftPath(path)}.${key}`
    throw new ShikiUsageError(
      `${shown} was changed after the reaction, watch, or batch that read it returned. ` +
        `A draft is only writable inside that pass. After it returns, including after await, ` +
        `write with form.batch((d) => { … }) or form.setValue(${JSON.stringify(path)}, …).`,
    )
  }

  private enumList(path: string): unknown {
    const options = this.deps.store.get(path)?.enumOptions ?? []
    const pending = pendingEnum(pendingOps(this.deps.scheduler), path)
    if (pending?.hit) {
      if (Array.isArray(pending.value)) return pending.value
      if (pending.value === undefined) return this.fallbackEnum(path).options
      return options
    }
    return options
  }

  private enumBinding(path: string): EnumBinding | undefined {
    const field = this.deps.store.get(path)
    const pending = pendingEnum(pendingOps(this.deps.scheduler), path)
    if (pending?.hit) {
      if (pending.value === undefined) return this.fallbackEnum(path).binding
      return toEnumBinding(pending.value)
    }
    if (field?.enumFromEffect) return toEnumBinding(field.enumEffect)
    return this.fallbackEnum(path).binding
  }

  private fallbackEnum(path: string): { binding?: EnumBinding; options: unknown[] } {
    const field = this.deps.store.get(path)
    if (field?.jsxEnum !== undefined) {
      if (isEnumBinding(field.jsxEnum)) return { binding: field.jsxEnum, options: field.enumOptions ?? [] }
      return { options: asOptions(field.jsxEnum) ?? [] }
    }
    const binding = this.deps.declarations.declaredEnumBinding(path)
    if (binding) return { binding, options: field?.enumOptions ?? [] }
    return { options: this.deps.declarations.declaredEnum(path) ?? field?.enumOptions ?? [] }
  }
}

function recording(scheduler: Scheduler): boolean {
  const tracker = scheduler.current()
  if (tracker) return tracker.recordWrites
  return scheduler.batchDepth > 0
}

function pendingOps(scheduler: Scheduler) {
  const tracker = scheduler.current()
  if (tracker?.recordWrites) return tracker.writes
  if (scheduler.batchDepth > 0) return scheduler.batchOps
  return []
}

/** A registered tree root, or the `children` array under one. Flat array ops would drop positions. */
function isTreeArray(trees: TreeOps, path: string): boolean {
  const root = trees.root(path)
  if (!root) return false
  if (path === root) return true
  const childrenKey = trees.config(root).childrenKey
  const rel = path.startsWith(root + '.') ? path.slice(root.length + 1) : ''
  const parts = rel ? rel.split('.') : []
  return parts.length > 0 && parts[parts.length - 1] === childrenKey
}

function treeArrayMutation(path: string): ShikiUsageError {
  const shown = showDraftPath(path)
  return new ShikiUsageError(
    `${shown} is a registered tree. push / splice / delete on ${shown}.$value would treat nodes as a flat array and lose child positions. ` +
      `Change the tree with useTreeField().push / insert / remove / move, or assign a new tree value.`,
  )
}

function enumBindingMutation(path: string): ShikiUsageError {
  const shown = showDraftPath(path)
  return new ShikiUsageError(
    `${shown}.$enum is an EnumSource binding. push / splice would replace it with a static list and cancel the loader. ` +
      `Assign a list (${shown}.$enum = […] or ${shown}.$enum = []) or another source (${shown}.$enum = source.with(params)). ` +
      `${shown}.$enum = undefined drops the reaction layer.`,
  )
}
