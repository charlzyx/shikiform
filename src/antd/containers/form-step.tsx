import { Steps, type StepsProps } from 'antd'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { FormEngine } from '../../core/engine/form-engine'
import { FieldGroup, useGroupsErrors, type FieldGroupStore } from '../../react/field-group'
import { useRequiredForm } from '../../react/context'
import { collectPanes, markerOutside, usePaneGroups, useRevealOnFail } from './panes'

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** What `<FormStep>` attaches to its handle: the form and one field group per step. */
interface StepLink {
  form: FormEngine<any, any>
  groups: FieldGroupStore[]
}

const LINK = Symbol('shikiform.formStep')

/**
 * The step state of a {@link FormStep} (Formily `FormStep.createFormStep()`), from {@link useFormStep}.
 * Create it where the buttons are, pass it to `<FormStep step={step}>`.
 */
export interface FormStepHandle {
  /** Current step index (0-based). */
  readonly current: number
  /** Number of steps (`0` until `<FormStep>` mounted). */
  readonly count: number
  readonly isFirst: boolean
  /** On the last step: show `<Submit />` instead of a next button. */
  readonly isLast: boolean
  /**
   * Validate the current step's editable fields (`form.validate(paths)`, one pass) and go forward when they are clean.
   * Resolves `false` (and stays) on errors, on the last step, or before `<FormStep>` mounted. Never rejects.
   * Fields that are not editable (readPretty / readOnly / disabled, own or inherited) do not block: the user
   * cannot fix them here, and submit still validates every field.
   */
  next(): Promise<boolean>
  /** Go back one step (no validation). */
  back(): void
  /** Jump to a step (no validation), clamped to the steps that exist. */
  goTo(index: number): void
  /** @internal */
  readonly [LINK]: { link: { current: StepLink | null }; setCount: (count: number) => void }
}

export interface UseFormStepOptions {
  /** Initial step when uncontrolled. Default `0`. */
  defaultCurrent?: number
  /** Controlled step index: `next` / `back` / `goTo` then only call `onChange`. */
  current?: number
  onChange?: (current: number) => void
}

/**
 * Step state for a {@link FormStep}: `current`, `isLast`, and `next()` (validates the current step) / `back()` /
 * `goTo()`. Call it in the component that renders the buttons; it does not need to be inside `<Form>`.
 *
 * ```tsx
 * const step = useFormStep()
 * <FormStep step={step}>…<FormStep.Step title="账号">…</FormStep.Step>…</FormStep>
 * <Button disabled={step.isFirst} onClick={step.back}>上一步</Button>
 * {step.isLast ? <Submit /> : <Button type="primary" onClick={step.next}>下一步</Button>}
 * ```
 */
export function useFormStep(options: UseFormStepOptions = {}): FormStepHandle {
  const [inner, setInner] = useState(options.defaultCurrent ?? 0)
  const [count, setCount] = useState(0)
  const link = useRef<StepLink | null>(null)
  const [internal] = useState(() => ({ link, setCount }))
  const raw = options.current ?? inner
  const current = count ? Math.min(Math.max(raw, 0), count - 1) : Math.max(raw, 0)
  const latest = useRef({ current, count, options })
  latest.current = { current, count, options }

  const goTo = useCallback((index: number) => {
    const { count: total, options: opts } = latest.current
    const next = total ? Math.min(Math.max(index, 0), total - 1) : Math.max(index, 0)
    if (next === latest.current.current) return
    if (opts.current === undefined) setInner(next)
    opts.onChange?.(next)
  }, [])
  const back = useCallback(() => goTo(latest.current.current - 1), [goTo])
  const next = useCallback(async (): Promise<boolean> => {
    const { current: from, count: total } = latest.current
    const attached = link.current
    if (!attached || from >= total - 1) return false
    const group = attached.groups[from]
    const paths = group ? group.paths().filter((path) => attached.form.query(path).$pattern === 'editable') : []
    let errors
    try {
      errors = await attached.form.validate(paths)
    } catch (error) {
      // A form-level validate threw: stay, like submit's `reason: 'error'`.
      console.error('[shikiform] FormStep next() validation failed', error)
      return false
    }
    if (errors.length) return false
    // Only move when nobody moved meanwhile (a double click validates twice but advances once).
    if (latest.current.current !== from) return false
    goTo(from + 1)
    return true
  }, [goTo])

  return useMemo(
    () => ({
      current,
      count,
      isFirst: current === 0,
      isLast: count === 0 || current >= count - 1,
      next,
      back,
      goTo,
      [LINK]: internal,
    }),
    [current, count, next, back, goTo, internal],
  )
}

