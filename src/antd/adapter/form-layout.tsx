import { ConfigProvider, type ColProps, type ConfigProviderProps } from 'antd'
import { createContext, useContext, useMemo, type CSSProperties, type ReactNode } from 'react'

/**
 * How `FormItem` shows feedback: `loose` (default; Ant Design's help row under the control), `terse` (no bottom margin
 * while there is nothing to show — for dense grids and table cells), `none` (no message; the control is still colored).
 */
export type FeedbackLayout = 'loose' | 'terse' | 'none'

/** Layout every `FormItem` below inherits (Formily `FormLayout`). Nested layouts merge; the nearest wins per key. */
export interface FormLayoutProps {
  /** `horizontal` (label beside the control), `vertical` (label above), or `inline` (items flow in a row). */
  layout?: 'horizontal' | 'vertical' | 'inline'
  labelCol?: ColProps
  wrapperCol?: ColProps
  labelAlign?: 'left' | 'right'
  /** Show the colon after a horizontal label. Default true (Ant Design). */
  colon?: boolean
  /** Control size for everything inside (Ant Design `componentSize`). */
  size?: SizeType
  feedbackLayout?: FeedbackLayout
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** The inherited part of {@link FormLayoutProps} (no `children` / `className` / `style`). */
export type FormLayoutValue = Omit<FormLayoutProps, 'children' | 'className' | 'style'>

type SizeType = ConfigProviderProps['componentSize']

const LAYOUT_KEYS = ['layout', 'labelCol', 'wrapperCol', 'labelAlign', 'colon', 'size', 'feedbackLayout'] as const

const FormLayoutContext = createContext<FormLayoutValue>({})

/** The layout `FormItem` inherits here: the merge of every surrounding {@link FormLayout}. */
export function useFormLayout(): FormLayoutValue {
  return useContext(FormLayoutContext)
}

const INLINE: CSSProperties = { display: 'flex', flexWrap: 'wrap', columnGap: 16, alignItems: 'flex-start' }

/**
 * Give every `FormItem` inside a shared layout (Formily `FormLayout`):
 *
 * ```tsx
 * <FormLayout layout="horizontal" labelCol={{ span: 6 }} wrapperCol={{ span: 18 }} size="small">
 *   <Field name="email" title="邮箱" decorator={[FormItem]} component={[Input]} />
 * </FormLayout>
 * ```
 *
 * A `FormItem`'s own props and its field's `decoratorProps` win over the layout. `size` also sizes the controls.
 */
export function FormLayout({ children, className, style, ...layout }: FormLayoutProps) {
  const parent = useContext(FormLayoutContext)
  const value = useMemo(() => {
    const next: FormLayoutValue = { ...parent }
    for (const key of LAYOUT_KEYS) if (layout[key] !== undefined) (next as Record<string, unknown>)[key] = layout[key]
    return next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent, ...LAYOUT_KEYS.map((key) => layout[key])])
  let content = <FormLayoutContext.Provider value={value}>{children}</FormLayoutContext.Provider>
  if (layout.size) content = <ConfigProvider componentSize={layout.size}>{content}</ConfigProvider>
  const inline = value.layout === 'inline'
  if (!inline && !className && !style) return content
  return (
    <div data-form-layout={value.layout} className={className} style={inline ? { ...INLINE, ...style } : style}>
      {content}
    </div>
  )
}
