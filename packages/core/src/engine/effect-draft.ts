/**
 * Writable drafts for object and array `$` reads inside a recording effect (`reaction`, `watch`, `batch`).
 * One proxy (`createPatchDraft`). The commit depends on the key: UI props stay a sparse patch, `$enum` and
 * `$rules` replace the whole list, object `$value` writes are path writes, and array `$value` mutators go
 * through `ArrayOps` (or a clear error on a registered tree).
 */

import type { Declarations } from '../declarations/declarations'
import { pendingAt } from '../draft/pending'
import { createPatchDraft, DELETE, isPatchable, setIn } from '../draft/patch'
import { readonlyValue } from '../draft/readonly'
import type { Scheduler } from '../effects/scheduler'
import { toEnumBinding, type EnumBinding } from '../enum/enum-source'
import { showDraftPath, ShikiUsageError } from '../errors'
import { arrayIndex, deleteArrayIndex } from '../shared/dense-array'
import { appendValueKey, getAt, parentPath } from '../shared/path'
import { OBJECT_UI_KEYS, type FieldModel, type UiKey } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import { effectiveFlag, emptyFlags, type FlagName } from '../state/flags'
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
    return getAt(this.deps.scheduler.writes.values(this.deps.store.values), path)
  }

  readValue(path: string): unknown {
    const value = this.peekValue(path)
    if (!this.deps.scheduler.writes.recording) {
      return process.env.NODE_ENV !== 'production' ? readonlyValue(value, path) : value
    }
    if (!isPatchable(value)) return value
    return createPatchDraft(
      () => this.peekValue(path), (keys, next, kind) => this.commitValue(keys.reduce(appendValueKey, path), next, kind),
      this.deps.scheduler.reactionScope(),
    )
  }

  readUiKey(path: string, key: UiKey): unknown {
    const value = this.deps.fieldUi.read(path, key)
    if (!this.deps.scheduler.writes.recording || !OBJECT_UI_KEYS.has(key) || !isPatchable(value)) return value
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
    if (!this.deps.scheduler.writes.recording || !isPatchable(list())) return list()
    return createPatchDraft(list, (keys, value, kind) => {
      this.assertOpen(path, '$enum')
      if (this.enumBinding(path)) throw enumBindingMutation(path)
      const base = list()
      const next = keys.length === 0 && kind === 'mutate' ? value : setIn(Array.isArray(base) ? base : [], keys, kind === 'delete' ? DELETE : value)
      this.deps.writer.writeState(path, '$enum', next)
    }, this.deps.scheduler.reactionScope())
  }

  readRules(path: string): unknown {
    const list = () => {
      const { pending, field } = this.project(path, 'rules')
      return pending?.value ?? this.deps.declarations.rulesAt(path, field)
    }
    if (!this.deps.scheduler.writes.recording || !Array.isArray(list())) return list()
    return createPatchDraft(list, (keys, value, kind) => {
      this.assertOpen(path, '$rules')
      const base = list()
      const next = keys.length === 0 && kind === 'mutate' ? value : setIn(Array.isArray(base) ? base : [], keys, kind === 'delete' ? DELETE : value)
      this.deps.writer.writeState(path, '$rules', next)
    }, this.deps.scheduler.reactionScope())
  }

  private commitValue(path: string, value: unknown, kind: 'set' | 'mutate' | 'delete'): void {
    this.assertOpen(path, '$value')
    if (kind === 'mutate') {
      this.commitArray(path, value as unknown[])
    } else if (kind === 'delete') {
      const parent = parentPath(path) ?? ''
      const index = arrayIndex(path.slice(parent ? parent.length + 1 : 0))
      const parentValue = this.peekValue(parent)
      if (Array.isArray(parentValue) && index !== undefined) {
        const next = parentValue.slice()
        deleteArrayIndex(next, index)
        this.commitArray(parent, next)
      } else {
        this.deps.writer.dropField(path)
      }
    } else {
      this.deps.writer.writeState(path, '$value', value)
    }
  }

  private commitArray(path: string, next: unknown[]): void {
    if (isTreeArray(this.deps.trees, path)) throw treeArrayMutation(path)
    this.deps.writer.writeArray(path, next)
  }

  /** A draft captured inside a pass and mutated after it returns would write with no subscriber context. */
  private assertOpen(path: string, key: string): void {
    const scheduler = this.deps.scheduler
    const tracker = scheduler.current()
    if (tracker?.recordWrites || (!tracker && scheduler.writes.depth > 0)) return
    if (process.env.NODE_ENV === 'production') return
    const shown = `${showDraftPath(path)}.${key}`
    throw new ShikiUsageError(
      `${shown} was changed after the reaction, watch, or batch that read it returned. ` +
        `A draft is only writable inside that pass. After it returns, including after await, ` +
        `write with form.batch((d) => { … }) or form.setValue(${JSON.stringify(path)}, …).`,
    )
  }

  readRequired(path: string): boolean {
    const { declarations, store, scheduler } = this.deps
    const source = scheduler.writes.project(path)
    if (source === path) return store.ensure(path).required
    const field = source === undefined ? undefined : store.get(source)
    if (field?.requiredFromEffect || field?.jsxRequired !== undefined) return field.required
    return declarations.requiredAt(path)
  }

  readFlag(path: string, name: FlagName): boolean {
    const { declarations, store, scheduler } = this.deps
    if (!scheduler.writes.pending.length) return store.effective(path, name)
    return effectiveFlag({
      get: (at) => {
        const source = scheduler.writes.project(at)
        if (source === at) return store.get(at)
        const field = source === undefined ? undefined : store.get(source)
        const flags = field?.flags ?? emptyFlags()
        return { flags: { ...flags, [name]: { ...flags[name], declared: declarations.declaredFlag(at, name) } } }
      },
    }, path, name)
  }

  private project(path: string, kind: 'enum' | 'rules'): { pending?: { value: unknown }; field?: FieldModel } {
    let pending: ReturnType<typeof pendingAt>
    const source = this.deps.scheduler.writes.project(path, (op, at) => { pending ??= pendingAt(op, at, kind) })
    const field = source === path ? this.deps.store.ensure(path) : source === undefined ? undefined : this.deps.store.get(source)
    return { pending, field }
  }

  private enumList(path: string): unknown {
    const { pending, field } = this.project(path, 'enum')
    if (Array.isArray(pending?.value)) return pending.value
    if (pending && pending.value === undefined) return this.fallbackEnum(path, field).options
    if (pending || field?.enumFromEffect || field?.path === path) return field?.enumOptions ?? []
    return this.fallbackEnum(path, field).options
  }

  private enumBinding(path: string): EnumBinding | undefined {
    const { pending, field } = this.project(path, 'enum')
    if (pending) return pending.value === undefined ? this.fallbackEnum(path, field).binding : toEnumBinding(pending.value)
    if (field?.enumFromEffect) return toEnumBinding(field.enumEffect)
    return this.fallbackEnum(path, field).binding
  }

  private fallbackEnum(path: string, field: FieldModel | undefined): { binding?: EnumBinding; options: unknown[] } {
    const { declarations } = this.deps
    const jsx = field?.jsxEnum
    if (Array.isArray(jsx)) return { options: jsx }
    const binding = jsx ?? declarations.declaredEnumBinding(path)
    if (binding) {
      const cached = binding.source.cached(binding.params)
      if (cached) return { binding, options: cached }
      const prior = jsx ?? (field && declarations.declaredEnumBinding(field.path))
      const sameSource = prior?.source === binding.source && binding.source.key(prior.params) === binding.source.key(binding.params)
      return { binding, options: sameSource && !field?.enumFromEffect ? field?.enumOptions ?? [] : [] }
    }
    return { options: declarations.declaredEnum(path) ?? [] }
  }
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
