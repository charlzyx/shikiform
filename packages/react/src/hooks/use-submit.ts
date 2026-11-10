import type { Draft, FormInstance } from '@shikiform/core/internal'
import type { FormSubmitHandlers } from '../components/fields'
import { runSubmit } from '../components/fields'
import { useRequiredForm } from '../context'
import { useWatch } from './use-watch'

/** The minimum a click handler needs. DOM and component events satisfy it. */
export interface ClickEvent {
  preventDefault(): void
  readonly defaultPrevented: boolean
}

/**
 * What {@link useSubmit} returns. Spread the DOM fields onto a button, or read `loading` for a spinner.
 * `disabled` follows `!$canSubmit` unless `options.disabled` is passed (`false` forces the button enabled).
 */
export interface SubmitState<E = ClickEvent> {
  /** True when the form has no shown errors and is not submitting or validating. */
  canSubmit: boolean
  submitting: boolean
  /** Alias of `submitting`, for a spinner. */
  loading: boolean
  disabled: boolean
  /** `'button'` when `onSubmit` is passed (the click submits). Otherwise `'submit'` for `<Form onSubmit>`. */
  type: 'submit' | 'button'
  'aria-busy': true | undefined
  'data-loading': '' | undefined
  onClick: (event: E) => void
}

export interface UseSubmitOptions<T, E> extends FormSubmitHandlers<T> {
  /** Overrides `!$canSubmit`. `false` keeps the button enabled while the form is invalid. */
  disabled?: boolean
  /** Runs first. `preventDefault` skips the submit this button would start (`onSubmit` passed). */
  onClick?: (event: E) => void
}

/**
 * Submit state for the surrounding form. Disabled while `$canSubmit` is false, busy while `$submitting`.
 * Subscribes to form meta only, not to field values.
 *
 * - Without `onSubmit`, `type` is `'submit'`: the click is a native submit and `<Form onSubmit>` handles it.
 * - With `onSubmit`, `type` is `'button'` and the click runs `form.submit(onSubmit)` (no `<form>` element required).
 *
 * ```tsx
 * const submit = useSubmit({ onSubmit: save })
 * return <button type={submit.type} disabled={submit.disabled} aria-busy={submit['aria-busy']} onClick={submit.onClick}>保存</button>
 * ```
 */
export function useSubmit<T = any, E extends ClickEvent = ClickEvent>(options?: UseSubmitOptions<T, E>): SubmitState<E> {
  const form = useRequiredForm<T>('<Submit> / useSubmit()')
  const meta = useWatch((d: Draft<any>) => ({ can: d.$canSubmit === true, submitting: d.$submitting === true }))
  const own = options?.onSubmit !== undefined
  const onClick = options?.onClick
  const onSubmit = options?.onSubmit
  const onInvalid = options?.onInvalid
  const onSubmitError = options?.onSubmitError
  return {
    canSubmit: meta.can,
    submitting: meta.submitting,
    loading: meta.submitting,
    disabled: options?.disabled ?? !meta.can,
    type: own ? 'button' : 'submit',
    'aria-busy': meta.submitting ? true : undefined,
    'data-loading': meta.submitting ? '' : undefined,
    onClick: (event: E) => {
      onClick?.(event)
      if (!own || event.defaultPrevented) return
      runSubmit(form, { onSubmit, onInvalid, onSubmitError })
    },
  }
}

export interface UseResetOptions<T, E> {
  /** Passed to `form.reset(values)`: the new initial values. Omit to restore the current initial values. */
  values?: T
  /**
   * Called after `form.reset`, with the values already restored. `onClick` still runs first;
   * `preventDefault` there skips the reset and this callback.
   */
  afterReset?: (values: T) => void
  /** Runs before the reset. `preventDefault` skips the reset. */
  onClick?: (event: E) => void
}

/** What {@link useReset} returns. `type` is always `'button'` so a native form reset does not bypass the store. */
export interface ResetState<E = ClickEvent> {
  type: 'button'
  onClick: (event: E) => void
}

/**
 * Reset handler for the surrounding form. `onClick` runs first (and can cancel); `form.reset` runs next;
 * `afterReset` receives the restored values, so a query page can search with the cleared filters
 * without reading the values from before the click.
 *
 * ```tsx
 * const reset = useReset({ afterReset: (values) => search(values) })
 * return <button type={reset.type} onClick={reset.onClick}>重置</button>
 * ```
 */
export function useReset<T = any, E extends ClickEvent = ClickEvent>(options?: UseResetOptions<T, E>): ResetState<E> {
  const form = useRequiredForm<T>('<Reset> / useReset()')
  const values = options?.values
  const afterReset = options?.afterReset
  const onClick = options?.onClick
  return {
    type: 'button',
    onClick: (event: E) => {
      onClick?.(event)
      if (event.defaultPrevented) return
      form.reset(values as T | undefined)
      afterReset?.((form as FormInstance<T>).values)
    },
  }
}
