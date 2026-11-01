import { theme } from 'antd'
import type { CSSProperties, ReactNode } from 'react'
import { FormItem, type FormItemProps } from './form-item'
import { useFormLayout } from './form-layout'

/** {@link FormButtonGroup} props. */
export interface FormButtonGroupProps {
  /** Horizontal alignment of the buttons. Default `left`. */
  align?: 'left' | 'center' | 'right'
  /** Space between buttons (px). Default `8`. */
  gap?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

const JUSTIFY = { left: 'flex-start', center: 'center', right: 'flex-end' } as const

function Group({ align = 'left', gap = 8, className, style, children }: FormButtonGroupProps) {
  return (
    <div data-form-button-group className={className} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap, justifyContent: JUSTIFY[align], ...style }}>
      {children}
    </div>
  )
}

/**
 * The buttons under the fields, lined up with the control column of the surrounding `FormLayout` (an empty label of
 * the same width, so `labelCol` and `labelWidth` both line up). `FormItem` layout props are accepted.
 */
function GroupFormItem({ align, gap, className, style, children, ...item }: FormButtonGroupProps & Omit<FormItemProps, 'children'>) {
  const layout = useFormLayout()
  const direction = item.layout ?? layout.layout
  return (
    <FormItem label={direction === 'vertical' || direction === 'inline' ? undefined : ' '} colon={false} asterisk={false} {...item}>
      <Group align={align} gap={gap} className={className} style={style}>{children}</Group>
    </FormItem>
  )
}

/** {@link FormButtonGroup.Sticky} props. */
export interface FormButtonGroupStickyProps {
  /** Which edge of the scroll container it sticks to. Default `bottom`. */
  position?: 'top' | 'bottom'
  /** Offset from that edge (px). Default `0`. */
  offset?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

/** A bar that stays at the bottom (or top) of the scroll container while the form scrolls (CSS `position: sticky`). */
function Sticky({ position = 'bottom', offset = 0, className, style, children }: FormButtonGroupStickyProps) {
  const { token } = theme.useToken()
  const edge = position === 'bottom' ? { bottom: offset, borderTop: `1px solid ${token.colorSplit}` } : { top: offset, borderBottom: `1px solid ${token.colorSplit}` }
  return (
    <div
      data-form-button-group-sticky={position}
      className={className}
      style={{ position: 'sticky', zIndex: 10, background: token.colorBgContainer, padding: `${token.paddingSM}px 0`, ...edge, ...style }}
    >
      {children}
    </div>
  )
}

/**
 * A row of buttons (Formily `FormButtonGroup`). `FormButtonGroup.FormItem` aligns it with the controls of the
 * surrounding `FormLayout`; `FormButtonGroup.Sticky` keeps it in view while a long form scrolls.
 *
 * ```tsx
 * <FormLayout labelWidth={96}>
 *   …fields
 *   <FormButtonGroup.FormItem><Submit /><Reset /></FormButtonGroup.FormItem>
 * </FormLayout>
 * ```
 */
export const FormButtonGroup = Object.assign(Group, { FormItem: GroupFormItem, Sticky })
