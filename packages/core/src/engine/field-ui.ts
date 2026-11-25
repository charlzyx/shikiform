import { DELETE, isPatchable, setIn, unwrapDraft } from '../draft/patch'
import { unwrapReadonly } from '../draft/readonly'
import { ShikiUsageError, showStateKey } from '../errors'
import { arrayIndex, deleteArrayIndex, writeArrayIndex } from '../shared/dense-array'
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

/** Model, dependency and notification key of a named UI. */
export function uiId(path: string, name: string): string {
  return `${path}#${name}`
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
 * leaf, so the JSX / declared `style` keeps its other keys. The effect-scope draft (not this class) slices a copy
 * for array mutators, so a declared or template array is never edited in place. Assigning a non-empty object or any non-object to a key
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
    private readonly declaredAt?: (path: string) => FieldModel['uiDeclared'],
  ) {}

  isUiOp(op: WriteOp): boolean {
    return this.patches.has(op)
  }

  /** Draft read: tracks `path:key` and returns the current value. The effect scope wraps object values. */
  read(path: string, key: UiKey, name?: string): unknown {
    this.scheduler.track(name === undefined ? path : uiId(path, name), key)
    return this.live(path, key, name)
  }

  /** Current value including this pass's pending patches. Does not track. */
  live(path: string, key: UiKey, name?: string): unknown {
    const keyAt = (at: string) => name === undefined ? at : uiId(at, name)
    const patches: Patch[] = []
    const source = this.scheduler.writes.project(path, (op, at) => {
      const meta = this.patches.get(op)
      if (meta?.key === key && meta.path === keyAt(at)) patches.push(meta.patch)
    })
    const field = source === undefined ? undefined : this.store.get(keyAt(source))
    let effect = field?.uiEffect?.[key]
    for (let i = patches.length - 1; i >= 0; i--) effect = patches[i](effect)
    const holder = source !== path && this.declaredAt ? { uiDeclared: this.declaredAt(path) } : field
    return resolve(holder, key, undefined, effect)
  }

  /** Build the write op for `$title = …`, `$componentProps = …`, or a nested patch. */
  makeOp(path: string, key: UiKey, value: unknown): WriteOp | undefined {
    let opKey = `${path}:${key}`
    let patch: Patch
    if (isPatch(value)) {
      const keys = value[PATCH] as string[]
      const next = value.value
      if (!keys.length) {
        // The draft root itself is the array (`$componentProps.splice` / `delete props[i]`).
        // An empty key path is the whole value, not a child key named `undefined`.
        patch = () => ({ value: next, replace: true })
      } else {
        opKey = `${path}:${key}.${keys.join('.')}`
        patch = (state) => {
          // Whole-object replacement: the stored value is concrete, write into it like Immer.
          if (state?.replace) return { value: setIn(state.value, keys, next), replace: true }
          return { value: patchAt(state?.value as PatchTree | undefined, keys, next) }
        }
      }
    } else if (value === undefined) {
      patch = () => undefined
    } else if (OBJECT_UI_KEYS.has(key)) {
      if (!isPlainObject(value)) {
        if (process.env.NODE_ENV !== 'production') {
          throw new ShikiUsageError(`${showStateKey(opKey)} expects a plain object or undefined to restore lower layers.`)
        }
        return
      }
      patch = () => ({ value: { ...value }, replace: true })
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
}

const PATCH = Symbol('shikiform.uiPatch')

interface UiPatch {
  [PATCH]: string[]
  value: unknown
}

function isPatch(value: unknown): value is UiPatch {
  return !!value && typeof value === 'object' && PATCH in value
}

/** Nested draft write of `componentProps` / `decoratorProps`. `keys` empty replaces the whole value. */
export function uiNestedWrite(keys: string[], value: unknown): UiPatch {
  return { [PATCH]: keys, value }
}

export function readUiPatch(value: unknown): { keys: string[]; value: unknown } | undefined {
  if (!isPatch(value)) return undefined
  return { keys: value[PATCH], value: value.value }
}

/**
 * Rebuild a UI patch after peeling drafts and development views inside it.
 * Returns `undefined` when `value` is not a patch. Spread/unwrap would drop the symbol key.
 */
export function prepareUiWrite(value: unknown): unknown | undefined {
  const marker = readUiPatch(value)
  if (!marker) return undefined
  let inner = unwrapDraft(marker.value)
  if (process.env.NODE_ENV !== 'production') inner = unwrapReadonly(inner)
  return uiNestedWrite(marker.keys, inner)
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

/** Lower layer with the patch tree applied. An index write fills gaps; `delete` on an index leaves a hole. */
function applyPatch(base: unknown, tree: PatchTree): unknown {
  const out: any = Array.isArray(base) ? base.slice() : isPlainObject(base) ? { ...base } : {}
  for (const [key, node] of Object.entries(tree)) {
    if (node instanceof Assign) {
      if (node.value === DELETE) deletePatched(out, key)
      else assignPatched(out, key, node.value)
    } else if (Array.isArray(out)) {
      const index = arrayIndex(key)
      if (index === undefined) {
        const record = out as unknown as Record<string, unknown>
        record[key] = applyPatch(record[key], node)
      } else {
        writeArrayIndex(out, index, applyPatch(out[index], node))
      }
    } else {
      out[key] = applyPatch(out[key], node)
    }
  }
  return out
}

/** `delete` on an array index leaves a hole (`length` unchanged). An object key is removed. */
function deletePatched(out: any, key: string): void {
  const index = Array.isArray(out) ? arrayIndex(key) : undefined
  if (index !== undefined) {
    deleteArrayIndex(out, index)
    return
  }
  delete out[key]
}

function assignPatched(out: any, key: string, value: unknown): void {
  if (!Array.isArray(out)) {
    out[key] = value
    return
  }
  const index = arrayIndex(key)
  if (index === undefined) (out as unknown as Record<string, unknown>)[key] = value
  else writeArrayIndex(out, index, value)
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
