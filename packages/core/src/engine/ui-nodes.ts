import { showDraftPath, ShikiUsageError } from '../errors'
import type { Scheduler } from '../effects/scheduler'
import { unwrapReadonly } from '../draft/readonly'
import type { UiEffect, UiKey } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { FieldUiSpec, WriteOp } from '../types'
import { FieldUi, type FieldUiView, type UiHolder } from './field-ui'
import type { StateWriter } from './writes'
import { reindexKeyed } from '../structure/migrate'

/** Flags a named UI can set. No `omit`: a UI node is not submitted. */
type UiFlag = 'visible' | 'disabled' | 'readOnly'

/** `field`: `<Field name ui>`, a second UI of a field. `node`: `<UI name>`, a UI with no value. */
export type UiKind = 'field' | 'node'

/** The render-time JSX layer of a UI node: the field UI keys plus its own flags. */
export interface UiJsx extends FieldUiSpec {
  visible?: boolean
  disabled?: boolean
  readOnly?: boolean
}

/** Effective state of one UI node. Unset flags fall back to the path's effective flags. */
export interface UiNodeView extends FieldUiView {
  visible: boolean
  disabled: boolean
  readOnly: boolean
}

interface UiModel extends UiHolder {
  path: string
  name: string
  kind?: UiKind
  /** Reaction layer. `undefined` falls back to JSX, then to the path. */
  visible?: boolean
  disabled?: boolean
  readOnly?: boolean
  uiEffect?: Partial<Record<UiKey, UiEffect>>
}

/** States a `$ui(name)` handle reads and writes. */
export const UI_NODE_STATE = new Set([
  '$visible',
  '$disabled',
  '$readOnly',
  '$title',
  '$description',
  '$componentProps',
  '$decoratorProps',
])

/** Dep keys a UI node's reads track (`<id>:<state>`). */
const UI_DEPS = ['visible', 'disabled', 'readOnly', 'title', 'description', 'componentProps', 'decoratorProps', 'component', 'decorator']

/** Model / dep / notifier key of the UI `name` on `path` (`''` is the root). Never a data path: `#` separates. */
export function uiId(path: string, name: string): string {
  return `${path}#${name}`
}

/**
 * Named UI nodes (`d.x.$ui('echo')`, `d.$ui('tip')`). Each is keyed by (path, name) and owns only a UI layer:
 * visible, disabled, readOnly, title, description, componentProps, decoratorProps. Value, errors, rules and
 * options stay on the field. Layers, highest first: reaction > JSX (`<Field ui …>`, render time) > fallback,
 * where the fallback for the three flags is the path's effective state (a field instance follows its field; a
 * `<UI>` its scope). An explicit `false` exits that fallback. Title / description (field instances only) fall
 * back to the field's own declaration + reaction value. componentProps / decoratorProps never inherit.
 *
 * A node's flags do not reach anything else: hiding a `<UI>` unmounts what it wraps but does not change any
 * field's `$visible`, validation or submit.
 */
export class UiNodes {
  private readonly models = new Map<string, UiModel>()
  private readonly ui: FieldUi
  private readonly mounts = new Map<string, number>()
  private readonly everMounted = new Set<string>()
  private readonly pending = new Set<string>()
  private readonly warned = new Set<string>()
  private ready = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(
    private readonly store: FieldStore<any>,
    private readonly notifier: Notifier,
    private readonly scheduler: Scheduler,
    private readonly writer: StateWriter,
    private readonly fieldUi: FieldUi,
  ) {
    const models = this.models
    this.ui = new FieldUi(
      { get: (id) => models.get(id), ensure: (id) => models.get(id) ?? { } },
      notifier,
      scheduler,
      (id, draftKey, value) => {
        const model = models.get(id)
        if (model) this.write(model.path, model.name, draftKey, value)
      },
    )
    store.onReindexIds = (oldIds, newIds) => this.reindex(oldIds, newIds)
  }

