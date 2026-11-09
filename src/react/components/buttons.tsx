import { Children, cloneElement, isValidElement, type ComponentProps, type MouseEvent, type ReactElement, type ReactNode } from 'react'
import { ShikiUsageError } from '../../core/errors'
import { useFormMessage } from '../hooks/use-form-message'
import { useReset, useSubmit, type ResetState, type SubmitState, type UseResetOptions, type UseSubmitOptions } from '../hooks/use-submit'
import type { FormSubmitHandlers } from './fields'

type ButtonPass = Omit<ComponentProps<'button'>, 'onClick' | 'type' | 'disabled' | 'children'>

type AsChildBehavior = {
  type: 'submit' | 'button'
  disabled?: boolean
  'aria-busy'?: true
  'data-loading'?: ''
  onClick: (event: MouseEvent<HTMLElement>) => void
}

function buttonDom(state: SubmitState<MouseEvent<HTMLElement>>): AsChildBehavior {
  return {
    type: state.type,
    disabled: state.disabled,
    'aria-busy': state['aria-busy'],
    'data-loading': state['data-loading'],
    onClick: state.onClick,
  }
}

/**
 * Put `behavior` on a single element child. The child's own props win, except `onClick` (child, then ours,
 * unless the child calls `preventDefault`) and `disabled` / `type` / busy flags (child wins only when set).
 */
function mergeAsChild(child: ReactNode, behavior: AsChildBehavior, caller: string): ReactElement {
  if (!isValidElement(child)) {
    throw new ShikiUsageError(
      `[shikiform] ${caller} asChild expects a single React element, e.g. <${caller} asChild><button>保存</button></${caller}>.`,
    )
  }
  const theirs = (child.props ?? {}) as Record<string, any>
  const onClick = (event: MouseEvent<HTMLElement>) => {
    theirs.onClick?.(event)
    if (!event.defaultPrevented) behavior.onClick(event)
  }
  return cloneElement(child as ReactElement<Record<string, unknown>>, {
    ...behavior,
    ...theirs,
    onClick,
    type: theirs.type ?? behavior.type,
    disabled: theirs.disabled ?? ('disabled' in behavior ? behavior.disabled : undefined),
    'aria-busy': theirs['aria-busy'] ?? ('aria-busy' in behavior ? behavior['aria-busy'] : undefined),
    'data-loading': theirs['data-loading'] ?? ('data-loading' in behavior ? behavior['data-loading'] : undefined),
  })
}

export type SubmitProps<T = any> = FormSubmitHandlers<T> & ButtonPass & {
  /**
   * Render your own element and merge submit behavior onto it.
   * `<Submit asChild><button>保存</button></Submit>`.
   */
  asChild?: boolean
  /** Button label, a render prop that receives {@link SubmitState}, or the `asChild` element. */
  children?: ReactNode | ((state: SubmitState<MouseEvent<HTMLButtonElement>>) => ReactNode)
  /** Overrides `!$canSubmit`. */
  disabled?: boolean
  /** Runs first. `preventDefault` skips a self-managed submit (`onSubmit` passed). */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
}

/**
 * Headless submit control for the surrounding form. No Ant Design.
 *
 * - Render prop: `{(state) => <button type={state.type} disabled={state.disabled} onClick={state.onClick}>保存</button>}`.
 * - `asChild`: behavior is merged onto the single child (`disabled`, `type`, `aria-busy`, `data-loading`, `onClick`).
 * - Otherwise a native `<button>`. Label defaults to `messages.submit` (`提交`).
 *
 * Without `onSubmit` the button is `type="submit"` and `<Form onSubmit>` handles it (Enter works the same).
 * With `onSubmit` the click runs `form.submit` itself, so it also works outside a `<form>` element.
 */
export function Submit<T = any>({
  asChild, children, onSubmit, onInvalid, onSubmitError, onClick, disabled, className, ...rest
}: SubmitProps<T>) {
  const options: UseSubmitOptions<T, MouseEvent<HTMLButtonElement>> = { onSubmit, onInvalid, onSubmitError, onClick, disabled }
  const state = useSubmit<T, MouseEvent<HTMLButtonElement>>(options)
  const t = useFormMessage()
  if (typeof children === 'function') return <>{children(state)}</>
  if (asChild) return mergeAsChild(children, buttonDom(state as SubmitState<MouseEvent<HTMLElement>>), 'Submit')
  return (
    <button
      {...rest}
      className={className}
      type={state.type}
      disabled={state.disabled}
      aria-busy={state['aria-busy']}
      data-loading={state['data-loading']}
      onClick={state.onClick}
    >
      {children ?? t('submit')}
    </button>
  )
}

export type ResetProps<T = any> = Omit<ButtonPass, 'onClick'> & {
  /** Reset to these values and make them the new initial values (`form.reset(values)`). Default: the current initial values. */
  values?: T
  /**
   * Called after `form.reset`, with the restored values. Use it to query again.
   * `onClick` still runs first; `preventDefault` skips the reset and this callback.
   */
  afterReset?: (values: T) => void
  /** Runs before the reset. `preventDefault` skips the reset. */
  onClick?: (event: MouseEvent<HTMLButtonElement>) => void
  asChild?: boolean
  children?: ReactNode | ((state: ResetState<MouseEvent<HTMLButtonElement>>) => ReactNode)
  className?: string
  disabled?: boolean
}

/**
 * Headless reset control for the surrounding form: `form.reset()` on click. No Ant Design.
 * `type` is `'button'` so the browser's native reset does not bypass the store.
 * Label defaults to `messages.reset` (`重置`). `afterReset` runs after the values are restored.
 *
 * ```tsx
 * <Reset afterReset={(values) => search(values)} asChild><button>重置</button></Reset>
 * ```
 */
export function Reset<T = any>({ asChild, children, values, afterReset, onClick, className, disabled, ...rest }: ResetProps<T>) {
  const options: UseResetOptions<T, MouseEvent<HTMLButtonElement>> = { values, afterReset, onClick }
  const state = useReset<T, MouseEvent<HTMLButtonElement>>(options)
  const t = useFormMessage()
  if (typeof children === 'function') return <>{children(state)}</>
  if (asChild) {
    return mergeAsChild(children, {
      type: 'button',
      disabled,
      onClick: state.onClick as (event: MouseEvent<HTMLElement>) => void,
    }, 'Reset')
  }
  return (
    <button {...rest} className={className} type="button" disabled={disabled} onClick={state.onClick}>
      {children ?? t('reset')}
    </button>
  )
}
