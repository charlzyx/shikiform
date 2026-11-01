import { Button, type ButtonProps } from 'antd'
import type { MouseEvent } from 'react'
import { useRequiredForm } from '../../react/context'
import { runSubmit, type FormSubmitHandlers } from '../../react/components/fields'
import { useFormMessage } from '../../react/hooks/use-form-message'
import { useWatch } from '../../react/hooks/use-watch'
import type { Draft } from '../../core/types'

/** `Submit` props: Ant Design `Button` props plus optional submit callbacks (then it submits on click itself). */
export type SubmitProps<T = any> = Omit<ButtonProps, 'onSubmit'> & FormSubmitHandlers<T>

/**
 * Primary submit button for the surrounding form (Formily `Submit`). Disabled while `$canSubmit` is false, loading
 * while `$submitting`. Label: `messages.submit` (`提交`).
 *
 * - Without `onSubmit` it is a native `type="submit"` button: `<Form onSubmit>` handles it (Enter works the same).
 * - With `onSubmit` (and optional `onInvalid` / `onSubmitError`) the click runs `form.submit(onSubmit)` itself, so it
 *   also works where there is no `<form>` element around it, e.g. in a modal footer or a `FormButtonGroup` outside.
 */
export function Submit<T = any>({ onSubmit, onInvalid, onSubmitError, onClick, ...props }: SubmitProps<T>) {
  const form = useRequiredForm<T>('<Submit>')
  const meta = useWatch((d: Draft<any>) => ({ can: d.$canSubmit === true, submitting: d.$submitting === true }))
  const t = useFormMessage()
  const own = onSubmit !== undefined
  const click = (event: MouseEvent<HTMLElement>) => {
    onClick?.(event as MouseEvent<HTMLButtonElement & HTMLAnchorElement>)
    if (!own || event.defaultPrevented) return
    runSubmit(form, { onSubmit, onInvalid, onSubmitError })
  }
  return (
    <Button
      type="primary"
      htmlType={own ? 'button' : 'submit'}
      {...props}
      onClick={click}
      disabled={props.disabled ?? !meta.can}
      loading={meta.submitting || props.loading}
    >
      {props.children ?? t('submit')}
    </Button>
  )
}

/** `Reset` props: Ant Design `Button` props plus `values` (passed to `form.reset(values)`). */
export type ResetProps<T = any> = ButtonProps & {
  /** Reset to these values and make them the new initial values (`form.reset(values)`). Default: back to the initial values. */
  values?: T
}

/**
 * Reset button for the surrounding form (Formily `Reset`): `form.reset()` on click — initial values back, touched /
 * errors cleared. Label: `messages.reset` (`重置`). `event.preventDefault()` in `onClick` skips the reset.
 */
export function Reset<T = any>({ values, onClick, ...props }: ResetProps<T>) {
  const form = useRequiredForm<T>('<Reset>')
  const t = useFormMessage()
  return (
    <Button
      htmlType="button"
      {...props}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented) return
        form.reset(values as T | undefined)
      }}
    >
      {props.children ?? t('reset')}
    </Button>
  )
}
