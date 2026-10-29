import { createPatchDraft, DELETE, setIn } from '../draft/patch'
import type { Scheduler } from '../effects/scheduler'
import { OBJECT_UI_KEYS, UI_KEYS, type FieldModel, type UiEffect, type UiKey } from '../state/field-model'
import type { FieldStore } from '../state/field-store'
import type { Notifier } from '../state/notifier'
import type { FieldUiSpec, WriteOp } from '../types'

const DRAFT_KEYS = new Map<string, UiKey>(UI_KEYS.map((key) => [`$${key}`, key]))

/** `$title` → `title`, or `undefined` when `key` is not UI state. */
export function uiKeyOf(draftKey: string): UiKey | undefined {
  return DRAFT_KEYS.get(draftKey)
}

/** Effective UI values a binding exposes. */
export interface FieldUiView {
  title: unknown
  description: unknown
  component: unknown
  decorator: unknown
  componentProps: Record<string, any>
  decoratorProps: Record<string, any>
}

type Patch = (state: UiEffect | undefined) => UiEffect | undefined

/**
 * Field UI state (Formily `field.title` / `setComponentProps` / `setDecoratorProps`).
 *
 * Three layers, highest first: reaction (`d.x.$componentProps…`) > JSX (`<Field title componentProps>`, passed to
 * {@link FieldUi.view} at render time and never stored, so inline objects and handlers do not churn the model) >
 * declaration (`fields`, `registerField`, item templates). Scalars take the highest layer that has a value.
 * `componentProps` / `decoratorProps` merge shallowly across layers per top-level key; a reaction that assigns the whole
 * object replaces every lower layer, and assigning `undefined` drops the reaction layer again.
 *
 * Nested writes are Immer-like: `d.x.$componentProps.style.color = 'red'` copies the stored object, keeps other keys,
 * and is one write op keyed by the top-level prop, so later reads in the same pass see it.
 */
export class FieldUi {
  /** Write ops this class created, with the patch they apply. Lets reads replay pending writes. */
  private readonly patches = new WeakMap<WriteOp, { path: string; key: UiKey; patch: Patch }>()

  constructor(
    private readonly store: FieldStore<any>,
    private readonly notifier: Notifier,
    private readonly scheduler: Scheduler,
    private readonly write: (path: string, draftKey: string, value: unknown) => void,
  ) {}

  isUiOp(op: WriteOp): boolean {
    return this.patches.has(op)
  }

  /** Draft read: tracks `path:key`; object values come back write-tracked. */
  read(path: string, key: UiKey): unknown {
    this.scheduler.track(path, key)
    const value = this.current(path, key)
    if (!OBJECT_UI_KEYS.has(key)) return value
    return createPatchDraft(
      () => this.current(path, key),
      (keys, next) => this.write(path, `$${key}`, { [PATCH]: keys, value: next }),
    )
  }

  /** Build the write op for `$title = …`, `$componentProps = …`, or a nested patch. */
  makeOp(path: string, key: UiKey, value: unknown): WriteOp {
    let opKey = `${path}:${key}`
    let patch: Patch
    if (isPatch(value)) {
      const [top, ...rest] = value[PATCH] as [string, ...string[]]
      const base = (this.current(path, key) ?? {}) as Record<string, unknown>
      const next = rest.length ? setIn(base[top], rest, value.value) : value.value
      opKey = `${path}:${key}.${top}`
      patch = (state) => {
        const patchValue = { ...((state?.value as Record<string, unknown>) ?? {}) }
        if (next === DELETE && state?.replace) delete patchValue[top]
        else patchValue[top] = next === DELETE ? undefined : next
        return { value: patchValue, replace: state?.replace }
      }
    } else if (value === undefined) {
      patch = () => undefined
    } else if (OBJECT_UI_KEYS.has(key)) {
      patch = () => ({ value: { ...(value as object) }, replace: true })
    } else {
      patch = () => ({ value })
    }
    const op: WriteOp = { key: opKey, apply: () => this.apply(path, key, patch) }
    this.patches.set(op, { path, key, patch })
    return op
  }

  /** Effective values for a binding. `jsx` is the render-time layer from `<Field>` / `useField` options. */
  view(path: string, jsx?: FieldUiSpec): FieldUiView {
    const field = this.store.get(path)
    const out: Record<string, unknown> = {}
    for (const key of UI_KEYS) out[key] = resolve(field, key, jsx?.[key], field?.uiEffect?.[key])
    return out as unknown as FieldUiView
  }

  private apply(path: string, key: UiKey, patch: Patch): boolean {
    const field = this.store.ensure(path)
    const before = resolve(field, key, undefined, field.uiEffect?.[key])
    const next = patch(field.uiEffect?.[key])
    const effects = { ...field.uiEffect }
    if (next) effects[key] = next
    else delete effects[key]
    field.uiEffect = effects
    if (sameValue(before, resolve(field, key, undefined, next))) return false
    this.notifier.bumpPath(path)
    this.scheduler.markDirty(`${path}:${key}`)
    return true
  }

  /** Declaration + reaction layers, with this pass's pending writes replayed on top. */
  private current(path: string, key: UiKey): unknown {
    const field = this.store.get(path)
    let effect = field?.uiEffect?.[key]
    const tracker = this.scheduler.current()
    const pending = tracker?.recordWrites ? tracker.writes : this.scheduler.batchDepth > 0 ? this.scheduler.batchOps : []
    for (const op of pending) {
      const meta = this.patches.get(op)
      if (meta && meta.path === path && meta.key === key) effect = meta.patch(effect)
    }
    return resolve(field, key, undefined, effect)
  }
}

const PATCH = Symbol('shikiform.uiPatch')

function isPatch(value: unknown): value is { [PATCH]: string[]; value: unknown } {
  return !!value && typeof value === 'object' && PATCH in value
}

function resolve(field: FieldModel | undefined, key: UiKey, jsx: unknown, effect: UiEffect | undefined): unknown {
  const declared = field?.uiDeclared?.[key]
  if (OBJECT_UI_KEYS.has(key)) {
    if (effect?.replace) return effect.value
    return { ...(declared as object), ...(jsx as object), ...(effect?.value as object) }
  }
  if (effect) return effect.value
  return jsx !== undefined ? jsx : declared
}

/** Shallow per-key comparison (UI values may hold functions and React elements). */
function sameValue(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && Object.is((a as any)[k], (b as any)[k]))
}
