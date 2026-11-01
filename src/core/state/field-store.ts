import { clone } from '../shared/equal'
import { getAt, selfAndAncestors } from '../shared/path'
import type { Display, Pattern } from '../types'
import { createFieldModel, type FieldModel } from './field-model'

/** Models an array / tree change dropped, and the ones it re-keyed (with their previous path). */
export interface ReindexResult {
  dropped: FieldModel[]
  moved: { from: string; model: FieldModel }[]
}

/**
 * The form's state: current values, form-level flags, and the field-model map.
 * Pure data plus inherited reads (`display`, `pattern`). It does not notify or schedule.
 */
export class FieldStore<T = any> {
  values: T
  /** Baseline for `reset` and `dirty`. Replaced by `reset(values)` / `setInitialValues`. */
  initial: T
  /** Sticky form-level flag: a user edit happened since the last `reset`. `dirty` is derived (see `form-engine.ts`). */
  edited = false
  submitting = false
  submitCount = 0
  validating = false
  readonly fields = new Map<string, FieldModel>()
  /** Called once after a model is created. Declarations use it to revive a dormant declaration. */
  onCreate?: (path: string) => void
  /** Called with the models an array / tree change dropped or moved, before the new value is written. */
  onReindex?: (result: ReindexResult) => void
  /** Called after an array / tree change wrote its new value. */
  onRestructure?: () => void

  constructor(initialValues: T) {
    this.initial = clone(initialValues)
    this.values = clone(this.initial)
  }

  get(path: string): FieldModel | undefined {
    return this.fields.get(path)
  }

  /** The model at `path`, created on first touch. */
  ensure(path: string): FieldModel {
    let field = this.fields.get(path)
    if (!field) {
      field = createFieldModel(path)
      this.fields.set(path, field)
      this.onCreate?.(path)
    }
    return field
  }

  getValue(path: string): unknown {
    return getAt(this.values, path)
  }

  arrayOf(path: string): any[] {
    const value = getAt(this.values, path)
    return Array.isArray(value) ? value : []
  }

  /** `none` on any ancestor wins; otherwise `hidden` on any ancestor; otherwise `visible`. */
  effectiveDisplay(path: string): Display {
    let hidden = false
    for (const cursor of selfAndAncestors(path)) {
      const display = this.fields.get(cursor)
      if (display?.hasDisplay && display.display === 'none') return 'none'
      if (display?.hasDisplay && display.display === 'hidden') hidden = true
    }
    return hidden ? 'hidden' : 'visible'
  }

  /** Nearest own-or-ancestor pattern (the root `''` included: `d.$pattern` on the root draft is the form's). A computed field with none reads as `readPretty`. */
  effectivePattern(path: string): Pattern {
    for (const cursor of selfAndAncestors(path)) {
      const field = this.fields.get(cursor)
      if (field?.hasPattern && field.pattern) return field.pattern
    }
    if (this.fields.get(path)?.computed) return 'readPretty'
    return 'editable'
  }

  /** Paths equal to `path` or below it. */
  isUnder(fieldPath: string, path: string): boolean {
    return fieldPath === path || fieldPath.startsWith(path + '.')
  }
}
