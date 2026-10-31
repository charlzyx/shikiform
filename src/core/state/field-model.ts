import type { EnumOption } from '../enum/enum-source'
import type { Display, FieldSpec, FieldUiSpec, Pattern, ValidateTrigger } from '../types'
import type { Rule } from '../validation/rules'

/**
 * One model per exact path. Every UI mounted on that path reads this same object.
 * Ownership of each flag is tracked (`*FromEffect`, `declared*`, `jsx*`) so declarations,
 * JSX mounts, item templates, and reactions can layer without erasing each other.
 */
export interface FieldModel {
  path: string
  display?: Display
  hasDisplay: boolean
  displayFromEffect: boolean
  pattern?: Pattern
  hasPattern: boolean
  patternFromEffect: boolean
  /**
   * The explicit pattern was installed by `$disabled = true` and has not been replaced by `$pattern`.
   * `$disabled = false` clears the pattern only while this is set, so the field inherits again.
   */
  patternFromDisabled: boolean
  required: boolean
  requiredFromEffect: boolean
  virtual: boolean
  virtualExplicit: boolean
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
  dirty: boolean
  validating: boolean
  schemaErrors: string[]
  /** Set when an item template owns validation at this path. Exact validation declarations are not dropped with the row. */
  templateApplied: boolean
  abort?: AbortController
  asyncDebounceMs?: number
  enumOptions?: EnumOption[]
  enumLoading: boolean
  enumFromEffect: boolean
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
export function normalizeUiSpec(spec: FieldUiSpec): Partial<Record<UiKey, unknown>> {
  const out: Partial<Record<UiKey, unknown>> = {}
  for (const key of UI_KEYS) if (spec[key] !== undefined) out[key] = spec[key]
  for (const [slot, props] of [['component', 'componentProps'], ['decorator', 'decoratorProps']] as const) {
    const value = out[slot]
    if (Array.isArray(value)) {
      out[slot] = value[0]
      if (value[1] !== undefined || out[props] !== undefined) out[props] = { ...value[1], ...(out[props] as object) }
    }
  }
  return out
}

export function createFieldModel(path: string): FieldModel {
  return {
    path,
    hasDisplay: false,
    displayFromEffect: false,
    hasPattern: false,
    patternFromEffect: false,
    patternFromDisabled: false,
    required: false,
    requiredFromEffect: false,
    virtual: false,
    virtualExplicit: false,
    computed: false,
    rules: [],
    jsxActive: false,
    rulesFromEffect: false,
    errors: [],
    schemaErrors: [],
    warnings: [],
    touched: false,
    dirty: false,
    validating: false,
    enumLoading: false,
    enumFromEffect: false,
    templateApplied: false,
    asyncSeq: 0,
    enumSeq: 0,
  }
}

/** Rule messages followed by schema messages. */
export function shownErrors(field: FieldModel): string[] {
  if (!field.errors.length && !field.schemaErrors.length) return []
  return [...field.errors, ...field.schemaErrors]
}