  /**
   * Rows moved / were inserted / removed: a node's runtime state follows its row like a field's (`rows.0#tip` moves
   * to `rows.1#tip`); a removed row's nodes are dropped, so a new row at that index starts fresh.
   */
  private reindex(oldIds: ReadonlyMap<string, string>, newIds: ReadonlyMap<string, string>): void {
    const { dropped, moved } = reindexKeyed(this.models, (model) => uiId(model.path, model.name), oldIds, newIds)
    if (!dropped.length && !moved.length) return
    const touched = new Set<string>()
    for (const model of dropped) touched.add(uiId(model.path, model.name))
    for (const { from, model } of moved) {
      touched.add(uiId(from, model.name))
      touched.add(uiId(model.path, model.name))
    }
    for (const id of touched) {
      // The key held a model and now holds another one or none: readers and renders of it must re-run.
      this.notifier.bumpPath(id)
      for (const state of UI_DEPS) this.scheduler.markDirty(`${id}:${state}`)
    }
  }

  /** Draft read of `d.<path>.$ui(name).<key>`. Every read is a dependency, like a field's `$` reads. */
  read(path: string, name: string, key: string): unknown {
    if (process.env.NODE_ENV !== 'production') assertUiState(path, name, key)
    const id = uiId(path, name)
    const model = this.ensure(path, name)
    const { scheduler, store } = this
    if (key === '$visible' || key === '$disabled' || key === '$readOnly') {
      const name = key.slice(1) as UiFlag
      scheduler.track(id, name)
      scheduler.trackChain(path, name)
      const own = model[name]
      return own === undefined ? store.effective(path, name) : own
    }
    const uiKey = key.slice(1) as UiKey
    const own = this.ui.read(id, uiKey)
    if (own === undefined && model.kind === 'field' && (uiKey === 'title' || uiKey === 'description')) {
      return this.fieldUi.read(path, uiKey)
    }
    return own
  }

  /** Draft write of `d.<path>.$ui(name).<key> = value`: buffered in a reaction / batch like any `$` write. */
  write(path: string, name: string, key: string, value: unknown): void {
    if (process.env.NODE_ENV !== 'production') {
      assertUiState(path, name, key)
      value = unwrapReadonly(value)
    }
    const id = uiId(path, name)
    const model = this.ensure(path, name)
    let op: WriteOp
    if (key === '$visible' || key === '$disabled' || key === '$readOnly') {
      const name = key.slice(1) as UiFlag
      op = {
        key: `${id}:${name}`,
        apply: () => this.setFlag(model, name, value as boolean | undefined),
      }
    } else {
      op = this.ui.makeOp(id, key.slice(1) as UiKey, value)
    }
    const apply = op.apply
    op.apply = () => {
      this.noteWrite(id)
      return apply()
    }
    this.writer.enqueue(op, this.ui.isUiOp(op))
  }

  /** Effective state for a render. `jsx` is the `<Field ui>` / `<UI>` props layer (never stored). */
  view(path: string, name: string, jsx: UiJsx | undefined, kind: UiKind): UiNodeView {
    const id = uiId(path, name)
    const model = this.models.get(id)
    const out = this.ui.view(id, jsx) as UiNodeView
    out.visible = uiFlag(model?.visible, jsx?.visible, this.store.effective(path, 'visible'))
    out.disabled = uiFlag(model?.disabled, jsx?.disabled, this.store.effective(path, 'disabled'))
    out.readOnly = uiFlag(model?.readOnly, jsx?.readOnly, this.store.effective(path, 'readOnly'))
    if (kind === 'field') {
      if (out.title === undefined || out.description === undefined) {
        const field = this.fieldUi.view(path)
        out.title ??= field.title
        out.description ??= field.description
      }
    }
    return out
  }

