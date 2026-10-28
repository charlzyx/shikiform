import { clone } from '../shared/equal'
import { getAt, parentPath } from '../shared/path'
import type { Display, Pattern } from '../types'
import { createFieldModel, type FieldModel } from './field-model'

/**
 * The form's state: current values, form-level flags, and the field-model map.
 * Pure data plus inherited reads (`display`, `pattern`). It does not notify or schedule.
 */
export class FieldStore<T = any> {
  values: T
  readonly initial: T
  /** Form-level dirty: a user edit happened since the last `reset`. */
  dirty = false
  submitting = false
  submitCount = 0
  validating = false
  readonly fields = new Map<string, FieldModel>()
  /** Called once after a model is created. Declarations use it to revive a dormant declaration. */
  onCreate?: (path: string) => void

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
    let cursor: string | null = path
    while (cursor) {
      const display = this.fields.get(cursor)
      if (display?.hasDisplay && display.display === 'none') return 'none'
      if (display?.hasDisplay && display.display === 'hidden') hidden = true
      cursor = parentPath(cursor)
    }
    return hidden ? 'hidden' : 'visible'
  }

  /** Nearest own-or-ancestor pattern. A computed field with none reads as `readPretty`. */
  effectivePattern(path: string): Pattern {
    let cursor: string | null = path
    while (cursor) {
      const field = this.fields.get(cursor)
      if (field?.hasPattern && field.pattern) return field.pattern
      cursor = parentPath(cursor)
    }
    if (this.fields.get(path)?.computed) return 'readPretty'
    return 'editable'
  }

  /** Paths equal to `path` or below it. */
  isUnder(fieldPath: string, path: string): boolean {
    return fieldPath === path || fieldPath.startsWith(path + '.')
  }
}
