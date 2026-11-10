import type { ReactNode } from 'react'
import type { Pattern } from '@shikiform/core/internal'
import { ShikiUsageError } from '@shikiform/core/internal'
import { useFieldContextOrNull } from '../field-context'
import type { FieldBinding } from './use-field'

/**
 * What {@link useFieldDecorator} returns. Library-agnostic: no Ant Design props.
 * Spread `labelProps` / `errorProps` / `descriptionProps` in your own markup, or spread `control`
 * onto a widget that draws its own label and error (Mantine).
 */
export interface FieldDecorator {
  /** DOM id of the control (`htmlFor` / `aria-*` point here). */
  id: string
  /** `options.label` when passed, otherwise the field title. */
  label: ReactNode
  /** `options.description` when passed, otherwise the field description. */
  description: ReactNode
  /**
   * Whether to show the required mark. The field's `required`, hidden in `readPretty`, unless `asterisk` forces it.
   */
  required: boolean
  errors: readonly string[]
  warnings: readonly string[]
  /** `errors[0]`, for a control that takes one error string. */
  error: string | undefined
  /** True when `errors` is non-empty. Warnings alone are not invalid. */
  invalid: boolean
  validating: boolean
  disabled: boolean
  readOnly: boolean
  pattern: Pattern
  /** Space-separated ids for `aria-describedby`. Undefined when there is nothing to point at. */
  describedBy: string | undefined
  /** Spread onto `<label>`. `htmlFor` is omitted in `readPretty` (the view is text). */
  labelProps: { id: string; htmlFor?: string }
  /** Spread onto the description element. Undefined when there is no description. */
  descriptionProps: { id: string } | undefined
  /** Spread onto the error element. Undefined when there is no error. */
  errorProps: { id: string; role: 'alert' } | undefined
  /** Spread onto the warning element. Undefined when errors win or there is no warning. */
  warningProps: { id: string } | undefined
  /**
   * Props for a control that draws its own label and error. Do not also spread this onto a `connect()`ed
   * control: `connect` already sets `id`, `disabled`, `readOnly`, and `onBlur`.
   */
  control: {
    id: string
    label: ReactNode
    description: ReactNode
    required: boolean
    error: string | undefined
    disabled: boolean
    readOnly: boolean
    onBlur: () => void
    'aria-invalid': true | undefined
    'aria-required': true | undefined
    'aria-describedby': string | undefined
    'aria-errormessage': string | undefined
  }
}

export interface FieldDecoratorOptions {
  /** A binding from `useField(name)`. Default: the surrounding `<Field>`. */
  field?: FieldBinding<any>
  /** Wins over the field title. */
  label?: ReactNode
  /** Wins over the field description. */
  description?: ReactNode
  /** Force the required mark on (`true`) or off (`false`). Default: `field.required`, hidden in `readPretty`. */
  asterisk?: boolean
}

const NO_FIELD =
  '[shikiform] useFieldDecorator() reads the surrounding <Field>, but this component is not inside one. ' +
  'Render it as a <Field decorator> (or inside <Field name="…">), or pass the binding: useFieldDecorator({ field }).'

function present(value: ReactNode): boolean {
  return value != null && value !== false && value !== ''
}

/**
 * Label, required mark, description, and errors for the current field, as plain data (not Ant Design props).
 * One hook covers a decorator (`labelProps` + children + `errorProps`) and a control that draws its own
 * chrome (`control`, the Mantine shape). Must run inside `<Field>`, or be given `options.field`.
 *
 * ```tsx
 * function FormItem({ children }: { children?: ReactNode }) {
 *   const d = useFieldDecorator()
 *   return (
 *     <div>
 *       <label {...d.labelProps}>{d.label}{d.required && <span>*</span>}</label>
 *       {children}
 *       {d.descriptionProps && <p {...d.descriptionProps}>{d.description}</p>}
 *       {d.errorProps && <p {...d.errorProps}>{d.errors.join('、')}</p>}
 *     </div>
 *   )
 * }
 * ```
 */
export function useFieldDecorator(options?: FieldDecoratorOptions): FieldDecorator {
  const contextual = useFieldContextOrNull()
  const field = options?.field ?? contextual
  if (!field) throw new ShikiUsageError(NO_FIELD)
  const label = options && options.label !== undefined ? options.label : field.title
  const description = options && options.description !== undefined ? options.description : field.description
  const required = options?.asterisk !== undefined ? options.asterisk : field.required && field.pattern !== 'readPretty'
  const errors = field.errors
  const warnings = field.warnings
  const invalid = errors.length > 0
  const errorId = invalid ? `${field.id}-error` : undefined
  const warningId = !invalid && warnings.length > 0 ? `${field.id}-warning` : undefined
  const descriptionId = present(description) ? `${field.id}-description` : undefined
  const describedBy = [descriptionId, errorId ?? warningId].filter(Boolean).join(' ') || undefined
  const labelProps: FieldDecorator['labelProps'] = { id: `${field.id}-label` }
  if (field.pattern !== 'readPretty') labelProps.htmlFor = field.id
  return {
    id: field.id,
    label,
    description,
    required,
    errors,
    warnings,
    error: errors[0],
    invalid,
    validating: field.validating,
    disabled: field.disabled,
    readOnly: field.readOnly,
    pattern: field.pattern,
    describedBy,
    labelProps,
    descriptionProps: descriptionId ? { id: descriptionId } : undefined,
    errorProps: errorId ? { id: errorId, role: 'alert' } : undefined,
    warningProps: warningId ? { id: warningId } : undefined,
    control: {
      id: field.id,
      label,
      description,
      required,
      error: errors[0],
      disabled: field.disabled,
      readOnly: field.readOnly,
      onBlur: field.onBlur,
      'aria-invalid': invalid ? true : undefined,
      'aria-required': field.required ? true : undefined,
      'aria-describedby': describedBy,
      'aria-errormessage': errorId,
    },
  }
}
