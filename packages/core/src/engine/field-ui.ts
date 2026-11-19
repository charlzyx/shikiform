import { createPatchDraft, DELETE, isPatchable, setIn } from '../draft/patch'
import type { Scheduler } from '../effects/scheduler'
import { OBJECT_UI_KEYS, UI_KEYS, type FieldModel, type UiEffect, type UiKey } from '../state/field-model'
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

/** What carries UI layers: a field model, or a named UI node (`engine/ui-nodes.ts`). */
export type UiHolder = Pick<FieldModel, 'uiDeclared' | 'uiEffect'>

/** Where {@link FieldUi} finds holders by key (the field store, or the UI-node map). */
export interface UiModels {
  get(path: string): UiHolder | undefined
  ensure(path: string): UiHolder
}

/**
 * Field UI state (Formily `field.title` / `setComponentProps` / `setDecoratorProps`).
 *
 * Three layers, highest first: reaction (`d.x.$componentProps…`) > JSX (`<Field title componentProps>`, passed to
 * {@link FieldUi.view} at render time and never stored, so inline objects and handlers do not churn the model) >
 * declaration (`fields`, `registerField`, item templates). Scalars take the highest layer that has a value.
 * `componentProps` / `decoratorProps` deep-merge across layers: plain objects merge key by key at every depth; arrays,
 * functions, React elements and class instances are taken whole from the highest layer that has them.
 *
 * The reaction layer is a sparse patch tree. A nested write (`d.x.$componentProps.style.color = 'red'`) adds one
 * leaf, so the JSX / declared `style` keeps its other keys. Array mutators slice a copy and assign it, so a
 * declared or template array is never edited in place. Assigning a non-empty object or any non-object to a key
 * (`$componentProps.style = { … }`) replaces that key on every lower layer; assigning `{}` only opens an
 * intermediate (`style ??= {}`), so it adds nothing. Assigning the whole object (`$componentProps = { … }`) replaces
 * every lower layer, and `undefined` drops the reaction layer again. Reads are Immer-like and replay this pass's
 * pending writes; they see declaration + reaction (JSX is render-time only).
 */
export class FieldUi {
  /** Write ops this class created, with the patch they apply. Lets reads replay pending writes. */
  private readonly patches = new WeakMap<WriteOp, { path: string; key: UiKey; patch: Patch }>()

  constructor(
    private readonly store: UiModels,
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
      const keys = value[PATCH] as string[]
      const next = value.value
      opKey = `${path}:${key}.${keys.join('.')}`
      patch = (state) => {
        // Whole-object replacement: the stored value is concrete, write into it like Immer.
        if (state?.replace) return { value: setIn(state.value, keys, next), replace: true }
        return { value: patchAt(state?.value as PatchTree | undefined, keys, next) }
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
    if (deepSame(before, resolve(field, key, undefined, next))) return false
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

/** A whole value assigned at one key of the reaction patch tree. */
class Assign {
  constructor(readonly value: unknown) {}
}

/** Reaction layer of an object UI key: plain nodes merge into lower layers, `Assign` leaves replace. */
type PatchTree = { [key: string]: PatchTree | Assign }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return isPatchable(value) && !Array.isArray(value)
}

/** The patch tree with `value` written at `keys`. `{}` opens an intermediate; a write inside an `Assign` edits it. */
function patchAt(tree: PatchTree | undefined, keys: readonly string[], value: unknown): PatchTree {
  const [key, ...rest] = keys as [string, ...string[]]
  const node = tree?.[key]
  let next: PatchTree | Assign
  if (!rest.length) {
    next = isPlainObject(value) && !Object.keys(value).length && !(node instanceof Assign) ? (node ?? {}) : new Assign(value)
  } else if (node instanceof Assign) {
    next = new Assign(setIn(node.value, rest, value))
  } else {
    next = patchAt(node, rest, value)
  }
  return { ...tree, [key]: next }
}

/** Lower layer with the patch tree applied. Arrays patch by index into a copy. */
function applyPatch(base: unknown, tree: PatchTree): unknown {
  const out: any = Array.isArray(base) ? base.slice() : isPlainObject(base) ? { ...base } : {}
  for (const [key, node] of Object.entries(tree)) {
    if (node instanceof Assign) {
      if (node.value === DELETE) delete out[key]
      else out[key] = node.value
    } else {
      out[key] = applyPatch(out[key], node)
    }
  }
  return out
}

/** `upper` over `lower`: plain objects merge recursively; anything else is taken whole from `upper` when present. */
export function deepMerge(lower: unknown, upper: unknown): unknown {
  if (upper === undefined) return lower
  if (!isPlainObject(lower) || !isPlainObject(upper)) return upper
  const out: Record<string, unknown> = { ...lower }
  for (const key of Object.keys(upper)) out[key] = key in lower ? deepMerge(lower[key], upper[key]) : upper[key]
  return out
}

function resolve(field: UiHolder | undefined, key: UiKey, jsx: unknown, effect: UiEffect | undefined): unknown {
  const declared = field?.uiDeclared?.[key]
  if (OBJECT_UI_KEYS.has(key)) {
    if (effect?.replace) return effect.value
    const base = deepMerge(deepMerge({}, declared), jsx) as Record<string, unknown>
    return effect ? applyPatch(base, effect.value as PatchTree) : base
  }
  if (effect) return effect.value
  return jsx !== undefined ? jsx : declared
}

/** Structural comparison through plain objects and arrays; identity for functions, elements, instances. */
function deepSame(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (!isPatchable(a) || !isPatchable(b) || Array.isArray(a) !== Array.isArray(b)) return false
  const ak = Object.keys(a)
  if (ak.length !== Object.keys(b).length) return false
  return ak.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepSame((a as any)[k], (b as any)[k]))
}
