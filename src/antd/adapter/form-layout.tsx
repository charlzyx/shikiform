import { ConfigProvider, type ColProps, type ConfigProviderProps } from 'antd'
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'
import { useContainerWidth } from './use-container-width'

/**
 * How `FormItem` shows feedback: `loose` (default; Ant Design's help row under the control), `terse` (no bottom margin
 * while there is nothing to show — for dense grids and table cells), `popover` (the message floats above the control,
 * no help row), `none` (no message; the control is still colored).
 */
export type FeedbackLayout = 'loose' | 'terse' | 'popover' | 'none'

/** A value, or one value per breakpoint (smallest container first; see {@link FormLayoutProps.breakpoints}). */
export type Responsive<T> = T | readonly T[]

/** Layout every `FormItem` below inherits (Formily `FormLayout`). Nested layouts merge; the nearest wins per key. */
export interface FormLayoutValue {
  /** `horizontal` (label beside the control), `vertical` (label above), or `inline` (items flow in a row). */
  layout?: 'horizontal' | 'vertical' | 'inline'
  labelCol?: ColProps
  wrapperCol?: ColProps
  /** Fixed label column width (`120` = 120px, or any CSS length). Wins over `labelCol`. */
  labelWidth?: number | string
  /** Fixed control column width. Wins over `wrapperCol`; without it the control takes the rest of the row. */
  wrapperWidth?: number | string
  labelAlign?: 'left' | 'right'
  /** Long labels wrap onto several lines instead of being cut off. */
  labelWrap?: boolean
  /** Show the colon after a horizontal label. Default true (Ant Design). */
  colon?: boolean
  /** `true` (default) shows `*` on required items; `false` hides it; `'optional'` marks the optional ones instead. */
  requiredMark?: boolean | 'optional'
  /** `icon` (default): `tooltip` behind a ⓘ icon; `text`: the tooltip text right after the label. */
  tooltipLayout?: 'icon' | 'text'
  /** Control size for everything inside (Ant Design `componentSize`). */
  size?: SizeType
  feedbackLayout?: FeedbackLayout
}

type ResponsiveKey = 'layout' | 'labelCol' | 'wrapperCol' | 'labelWidth' | 'wrapperWidth' | 'labelAlign'

/** {@link FormLayout} props: the inherited {@link FormLayoutValue}, where the column keys may be responsive arrays. */
export type FormLayoutProps = Omit<FormLayoutValue, ResponsiveKey> & {
  [K in ResponsiveKey]?: Responsive<FormLayoutValue[K]>
} & {
  /**
   * Container widths (px) that split responsive values: with `[720, 1280]`, index 0 applies below 720px, 1 below
   * 1280px, 2 above. A shorter array repeats its last value. Default `[720, 1280, 1920]`. Measured on this layout's
   * own box, not the window.
   */
  breakpoints?: readonly number[]
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

type SizeType = ConfigProviderProps['componentSize']

const LAYOUT_KEYS = [
  'layout', 'labelCol', 'wrapperCol', 'labelWidth', 'wrapperWidth', 'labelAlign', 'labelWrap', 'colon', 'requiredMark',
  'tooltipLayout', 'size', 'feedbackLayout',
] as const
const RESPONSIVE_KEYS: readonly ResponsiveKey[] = ['layout', 'labelCol', 'wrapperCol', 'labelWidth', 'wrapperWidth', 'labelAlign']
const DEFAULT_BREAKPOINTS = [720, 1280, 1920]

const FormLayoutContext = createContext<FormLayoutValue>({})

/** The layout `FormItem` inherits here: the merge of every surrounding {@link FormLayout}, responsive values resolved. */
export function useFormLayout(): FormLayoutValue {
  return useContext(FormLayoutContext)
}

/** Index into a responsive array for a container `width` (`undefined` before the first measure: the widest). */
export function breakpointIndex(width: number | undefined, breakpoints: readonly number[]): number {
  if (width === undefined) return breakpoints.length
  const index = breakpoints.findIndex((point) => width < point)
  return index < 0 ? breakpoints.length : index
}

function pick<T>(value: Responsive<T> | undefined, index: number): T | undefined {
  if (!Array.isArray(value)) return value as T | undefined
  if (value.length === 0) return undefined
  return value[Math.min(index, value.length - 1)]
}

const INLINE: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 16, alignItems: 'flex-start' }

/**
 * Give every `FormItem` inside a shared layout (Formily `FormLayout`):
 *
 * ```tsx
 * <FormLayout layout={['vertical', 'horizontal']} labelWidth={96} size="small">
 *   <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input]} />
 * </FormLayout>
 * ```
 *
 * A `FormItem`'s own props and its field's `decoratorProps` win over the layout. `size` also sizes the controls.
 * `layout` / `labelCol` / `wrapperCol` / `labelWidth` / `wrapperWidth` / `labelAlign` accept one value per breakpoint
 * (vertical on a narrow container, horizontal on a wide one); the layout then renders a measuring `<div>`.
 */
export function FormLayout({ children, className, style, breakpoints = DEFAULT_BREAKPOINTS, ...layout }: FormLayoutProps) {
  const parent = useContext(FormLayoutContext)
  const responsive = RESPONSIVE_KEYS.some((key) => Array.isArray(layout[key]))
  const [ref, width] = useContainerWidth<HTMLDivElement>(responsive)
  const index = breakpointIndex(width, breakpoints)
  const value = useMemo(() => {
    const next: FormLayoutValue = { ...parent }
    for (const key of LAYOUT_KEYS) {
      const own = pick(layout[key] as Responsive<unknown>, index)
      if (own !== undefined) (next as Record<string, unknown>)[key] = own
    }
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, index, ...LAYOUT_KEYS.map((key) => layout[key])])
  let content = <FormLayoutContext.Provider value={value}>{children}</FormLayoutContext.Provider>
  if (layout.size) content = <ConfigProvider componentSize={layout.size}>{content}</ConfigProvider>
  const inline = value.layout === 'inline'
  if (!inline && !className && !style && !responsive) return content
  return (
    <div ref={ref} data-form-layout={value.layout} className={className} style={inline ? { ...INLINE, ...style } : style}>
      {content}
    </div>
  )
}