  /** A mounted `<Field ui>` / `<UI>`. Returns the release. Two mounts of one (path, name) share one state (dev warning). */
  claim(path: string, name: string, kind: UiKind): () => void {
    const id = uiId(path, name)
    this.ensure(path, name).kind = kind
    this.store.ensure(path) // ancestor flag writes bump this path, so the node re-renders with them
    const count = (this.mounts.get(id) ?? 0) + 1
    this.mounts.set(id, count)
    this.everMounted.add(id)
    if (count > 1 && process.env.NODE_ENV !== 'production') {
      console.warn(
        `[shikiform] Two UIs named "${name}" are mounted on ${path ? `"${path}"` : 'the root'}: they share one state ` +
          `(${showDraftPath(path)}.$ui('${name}')) and one DOM id. Give each its own ui name.`,
      )
    }
    return () => {
      const left = (this.mounts.get(id) ?? 1) - 1
      if (left > 0) this.mounts.set(id, left)
      else this.mounts.delete(id)
    }
  }

  /** React has mounted (first field / UI effect): from now on, writes to a UI that never mounted warn once. */
  markReady(): void {
    if (this.ready) return
    this.ready = true
    if (this.pending.size) this.schedule()
  }

  private noteWrite(id: string): void {
    if (process.env.NODE_ENV === 'production' || this.everMounted.has(id) || this.warned.has(id)) return
    this.pending.add(id)
    if (this.ready) this.schedule()
  }

  /** Check after the current commit settles: a UI mounted by the same render does not warn. */
  private schedule(): void {
    if (this.timer !== undefined) return
    this.timer = setTimeout(() => {
      this.timer = undefined
      for (const id of this.pending) {
        this.pending.delete(id)
        if (this.everMounted.has(id) || this.warned.has(id)) continue
        this.warned.add(id)
        const model = this.models.get(id)!
        console.warn(unmountedMessage(model.path, model.name, this.mountedNames(model.path)))
      }
    }, 0)
  }

  private mountedNames(path: string): string[] {
    const names: string[] = []
    for (const id of this.everMounted) {
      const model = this.models.get(id)
      if (model && model.path === path) names.push(model.name)
    }
    return names
  }

  private setFlag(model: UiModel, key: UiFlag, value: boolean | undefined): boolean {
    if (model[key] === value) return false
    model[key] = value
    const id = uiId(model.path, model.name)
    this.notifier.bumpPath(id)
    this.scheduler.markDirty(`${id}:${key}`)
    return true
  }

  private ensure(path: string, name: string): UiModel {
    const id = uiId(path, name)
    let model = this.models.get(id)
    if (!model) this.models.set(id, (model = { path, name }))
    return model
  }
}

/** Reaction value, else the JSX prop, else the path's effective flag. `false` is explicit and wins. */
function uiFlag(reaction: boolean | undefined, jsx: boolean | undefined, fallback: boolean): boolean {
  if (reaction !== undefined) return reaction
  if (jsx !== undefined) return jsx
  return fallback
}

function assertUiState(path: string, name: string, key: string): void {
  if (UI_NODE_STATE.has(key)) return
  throw new ShikiUsageError(
    `${showDraftPath(path)}.$ui('${name}').${key} is not UI-node state. A UI node has only ${[...UI_NODE_STATE].join(', ')}; ` +
      `its value, errors and rules are the field's: ${showDraftPath(path)}.${key.startsWith('$') ? key : '$value'}.`,
  )
}

function unmountedMessage(path: string, name: string, mounted: string[]): string {
  const where = path ? `on "${path}"` : 'at the root'
  const mount = path ? `<Field name="${path.split('.').pop()}" ui="${name}" …>` : `<UI name="${name}" …>`
  return (
    `[shikiform] ${showDraftPath(path)}.$ui('${name}') was written, but no UI named "${name}" has mounted ${where}, ` +
    `so the write shows nowhere. Mount ${mount}, or fix the name.` +
    (mounted.length ? ` Mounted ${where}: ${mounted.map((n) => `"${n}"`).join(', ')}.` : '')
  )
}
