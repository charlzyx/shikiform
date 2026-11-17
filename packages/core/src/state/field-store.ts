import { clone } from '../shared/equal'
import { getAt, parentPath } from '../shared/path'
import { acceptsValidation as pathAcceptsValidation, effectiveFlag, ownFlag, type FlagName } from './flags'
import { createFieldModel, type FieldModel } from './field-model'

/** Models an array / tree change dropped, and the ones it re-keyed (with their previous path). */
export interface ReindexResult {
  dropped: FieldModel[]
  moved: { from: string; model: FieldModel }[]
}

/**
 * The form's state: current values, form-level flags, and the field-model map.
 * Pure data plus inherited flag reads (`visible`, `disabled`, `readOnly`). It does not notify or schedule.
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
  /** Paths that have at least one descendant field. Used to skip a full scan when a leaf flag changes. */
  readonly parents = new Set<string>()
  /** Called once after a model is created. Declarations use it to revive a dormant declaration. */
  onCreate?: (path: string) => void
  /** Called with the models an array / tree change dropped or moved, before the new value is written. */
  onReindex?: (result: ReindexResult) => void
  /** Called with the row id → path maps of an array / tree change (named UI nodes follow their rows). */
  onReindexIds?: (oldIds: ReadonlyMap<string, string>, newIds: ReadonlyMap<string, string>) => void
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
      for (let cursor = parentPath(path); cursor; cursor = parentPath(cursor)) {
        if (this.parents.has(cursor)) break
        this.parents.add(cursor)
      }
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

  /** Effective flag. `visible` / `disabled` / `readOnly` inherit (OR, explicit `false` exits); `omit` does not. */
  effective(path: string, name: FlagName): boolean {
    return effectiveFlag(this, path, name)
  }

  /** This node's own flag before inheritance. `undefined` means the node did not set it. */
  own(path: string, name: FlagName): boolean | undefined {
    return ownFlag(this.fields.get(path), name)
  }

  /** `visible && !disabled && !readOnly`. Anything else skips validation and its errors are cleared. */
  acceptsValidation(path: string): boolean {
    return pathAcceptsValidation(this, path)
  }

  /** Paths equal to `path` or below it. */
  isUnder(fieldPath: string, path: string): boolean {
    return fieldPath === path || fieldPath.startsWith(path + '.')
  }
}

