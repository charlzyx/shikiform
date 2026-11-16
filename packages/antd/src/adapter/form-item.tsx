import { ConfigProvider, Form, Popover, theme, type ColProps, type FormItemProps as AntFormItemProps } from 'antd'
import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore, type CSSProperties, type ReactNode } from 'react'
import type { FormEngine } from '@shikiform/core/internal'
import { FormContext } from '@shikiform/react/internal'
import { FieldGroup, FieldGroupStore, useGroupsErrors } from '@shikiform/react/internal'
import { useFieldContextOrNull } from '@shikiform/react/internal'
import { useUiNodeOrNull } from '@shikiform/react/internal'
import type { FieldBinding } from '@shikiform/react/internal'
import { useFormMessage } from '@shikiform/react/internal'
import { useFormGrid } from './form-grid'
import { useFormLayout, type FormLayoutValue } from './form-layout'

/**
 * `FormItem` props: Ant Design `Form.Item` layout props plus the inheritable {@link FormLayoutValue} keys.
 * The field (name, rules, required) is not here: `FormItem` is a pure decorator and reads it from the surrounding
 * `<Field>`. Outside a field it is pure layout (a label and columns around anything).
 */
export interface FormItemProps
  extends Omit<
      AntFormItemProps,
      | 'name' | 'rules' | 'required' | 'children' | 'validateStatus' | 'help' | 'hidden' | 'layout' | 'dependencies'
      | 'shouldUpdate' | 'trigger' | 'validateTrigger' | 'validateFirst' | 'valuePropName' | 'getValueFromEvent'
      | 'getValueProps' | 'normalize' | 'initialValue' | 'messageVariables' | 'validateDebounce'
    >,
    Omit<FormLayoutValue, 'labelCol' | 'wrapperCol' | 'labelAlign' | 'colon'> {
  /** Force the required mark on (`true`) or off (`false`). Default: the field's `required`, hidden in `readPretty`. */
  asterisk?: boolean
  /** Content before the control, on the same line (a unit, a prefix select …). */
  addonBefore?: ReactNode
  /** Content after the control, on the same line (a unit, a button …). */
  addonAfter?: ReactNode
  /**
   * Columns this item spans inside a {@link FormGrid} (clamped to the grid's current column count); `-1` spans the
   * whole row. Ignored outside a grid.
   */
  gridSpan?: number
  children?: ReactNode
}

/** Environment {@link mapFormItemProps} cannot read itself (the component passes it). */
export interface FormItemEnv {
  /** Ant Design form class prefix (`ConfigProvider` `prefixCls`). Default `ant-form`. */
  prefixCls?: string
  /** Text after an optional label with `requiredMark: 'optional'`. Default `(optional)`. */
  optionalText?: ReactNode
  /** Current column count of the surrounding `FormGrid`, if any (clamps `gridSpan`). */
  gridColumns?: number
  /**
   * Pure layout only (`field` is `null`): the errors of the fields inside that no inner `FormItem` shows. They are
   * the item's help (error colour) unless `feedbackLayout` is `'none'` / `'popover'`. `FormItem` collects them itself.
   */
  errors?: readonly string[]
  /**
   * Whether the field's `id` is on a labelable element (`input`, `select`, `textarea`, `button`…). `false` drops
   * `htmlFor`, so the label does not point at nothing. `FormItem` checks the DOM after each render; default `true`.
   */
  labelFor?: boolean
}

/** A `FieldBinding`-shaped stand-in for pure-layout use (no field around the item). */
const NO_FIELD = {
  errors: [] as string[],
  warnings: [] as string[],
  validating: false,
  required: false,
  pattern: 'editable',
  decoratorProps: {} as Record<string, any>,
} as const

const width = (value: number | string) => (typeof value === 'number' ? `${value}px` : value)

function feedback(messages: readonly string[]): ReactNode {
  if (messages.length <= 1) return messages[0]
  return messages.map((message, index) => <div key={index}>{message}</div>)
}

