import { ShikiUsageError } from '../errors'
import type { EnumBinding, EnumOption } from '../enum/enum-source'
import type { FieldSpec, FieldUiSpec, ValidateTrigger } from '../types'
import { emptyFlags, type FlagLayers, type FlagName } from './flags'
import type { Rule } from '../validation/rules'

/**
 * One model per exact path. Every UI mounted on that path reads this same object.
 * Ownership of each flag is tracked (`*FromEffect`, `declared*`, `jsx*`) so declarations,
 * JSX mounts, item templates, and reactions can layer without erasing each other.
 */
export interface FieldModel {
  path: string
  /**
   * Own `visible` / `disabled` / `readOnly` / `omit`, each layered reaction > JSX > declaration.
   * Effective values walk ancestors ({@link effectiveFlag}). For `visible` / `disabled` / `readOnly`,
   * an explicit `false` exits an inherited `true`. For `omit`, any ancestor `true` wins.
   * `undefined` on a layer means that layer did not set it.
   */
  flags: Record<FlagName, FlagLayers>
  required: boolean
  requiredFromEffect: boolean
  computed: boolean
  rules: Rule[]
  /** Exact configuration, kept separately from a disappearing template instance. */
  declaration?: FieldSpec
  /** Rules from `fields` or `registerField`. Kept when JSX unmounts. */
  declaredRules?: Rule[]
  /** `required` from `fields` or `registerField`. */
  declaredRequired?: boolean
  /** True while a JSX `<Field>` for this path is mounted. */
  jsxActive: boolean
  /** Rules from JSX `rules`. Cleared on unmount. Absent when JSX did not pass rules. */
  jsxRules?: Rule[]
  /** `required` from JSX. Cleared on unmount. */
  jsxRequired?: boolean
  rulesFromEffect: boolean
  errors: string[]
  warnings: string[]
  touched: boolean
  /** Sticky: a user edit (`setValue`, `binding().onChange`) happened since the last reset. `dirty` is derived from values. */
  edited: boolean
  validating: boolean
  warningValidating: boolean
  schemaErrors: string[]
  /** Messages written from outside (`setErrors`, a server response). Cleared when the value at, above, or below this path changes, or when this field validates again. */
  externalErrors: string[]
  /** Set when an item template owns validation at this path. Exact validation declarations are not dropped with the row. */
  templateApplied: boolean
  abort?: AbortController
  asyncDebounceMs?: number
  enumOptions?: EnumOption[]
  enumLoading: boolean
  enumFromEffect: boolean
  /**
   * What the reaction assigned to `$enum` (a static list, an `EnumBinding`, or an `EnumSource`).
   * Absent when the reaction layer is dropped. In-place edits of a binding are refused: they would
   * pin a static list and cancel the loader.
   */
  enumEffect?: unknown
  /** `<Field enum>` while mounted (normalized options, or an `EnumSource` binding). Below `$enum`, above `fields`. */
  jsxEnum?: EnumOption[] | EnumBinding
  triggers?: ValidateTrigger[]
  asyncSeq: number
  enumSeq: number
  /** UI state from `fields` / `registerField` / item templates (title, componentProps, …). See `engine/field-ui.ts`. */
  uiDeclared?: Partial<Record<UiKey, unknown>>
  /** UI state written by reactions. Object keys hold a sparse top-level patch unless `replace` is set. */
  uiEffect?: Partial<Record<UiKey, UiEffect>>
}

/** One reaction-written UI value. For `componentProps` / `decoratorProps`, `replace` means lower layers are dropped. */
export interface UiEffect {
  value: unknown
  replace?: boolean
}

/** UI state a field carries for its decorator and component. Core stores it opaquely (no React here). */
export const UI_KEYS = ['title', 'description', 'component', 'decorator', 'componentProps', 'decoratorProps'] as const
export type UiKey = (typeof UI_KEYS)[number]
/** Object-valued keys: shallow-merged across layers, patchable at any depth through the draft. */
export const OBJECT_UI_KEYS: ReadonlySet<UiKey> = new Set<UiKey>(['componentProps', 'decoratorProps'])

/**
 * A declaration's UI keys. A `[Component, props]` slot tuple becomes `component` + `componentProps`
 * (`decorator` likewise); tuple props merge under an explicit `componentProps`.
 */
export function normalizeUiSpec(spec: FieldUiSpec, where?: string): Partial<Record<UiKey, unknown>> {
  const out: Partial<Record<UiKey, unknown>> = {}
  for (const key of UI_KEYS) if (spec[key] !== undefined) out[key] = spec[key]
  for (const [slot, props] of [['component', 'componentProps'], ['decorator', 'decoratorProps']] as const) {
    const value = out[slot]
    if (Array.isArray(value)) {
      if (value[0] == null && process.env.NODE_ENV !== 'production') throw emptySlot(where, slot, value[0])
      out[slot] = value[0]
      if (value[1] !== undefined || out[props] !== undefined) out[props] = { ...value[1], ...(out[props] as object) }
    }
  }
  return out
}

/** `component={[undefined]}`: almost always an import that resolves to nothing. */
export function emptySlot(where: string | undefined, slot: string, value: unknown): ShikiUsageError {
  return new ShikiUsageError(
    `${where ?? 'A field'}: ${slot}={[${String(value)}, …]} has no component. The first item is ${String(value)}, ` +
      `usually an import that does not exist (a misspelled name, or a default import of a named export). ` +
      `Check where it is imported from.`,
  )
}

export function createFieldModel(path: string): FieldModel {
  return {
    path,
    flags: emptyFlags(),
    required: false,
    requiredFromEffect: false,
    computed: false,
    rules: [],
    jsxActive: false,
    rulesFromEffect: false,
    errors: [],
    schemaErrors: [],
    externalErrors: [],
    warnings: [],
    touched: false,
    edited: false,
    validating: false,
    warningValidating: false,
    enumLoading: false,
    enumFromEffect: false,
    templateApplied: false,
    asyncSeq: 0,
    enumSeq: 0,
  }
}

/** Rule messages, then schema messages, then external (`setErrors`) messages. */
export function shownErrors(field: FieldModel): string[] {
  if (!field.errors.length && !field.schemaErrors.length && !field.externalErrors.length) return []
  return [...field.errors, ...field.schemaErrors, ...field.externalErrors]
}