/** One step of a {@link FormStep}. Read as data by `FormStep`; it renders nothing on its own. */
export interface FormStepStepProps {
  /** A stable key for the step body (default: its index). */
  name?: string
  /** Shown in the antd `Steps` bar. */
  title: ReactNode
  description?: ReactNode
  subTitle?: ReactNode
  icon?: ReactNode
  /** The step's fields. All steps stay mounted; only the current one is shown. */
  children?: ReactNode
}

const Step = function Step(_props: FormStepStepProps): ReactNode {
  return markerOutside('FormStep', 'Step')
}

/** `FormStep` props: antd `Steps` props except `current` / `items` / `onChange`, plus the handle. */
export interface FormStepProps extends Omit<StepsProps, 'current' | 'items' | 'onChange' | 'children'> {
  /** From {@link useFormStep}. */
  step: FormStepHandle
  /** `<FormStep.Step>` elements (fragments and `cond && <FormStep.Step>` are fine). */
  children?: ReactNode
}

function FormStepRoot({ step, children, ...rest }: FormStepProps) {
  const form = useRequiredForm('<FormStep>')
  const steps = collectPanes(children, Step, 'FormStep.Step')
  const groups = usePaneGroups(steps.map((one) => one.key))
  const errors = useGroupsErrors(form, groups)
  const internal = step[LINK]
  useIsoLayoutEffect(() => {
    internal.link.current = { form, groups }
    internal.setCount(steps.length)
  })
  useEffect(
    () => () => {
      internal.link.current = null
      internal.setCount(0)
    },
    [internal],
  )
  const current = step.current
  // A failed submit / validate goes to the earliest step with an error (controlled: `onChange` only).
  useRevealOnFail(form, groups, ([first]) => step.goTo(first!))
  return (
    <div data-form-step="">
      <Steps
        {...rest}
        current={current}
        items={steps.map(({ props }, index) => ({
          title: props.title,
          description: props.description,
          subTitle: props.subTitle,
          icon: props.icon,
          status: errors[index]!.length ? 'error' : undefined,
        }))}
      />
      {steps.map(({ key, props }, index) => (
        <div key={key} hidden={index !== current} data-step-index={index} style={{ marginTop: 24 }}>
          <FieldGroup value={groups[index]!}>{props.children}</FieldGroup>
        </div>
      ))}
    </div>
  )
}

/**
 * A step-by-step form (Formily `FormStep`): an antd `Steps` bar and one body per `<FormStep.Step>`. Every body is
 * mounted (others are `hidden`), so earlier answers stay and the final submit validates and submits every step.
 * `step.next()` validates only the current step's fields; a step with errors shows the `error` status. When a
 * submit (or `form.validate()`) fails, the earliest step with an error becomes current and `<Form>` focuses its field.
 * The last step submits with the usual `<Submit />` / `<Form onSubmit>`.
 *
 * ```tsx
 * const step = useFormStep()
 * <Form form={form} onSubmit={save}>
 *   <FormStep step={step}>
 *     <FormStep.Step title="账号"><Field name="email" … /></FormStep.Step>
 *     <FormStep.Step title="资料"><Field name="nickname" … /></FormStep.Step>
 *   </FormStep>
 *   <FormButtonGroup.FormItem>
 *     <Button disabled={step.isFirst} onClick={step.back}>上一步</Button>
 *     {step.isLast ? <Submit /> : <Button type="primary" onClick={step.next}>下一步</Button>}
 *   </FormButtonGroup.FormItem>
 * </Form>
 * ```
 */
export const FormStep = Object.assign(FormStepRoot, { Step })
