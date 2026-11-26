import type {
  CSSProperties,
  HTMLAttributes,
  ReactNode,
  TableHTMLAttributes,
  TdHTMLAttributes,
  ThHTMLAttributes,
} from 'react'
import { Separator as SdkSeparator } from '@ui-sdk/react/separator'
import {
  Toolbar as SdkToolbar,
  ToolbarButton,
  ToolbarGroup,
  ToolbarInput,
  ToolbarLink,
  ToolbarSeparator,
} from '@ui-sdk/react/toolbar'
import { cx } from './primitives'
import {
  AlertTriangleIcon,
  CheckCircleIcon,
  InboxIcon,
  InfoIcon,
  XCircleIcon,
  XIcon,
} from './icons'

// ---------------------------------------------------------------------------
// Badge & Tag
// ---------------------------------------------------------------------------

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'outline'
  dot?: boolean
  closable?: boolean
  onClose?: () => void
  color?: string
}

export function Badge({
  variant = 'default',
  dot = false,
  closable = false,
  onClose,
  color,
  className,
  style,
  children,
  ...rest
}: BadgeProps) {
  const customStyle: CSSProperties | undefined = color
    ? {
        borderColor: `color-mix(in srgb, ${color} 32%, transparent)`,
        backgroundColor: `color-mix(in srgb, ${color} 10%, transparent)`,
        color,
        ...style,
      }
    : style

  return (
    <span
      data-variant={variant}
      className={cx('sf-ui-badge', `sf-ui-badge--${variant}`, className)}
      style={customStyle}
      {...rest}
    >
      {dot ? <span className="sf-ui-badge-dot" style={color ? { backgroundColor: color } : undefined} aria-hidden="true" /> : null}
      <span>{children}</span>
      {closable ? (
        <button
          type="button"
          className="sf-ui-badge-close"
          aria-label="移除"
          onClick={(e) => {
            e.stopPropagation()
            onClose?.()
          }}
        >
          <XIcon size={11} />
        </button>
      ) : null}
    </span>
  )
}

export const Tag = Badge
export type TagProps = BadgeProps

// ---------------------------------------------------------------------------
// Alert
// ---------------------------------------------------------------------------

export interface AlertProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  variant?: 'info' | 'success' | 'warning' | 'danger'
  title?: ReactNode
  icon?: ReactNode | false
  action?: ReactNode
}

const ALERT_ICONS = {
  info: InfoIcon,
  success: CheckCircleIcon,
  warning: AlertTriangleIcon,
  danger: XCircleIcon,
} as const

