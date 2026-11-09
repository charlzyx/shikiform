import { Button, type ButtonProps } from 'antd'
import type { MouseEvent } from 'react'
import type { FormSubmitHandlers } from '../../react/components/fields'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { useReset, useSubmit } from '../../react/hooks/use-submit'

/** `Submit` props: Ant Design `Button` props plus optional submit callbacks (then it submits on click itself). */
export type SubmitProps<T = any> = Omit<ButtonProps, 'onSubmit'> & FormSubmitHandlers<T>

/**
 * Primary submit button for the surrounding form (Formily `Submit`). Disabled while `$canSubmit` is false, loading
 * while `$submitting`. Label: `messages.submit` (`提交`). The headless control is `Submit` from `shikiform`.
 *
 * - Without `onSubmit` it is a native `type="submit"` button: `<Form onSubmit>` handles it (Enter works the same).
 * - With `onSubmit` (and optional `onInvalid` / `onSubmitError`) the click runs `form.submit(onSubmit)` itself, so it
 *   also works where there is no `<form>` element around it, e.g. in a modal footer or a `FormButtonGroup` outside.
 */
export function Submit<T = any>({ onSubmit, onInvalid, onSubmitError, onClick, disabled, loading, ...props }: SubmitProps<T>) {
  const state = useSubmit<T, MouseEvent<HTMLElement>>({ onSubmit, onInvalid, onSubmitError, onClick, disabled })
  const t = useFormMessage()
  return (
    <Button
      type="primary"
      htmlType={state.type}
      {...props}
      onClick={state.onClick}
      disabled={state.disabled}
      loading={state.submitting || loading}
    >
      {props.children ?? t('submit')}
    </Button>
  )
}

/** `Reset` props: Ant Design `Button` props, `values` (passed to `form.reset(values)`), and `afterReset`. */
export type ResetProps<T = any> = ButtonProps & {
  /** Reset to these values and make them the new initial values (`form.reset(values)`). Default: back to the initial values. */
  values?: T
  /**
   * Called after `form.reset`, with the restored values (a query page searches with the cleared filters).
   * `onClick` still runs first; `event.preventDefault()` skips the reset and this callback.
   */
  afterReset?: (values: T) => void
}

/**
 * Reset button for the surrounding form (Formily `Reset`): `form.reset()` on click — initial values back, touched /
 * errors cleared. Label: `messages.reset` (`重置`). `event.preventDefault()` in `onClick` skips the reset.
 * `afterReset` runs after the values have changed. The headless control is `Reset` from `shikiform`.
 */
export function Reset<T = any>({ values, onClick, afterReset, ...props }: ResetProps<T>) {
  const state = useReset<T, MouseEvent<HTMLElement>>({ values, onClick, afterReset })
  const t = useFormMessage()
  return (
    <Button htmlType="button" {...props} onClick={state.onClick}>
      {props.children ?? t('reset')}
    </Button>
  )
}
