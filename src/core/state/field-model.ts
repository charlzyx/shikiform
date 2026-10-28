import type { EnumOption } from '../enum/enum-source'
import type { Display, FieldSpec, Pattern, ValidateTrigger } from '../types'
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
}

export function createFieldModel(path: string): FieldModel {
  return {
    path,
    hasDisplay: false,
    displayFromEffect: false,
    hasPattern: false,
    patternFromEffect: false,
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
