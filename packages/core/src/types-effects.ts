import type { EnumPolicy, ArrayPath, EffectDef, ValidateTrigger } from './types'
import type { FieldsInput } from './types-submit'
import type { StandardSchemaV1 } from './validation/schema'
import type { FormMessages } from './validation/messages'
import type { Pattern } from './types-display'

/**
 * Options for {@link createForm} / `useForm`. `T` is the form value.
 * `fields` checks `rules` / `enum` against each path. `display: 'virtual'` and `'none'` become optional on submit
 * when the second type argument is omitted.
 */
export interface FormOptions<T> {
  /** Reset target. Cloned on create. */
  initialValues?: T
  /** Installed in order. Each factory receives `reaction` and `watch`. */
  effects?: EffectDef<T>[]
  /**
   * Field models that exist even when no `<Field>` is mounted.
   * An inactive tab, a collapsed region, or a virtualized row still validates if it is listed here.
   * A key such as `rows.*.name` is an item template: the spec is applied to every current index.
   * An exact path, `registerField`, and `$rules` / `$required` win over the template.
   * JSX `rules` and `required` apply only while that `<Field>` is mounted and do not erase this spec on unmount.
   * `selectedKeys` and client-paging `page` are usually `{ display: 'virtual' }`.
   */
  fields?: FieldsInput<T>
  /**
   * Cross-field check. A Standard Schema's issue `path` is written onto that field's `$errors`
   * (`['items', 0, 'name']` → `items.0.name`, `['nodes', 0, 'children', 1, 'name']` → `nodes.0.children.1.name`).
   * Display `none` drops the issue (the field is not validated and does not block submit).
   * Display `hidden` keeps the issue. A function return is the same path → message map.
   */
  validate?:
    | StandardSchemaV1<T>
    | ((values: T) => Partial<Record<string, string>> | void | Promise<Partial<Record<string, string>> | void>)
  /** Default triggers. Field `trigger` overrides this. Default `['onBlur', 'onSubmit']`. */
  validateTrigger?: ValidateTrigger[]
  /**
   * Debounce async field validators and async Standard Schemas. `0` runs them immediately.
   * A newer edit aborts the previous `AbortSignal`. That attempt leaves the in-flight set
   * immediately, so `submit` does not wait for it; a later resolve or reject is ignored.
   */
  asyncDebounceMs?: number
  /**
   * What to do when the current value is no longer in `$enum`.
   * Default `'none'` (leave the value; clear it yourself in a `watch` if you need to keep the last edit).
   */
  enumPolicy?: EnumPolicy
  /**
   * Override built-in messages for this form (#44): `required`, `email`, `minLength`, `enum`, `fallback`,
   * `superseded` … A key is a string or a function of the check's parameters (`({ minLength }) => …`).
   * Order: the rule's own `message` > this > `setDefaultMessages` > {@link zhCN}. Pass `enUS` for English.
   */
  messages?: Partial<FormMessages>
  /**
   * Initial pattern of the whole form: the root `$pattern`, inherited by every field without its own pattern
   * (`'readPretty'` for a detail page, `'disabled'` while loading). Change it later with `d.$pattern = …`;
   * `d.$pattern = undefined` makes the form editable again.
   */
  pattern?: Pattern
  /** Log each pass when true. */
  devtools?: boolean
  /** Tree roots that effects address before React mounts. Keys are array paths (`ArrayPath<T>`). */
  trees?: { [K in ArrayPath<T>]?: { childrenKey?: string; rowKey?: string } }
}