/**
 * The `Form.Item` props for a field (pure; what `FormItem` renders). Layering, lowest first:
 * `layout` (from `FormLayout`) ← `field.decoratorProps` (`fields` ← JSX ← `$decoratorProps`) ← `props`.
 *
 * - `label` ← `field.title`, `extra` ← `field.description` (an explicit `label` / `extra` wins);
 * - required mark ← `field.required`, hidden in `readPretty` (override with `asterisk`; `requiredMark: false` hides it,
 *   `'optional'` hides it and appends `env.optionalText` to the labels of optional fields);
 * - `validateStatus`: `error` → `validating` → `warning`; `help`: **all** errors, else all warnings, one per line
 *   (`feedbackLayout: 'none'` / `'popover'` drop the help row, `'terse'` drops the bottom margin while there is none);
 * - `labelWidth` / `wrapperWidth` become `labelCol` / `wrapperCol` `flex`; `labelWrap` adds Ant Design's wrap class;
 *   `tooltipLayout: 'text'` puts `tooltip` after the label as text; `gridSpan` sets `gridColumn`;
 * - `htmlFor` ← `field.id`, except in `readPretty` (the view is text) or when `env.labelFor` is `false`;
 * - an item with no label ignores the layout's `labelCol` / `wrapperCol` / `labelWidth` / `wrapperWidth` (Formily).
 *
 * `field` may be `null`: pure layout, no status. A hook user renders the same item without the component:
 * `<Form.Item {...mapFormItemProps(field, {})}>` (the addons and the popover are the component's own markup).
 */
export function mapFormItemProps(
  field: FieldBinding<any> | null,
  props: Omit<FormItemProps, 'children'>,
  layout: FormLayoutValue = {},
  env: FormItemEnv = {},
): AntFormItemProps {
  const binding = field ?? NO_FIELD
  // Like Formily, an item with no label takes no columns from the layout: a label-less field inside a labelled row
  // (`<FormItem label="地址">` over two fields) fills that row instead of shrinking to the layout's `wrapperCol`.
  // Columns given on the item itself (`decoratorProps` / props) still apply.
  const hasLabel = !!(props.label ?? binding.decoratorProps.label ?? field?.title)
  const { labelCol: _lc, wrapperCol: _wc, labelWidth: _lw, wrapperWidth: _ww, ...layoutRest } = layout
  const merged = { ...(hasLabel ? layout : layoutRest), ...binding.decoratorProps, ...props } as FormItemProps & FormLayoutValue
  const {
    asterisk, feedbackLayout = 'loose', size: _size, layout: direction, label, extra, style, addonBefore: _before,
    addonAfter: _after, gridSpan, labelWidth, wrapperWidth, labelWrap, requiredMark = true, tooltipLayout = 'icon',
    tooltip, labelCol, wrapperCol, ...rest
  } = merged
  const status = binding.errors.length ? 'error' : binding.validating ? 'validating' : binding.warnings.length ? 'warning' : undefined
  const messages = binding.errors.length ? binding.errors : binding.warnings
  const quiet = feedbackLayout === 'none' || feedbackLayout === 'popover'
  // A layout item's errors belong to the fields inside: no `validateStatus` (antd would turn every control inside red,
  // the clean ones too); each errored control is red through its own field, the messages take antd's error colour.
  const inner = !field && env.errors?.length ? env.errors : undefined
  const errorCls = `${env.prefixCls ?? 'ant-form'}-item-explain-error`
  const help = quiet
    ? undefined
    : inner
      ? inner.map((message, index) => <div key={index} className={errorCls}>{message}</div>)
      : feedback(messages)
  const isRequired = asterisk ?? (binding.required && binding.pattern !== 'readPretty')
  let text: ReactNode = label ?? (field?.title as ReactNode)
  if (tooltipLayout === 'text' && tooltip && text) {
    text = <>{text}<span data-tooltip-text style={{ marginInlineStart: 4, opacity: 0.65 }}>{tooltip as ReactNode}</span></>
  }
  if (requiredMark === 'optional' && !isRequired && text) {
    text = <>{text}<span data-optional style={{ marginInlineStart: 4, opacity: 0.65 }}>{env.optionalText ?? '(optional)'}</span></>
  }
  let mergedLabelCol: ColProps | undefined = labelWidth !== undefined ? { ...labelCol, span: undefined, flex: `0 0 ${width(labelWidth)}` } : labelCol
  let mergedWrapperCol: ColProps | undefined = wrapperWidth !== undefined
    ? { ...wrapperCol, span: undefined, flex: `0 0 ${width(wrapperWidth)}` }
    : labelWidth !== undefined && !wrapperCol
      ? { flex: '1 1 0', minWidth: 0 } as ColProps
      : wrapperCol
  if (labelWrap) {
    const wrap = `${env.prefixCls ?? 'ant-form'}-item-label-wrap`
    mergedLabelCol = { ...mergedLabelCol, className: [mergedLabelCol?.className, wrap].filter(Boolean).join(' ') }
  }
  let mergedStyle: CSSProperties | undefined = style
  if (feedbackLayout === 'terse' && help === undefined) mergedStyle = { marginBottom: 0, ...mergedStyle }
  if (gridSpan !== undefined && env.gridColumns !== undefined) {
    const span = gridSpan < 0 ? '1 / -1' : `span ${Math.max(1, Math.min(gridSpan, env.gridColumns))}`
    mergedStyle = { gridColumn: span, ...mergedStyle }
  }
  if (inner) rest.className = [rest.className, `${env.prefixCls ?? 'ant-form'}-item-has-error`].filter(Boolean).join(' ')
  const out: AntFormItemProps = {
    ...(field && field.pattern !== 'readPretty' && env.labelFor !== false ? { htmlFor: field.id } : {}),
    ...rest,
    label: text,
    extra: extra ?? (field?.description as ReactNode),
    required: asterisk ?? (requiredMark === true ? isRequired : false),
    validateStatus: status,
    help,
    style: mergedStyle,
  }
  if (tooltipLayout !== 'text' && tooltip !== undefined) out.tooltip = tooltip
  if (mergedLabelCol) out.labelCol = mergedLabelCol
  if (mergedWrapperCol) out.wrapperCol = mergedWrapperCol
  if (direction === 'horizontal' || direction === 'vertical') out.layout = direction
  return out
}

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect
const LABELABLE = 'input:not([type="hidden"]),select,textarea,button,meter,output,progress'