export function Alert({
  variant = 'info',
  title,
  icon,
  action,
  role,
  className,
  children,
  ...rest
}: AlertProps) {
  const Icon = ALERT_ICONS[variant]
  const resolvedRole = role ?? (variant === 'danger' ? 'alert' : 'status')
  return (
    <div
      role={resolvedRole}
      data-variant={variant}
      className={cx('sf-ui-alert', `sf-ui-alert--${variant}`, className)}
      {...rest}
    >
      {icon !== false ? (
        <span className="sf-ui-alert-icon" aria-hidden="true">
          {icon ?? <Icon size={15} />}
        </span>
      ) : null}
      <div className="sf-ui-alert-body">
        {title ? <div className="sf-ui-alert-title">{title}</div> : null}
        {children ? <div className="sf-ui-alert-desc">{children}</div> : null}
      </div>
      {action ? <div className="sf-ui-alert-action">{action}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Card
// ---------------------------------------------------------------------------

export interface CardProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  title?: ReactNode
  description?: ReactNode
  extra?: ReactNode
  footer?: ReactNode
  variant?: 'default' | 'muted' | 'outline'
  padding?: 'none' | 'sm' | 'md'
}

export function Card({
  title,
  description,
  extra,
  footer,
  variant = 'default',
  padding = 'md',
  className,
  children,
  ...rest
}: CardProps) {
  const hasHeader = Boolean(title || description || extra)
  return (
    <div
      data-variant={variant}
      className={cx('sf-ui-card', `sf-ui-card--${variant}`, className)}
      {...rest}
    >
      {hasHeader ? (
        <div className="sf-ui-card-head">
          <div className="sf-ui-card-titles">
            {title ? <div className="sf-ui-card-title">{title}</div> : null}
            {description ? <div className="sf-ui-card-desc">{description}</div> : null}
          </div>
          {extra ? <div className="sf-ui-card-extra">{extra}</div> : null}
        </div>
      ) : null}
      <div className={cx('sf-ui-card-body', `sf-ui-card-body--${padding}`)}>{children}</div>
      {footer ? <div className="sf-ui-card-foot">{footer}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Table
// ---------------------------------------------------------------------------

export interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  compact?: boolean
  striped?: boolean
  stickyHeader?: boolean
  bordered?: boolean
  tabularNums?: boolean
  wrapperClassName?: string
  wrapperStyle?: CSSProperties
}

export function Table({
  compact = false,
  striped = false,
  stickyHeader = false,
  bordered = false,
  tabularNums = true,
  wrapperClassName,
  wrapperStyle,
  className,
  children,
  ...rest
}: TableProps) {
  return (
    <div
      className={cx(
        'sf-ui-table-wrap',
        stickyHeader && 'sf-ui-table-wrap--sticky',
        wrapperClassName,
      )}
      style={wrapperStyle}
    >
      <table
        className={cx(
          'sf-ui-table',
          compact && 'sf-ui-table--compact',
          striped && 'sf-ui-table--striped',
          bordered && 'sf-ui-table--bordered',
          tabularNums && 'sf-ui-table--tabular',
          className,
        )}
        {...rest}
      >
        {children}
      </table>
    </div>
  )
}

export function TableHead({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cx('sf-ui-thead', className)} {...props} />
}

export function TableBody({ className, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cx('sf-ui-tbody', className)} {...props} />
}

export function TableRow({ className, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cx('sf-ui-tr', className)} {...props} />
}

export function TableHeader({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cx('sf-ui-th', className)} {...props} />
}

export function TableCell({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cx('sf-ui-td', className)} {...props} />
}

export function TableCaption({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <caption className={cx('sf-ui-tcaption', className)} {...props} />
}

// ---------------------------------------------------------------------------
// Empty
// ---------------------------------------------------------------------------

export interface EmptyProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  icon?: ReactNode
  title?: ReactNode
  description?: ReactNode
  action?: ReactNode
  compact?: boolean
}

export function Empty({
  icon,
  title = '暂无数据',
  description,
  action,
  compact = false,
  className,
  ...rest
}: EmptyProps) {
  return (
    <div className={cx('sf-ui-empty', compact && 'sf-ui-empty--compact', className)} {...rest}>
      <div className="sf-ui-empty-icon" aria-hidden="true">
        {icon ?? <InboxIcon size={compact ? 22 : 28} />}
      </div>
      {title ? <div className="sf-ui-empty-title">{title}</div> : null}
      {description ? <div className="sf-ui-empty-desc">{description}</div> : null}
      {action ? <div className="sf-ui-empty-action">{action}</div> : null}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Divider
// ---------------------------------------------------------------------------

export interface DividerProps {
  orientation?: 'horizontal' | 'vertical'
  decorative?: boolean
  children?: ReactNode
  className?: string
  style?: CSSProperties
}

export function Divider({
  orientation = 'horizontal',
  decorative = true,
  children,
  className,
  style,
}: DividerProps) {
  if (children && orientation === 'horizontal') {
    return (
      <div className={cx('sf-ui-divider-label', className)} style={style} role="separator">
        <span className="sf-ui-divider-line" aria-hidden="true" />
        <span className="sf-ui-divider-text">{children}</span>
        <span className="sf-ui-divider-line" aria-hidden="true" />
      </div>
    )
  }
  return (
    <SdkSeparator
      orientation={orientation}
      decorative={decorative}
      className={cx('sf-ui-divider', `sf-ui-divider--${orientation}`, className)}
      style={style}
    />
  )
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

export interface ToolbarProps {
  orientation?: 'horizontal' | 'vertical'
  disabled?: boolean
  ariaLabel?: string
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Toolbar({
  orientation = 'horizontal',
  disabled,
  ariaLabel = '工具栏',
  className,
  style,
  children,
}: ToolbarProps) {
  return (
    <SdkToolbar
      orientation={orientation}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cx('sf-ui-toolbar', `sf-ui-toolbar--${orientation}`, className)}
      style={style}
    >
      {children}
    </SdkToolbar>
  )
}

export { ToolbarButton, ToolbarGroup, ToolbarInput, ToolbarLink, ToolbarSeparator }