/**
 * Whether `id` is on a labelable element after this commit. Controls that render no element with the field id
 * (Transfer, Upload, a `div`-based custom control, a group whose options have not loaded) would otherwise leave
 * `<label for>` pointing at nothing. Server render and the first client render assume `true`.
 */
function useLabelTarget(id: string | undefined): boolean {
  const [ok, setOk] = useState(true)
  useIsoLayoutEffect(() => {
    if (!id) return
    const target = document.getElementById(id)
    const next = !!target && target.matches(LABELABLE)
    if (next !== ok) setOk(next)
  })
  return ok
}

const ADDON_ROW: CSSProperties = { display: 'flex', alignItems: 'center', gap: 8 }

/**
 * Who shows which field's errors, so a pure-layout item does not repeat them. A field item that shows feedback
 * claims its path (exact) in every layout item around it; a layout item claims the paths of its group (with their
 * descendants) in the layout items around it.
 */
class FeedbackClaims {
  readonly exact = new FieldGroupStore()
  readonly deep = new FieldGroupStore()
  subscribe = (listener: () => void): (() => void) => {
    const a = this.exact.subscribe(listener)
    const b = this.deep.subscribe(listener)
    return () => {
      a()
      b()
    }
  }
  version = (): string => `${this.exact.version()},${this.deep.version()}`
  covers(path: string): boolean {
    if (this.exact.paths().includes(path)) return true
    return this.deep.paths().some((one) => one === '' || path === one || path.startsWith(one + '.'))
  }
}

interface ClaimRegistrar {
  claim(path: string, deep: boolean): () => void
}

export const ClaimContext = createContext<ClaimRegistrar | null>(null)

function useClaim(path: string | undefined, deep: boolean): void {
  const registrar = useContext(ClaimContext)
  useEffect(() => (registrar && path !== undefined ? registrar.claim(path, deep) : undefined), [registrar, path, deep])
}

/**
 * Decorator for the current field (Formily `FormItem`). It owns nothing: use it as a `<Field>` decorator,
 *
 * ```tsx
 * <Field name="email" title="邮箱" required decorator={[FormItem, { tooltip: '工作邮箱' }]} component={[Input]} />
 * ```
 *
 * or inside a `<Field>`. It reads the field from context and renders an Ant Design `Form.Item` from
 * {@link mapFormItemProps}: label (`title`), extra (`description`), the required mark, status and every message, plus
 * the inherited {@link FormLayout}. Display `hidden` / `none` renders nothing. `virtual` still renders (it validates and shows errors).
 *
 * Outside a field it is pure layout (Formily `FormItem.BaseItem`): a label and the layout's columns around anything,
 * e.g. one label over two fields. It shows the errors of the fields inside that no inner `FormItem` shows (a field
 * without a decorator, or one whose item has `feedbackLayout: 'none'`), once per distinct message:
 *
 * ```tsx
 * <FormItem label="日期" asterisk>
 *   <Space.Compact><Field name="start" component={[DatePicker]} /><Field name="end" component={[DatePicker]} /></Space.Compact>
 * </FormItem>
 * ```
 */
export function FormItem(props: FormItemProps) {
  const field = useFieldContextOrNull()
  const form = useContext(FormContext)
  if (field) return <FieldFormItem field={field} props={props} />
  if (form) return <LayoutFormItem form={form} props={props} />
  return <FormItemView field={null} props={props} errors={undefined} />
}

function FieldFormItem({ field, props }: { field: FieldBinding<any>; props: FormItemProps }) {
  const layout = useFormLayout()
  const feedbackLayout = props.feedbackLayout ?? field.decoratorProps.feedbackLayout ?? layout.feedbackLayout
  const shown = field.display === 'visible' || field.display === 'virtual'
  useClaim(shown && feedbackLayout !== 'none' ? field.path : undefined, false)
  if (!shown) return null
  return <FormItemView field={field} props={props} errors={undefined} />
}

function LayoutFormItem({ form, props }: { form: FormEngine<any, any>; props: FormItemProps }) {
  const parent = useContext(ClaimContext)
  const layout = useFormLayout()
  const [group] = useState(() => new FieldGroupStore())
  const [claims] = useState(() => new FeedbackClaims())
  const registrar = useMemo<ClaimRegistrar>(
    () => ({
      claim(path, deep) {
        const own = (deep ? claims.deep : claims.exact).add(path)
        const up = parent?.claim(path, deep)
        return () => {
          own()
          up?.()
        }
      },
    }),
    [claims, parent],
  )
  const shows = (props.feedbackLayout ?? layout.feedbackLayout) !== 'none'
  // This item shows the errors of its group, so the layout items around it must not show them again.
  useEffect(() => {
    if (!parent || !shows) return
    const held = new Map<string, () => void>()
    const sync = () => {
      const now = new Set(group.paths())
      for (const [path, release] of held) {
        if (!now.has(path)) {
          release()
          held.delete(path)
        }
      }
      for (const path of now) if (!held.has(path)) held.set(path, parent.claim(path, true))
    }
    sync()
    const stop = group.subscribe(sync)
    return () => {
      stop()
      for (const release of held.values()) release()
    }
  }, [parent, group, shows])
  const errors = useGroupsErrors(form, [group])[0]!
  const claimed = useSyncExternalStore(claims.subscribe, claims.version, claims.version)
  const messages = useMemo(() => {
    const out: string[] = []
    for (const error of errors) {
      if (claims.covers(error.path)) continue
      for (const message of error.messages) if (!out.includes(message)) out.push(message)
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [errors, claimed, claims])
  return (
    <FormItemView field={null} props={props} errors={messages}>
      <ClaimContext.Provider value={registrar}>
        <FieldGroup value={group}>{props.children}</FieldGroup>
      </ClaimContext.Provider>
    </FormItemView>
  )
}

function FormItemView({
  field,
  props: { children: own, ...props },
  errors,
  children = own,
}: {
  field: FieldBinding<any> | null
  props: FormItemProps
  errors: readonly string[] | undefined
  children?: ReactNode
}) {
  const node = useUiNodeOrNull()
  // The decorator of a `<UI title description>`: label / extra come from the node (props win).
  if (!field && node) props = { label: node.title, extra: node.description, ...props }
  const layout = useFormLayout()
  const grid = useFormGrid()
  const t = useFormMessage()
  const { getPrefixCls } = useContext(ConfigProvider.ConfigContext)
  const { token } = theme.useToken()
  const decorator = field?.decoratorProps ?? {}
  const pick = <K extends 'size' | 'feedbackLayout' | 'addonBefore' | 'addonAfter'>(key: K) => (props[key] ?? decorator[key]) as FormItemProps[K]
  const size = pick('size') ?? layout.size
  const feedbackLayout = pick('feedbackLayout') ?? layout.feedbackLayout
  const addonBefore = pick('addonBefore')
  const addonAfter = pick('addonAfter')
  const labelFor = useLabelTarget(field && field.pattern !== 'readPretty' ? field.id : undefined)
  const itemProps = mapFormItemProps(field, props, layout, {
    labelFor,
    prefixCls: getPrefixCls('form'),
    optionalText: t('optional'),
    gridColumns: grid?.columns,
    errors,
  })
  let content: ReactNode = children
  if (addonBefore !== undefined || addonAfter !== undefined) {
    content = (
      <div data-form-item-addons style={ADDON_ROW}>
        {addonBefore !== undefined && <span data-addon-before>{addonBefore}</span>}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
        {addonAfter !== undefined && <span data-addon-after>{addonAfter}</span>}
      </div>
    )
  }
  if (feedbackLayout === 'popover') {
    const failed = field ? field.errors.length > 0 : !!errors?.length
    const messages = field ? (field.errors.length ? field.errors : field.warnings) : (errors ?? [])
    if (field || messages.length || errors) {
      content = (
        <Popover open={messages.length > 0} placement="top" content={<div style={{ color: failed ? token.colorError : token.colorWarning }}>{feedback(messages)}</div>}>
          <div data-feedback-popover>{content}</div>
        </Popover>
      )
    }
  }
  const item = <Form.Item {...itemProps}>{content}</Form.Item>
  return size && size !== layout.size ? <ConfigProvider componentSize={size}>{item}</ConfigProvider> : item
}
