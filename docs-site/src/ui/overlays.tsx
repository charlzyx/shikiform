import type { CSSProperties, ReactNode } from 'react'
import {
  Dialog as SdkDialog,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@ui-sdk/react/dialog'
import {
  Drawer as SdkDrawer,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
} from '@ui-sdk/react/drawer'
import {
  Popover as SdkPopover,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
} from '@ui-sdk/react/popover'
import {
  Tabs as SdkTabs,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
} from '@ui-sdk/react/tabs'
import {
  Tooltip as SdkTooltip,
  TooltipContent,
  TooltipTrigger,
} from '@ui-sdk/react/tooltip'
import {
  Pagination as SdkPagination,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationList,
  PaginationNext,
  PaginationPrevious,
} from '@ui-sdk/react/pagination'
import { cx } from './primitives'
import { ChevronLeftIcon, ChevronRightIcon, MoreHorizontalIcon, XIcon } from './icons'

// ---------------------------------------------------------------------------
// Dialog
// ---------------------------------------------------------------------------

export interface DialogProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger?: ReactNode
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  closeLabel?: string
  showClose?: boolean
  size?: 'sm' | 'md' | 'lg'
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Dialog({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  footer,
  closeLabel = '关闭',
  showClose = true,
  size = 'md',
  className,
  style,
  children,
}: DialogProps) {
  return (
    <SdkDialog
      open={open}
      defaultOpen={open === undefined ? defaultOpen : undefined}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      {trigger ? <DialogTrigger className="sf-ui-btn sf-ui-btn--outline sf-ui-btn--md">{trigger}</DialogTrigger> : null}
      <DialogBackdrop className="sf-ui-dialog-backdrop" />
      <DialogContent
        data-size={size}
        className={cx('sf-ui-dialog-content', `sf-ui-dialog-content--${size}`, className)}
        style={style}
      >
        {(title || description || showClose) ? (
          <div className="sf-ui-dialog-header">
            <div className="sf-ui-dialog-heading">
              {title ? <DialogTitle className="sf-ui-dialog-title">{title}</DialogTitle> : null}
              {description ? <DialogDescription className="sf-ui-dialog-desc">{description}</DialogDescription> : null}
            </div>
            {showClose ? (
              <DialogClose className="sf-ui-dialog-x" aria-label={closeLabel}>
                <XIcon size={15} />
              </DialogClose>
            ) : null}
          </div>
        ) : null}
        <div className="sf-ui-dialog-body">{children}</div>
        {footer !== undefined && footer !== null ? (
          <div className="sf-ui-dialog-footer">{footer}</div>
        ) : null}
      </DialogContent>
    </SdkDialog>
  )
}

export {
  SdkDialog as DialogRoot,
  DialogBackdrop,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
}

// ---------------------------------------------------------------------------
// Drawer
// ---------------------------------------------------------------------------

export interface DrawerProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  side?: 'right' | 'left' | 'bottom' | 'top'
  trigger?: ReactNode
  title?: ReactNode
  description?: ReactNode
  footer?: ReactNode
  closeLabel?: string
  showClose?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Drawer({
  open,
  defaultOpen,
  onOpenChange,
  side = 'right',
  trigger,
  title,
  description,
  footer,
  closeLabel = '关闭',
  showClose = true,
  className,
  style,
  children,
}: DrawerProps) {
  return (
    <SdkDrawer
      open={open}
      defaultOpen={open === undefined ? defaultOpen : undefined}
      side={side}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      {trigger ? <DrawerTrigger className="sf-ui-btn sf-ui-btn--outline sf-ui-btn--md">{trigger}</DrawerTrigger> : null}
      <DrawerBackdrop className="sf-ui-drawer-backdrop" />
      <DrawerContent
        data-side={side}
        className={cx('sf-ui-drawer-content', `sf-ui-drawer-content--${side}`, className)}
        style={style}
      >
        {(title || description || showClose) ? (
          <div className="sf-ui-dialog-header">
            <div className="sf-ui-dialog-heading">
              {title ? <DrawerTitle className="sf-ui-dialog-title">{title}</DrawerTitle> : null}
              {description ? <DrawerDescription className="sf-ui-dialog-desc">{description}</DrawerDescription> : null}
            </div>
            {showClose ? (
              <DrawerClose className="sf-ui-dialog-x" aria-label={closeLabel}>
                <XIcon size={15} />
              </DrawerClose>
            ) : null}
          </div>
        ) : null}
        <div className="sf-ui-dialog-body">{children}</div>
        {footer !== undefined && footer !== null ? (
          <div className="sf-ui-dialog-footer">{footer}</div>
        ) : null}
      </DrawerContent>
    </SdkDrawer>
  )
}

export {
  SdkDrawer as DrawerRoot,
  DrawerBackdrop,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
  DrawerTrigger,
}

// ---------------------------------------------------------------------------
// Popover
// ---------------------------------------------------------------------------

export interface PopoverProps {
  open?: boolean
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  trigger: ReactNode
  title?: ReactNode
  description?: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  className?: string
  children?: ReactNode
}

export function Popover({
  open,
  defaultOpen,
  onOpenChange,
  trigger,
  title,
  description,
  side = 'bottom',
  align = 'start',
  className,
  children,
}: PopoverProps) {
  return (
    <SdkPopover
      open={open}
      defaultOpen={open === undefined ? defaultOpen : undefined}
      onOpenChange={onOpenChange ? (next) => onOpenChange(next) : undefined}
    >
      <PopoverTrigger className="sf-ui-btn sf-ui-btn--outline sf-ui-btn--md">{trigger}</PopoverTrigger>
      <PopoverContent side={side} align={align} sideOffset={6} className={cx('sf-ui-popover-content', className)}>
        {title ? <PopoverTitle className="sf-ui-popover-title">{title}</PopoverTitle> : null}
        {description ? <PopoverDescription className="sf-ui-popover-desc">{description}</PopoverDescription> : null}
        {children}
      </PopoverContent>
    </SdkPopover>
  )
}

export {
  SdkPopover as PopoverRoot,
  PopoverClose,
  PopoverContent,
  PopoverDescription,
  PopoverTitle,
  PopoverTrigger,
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

export interface TabItem {
  value: string
  label: ReactNode
  content: ReactNode
  disabled?: boolean
  badge?: ReactNode
  keepMounted?: boolean
}

export interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (value: string) => void
  onChange?: (value: string) => void
  items?: readonly TabItem[]
  variant?: 'segmented' | 'underline'
  keepMounted?: boolean
  className?: string
  style?: CSSProperties
  children?: ReactNode
}

export function Tabs({
  value,
  defaultValue,
  onValueChange,
  onChange,
  items,
  variant = 'segmented',
  keepMounted = false,
  className,
  style,
  children,
}: TabsProps) {
  const initial = value === undefined ? (defaultValue ?? items?.[0]?.value) : undefined
  return (
    <SdkTabs
      value={value}
      defaultValue={initial}
      onValueChange={(next) => {
        if (next == null) return
        onValueChange?.(next)
        onChange?.(next)
      }}
      data-variant={variant}
      className={cx('sf-ui-tabs', `sf-ui-tabs--${variant}`, className)}
      style={style}
    >
      {items ? (
        <>
          <TabsList className="sf-ui-tabs-list">
            {items.map((item) => (
              <TabsTab
                key={item.value}
                value={item.value}
                disabled={item.disabled}
                className="sf-ui-tabs-tab"
              >
                <span>{item.label}</span>
                {item.badge !== undefined && item.badge !== null ? (
                  <span className="sf-ui-tabs-badge">{item.badge}</span>
                ) : null}
              </TabsTab>
            ))}
          </TabsList>
          {items.map((item) => (
            <TabsPanel
              key={item.value}
              value={item.value}
              keepMounted={item.keepMounted ?? keepMounted}
              className="sf-ui-tabs-panel"
            >
              {item.content}
            </TabsPanel>
          ))}
        </>
      ) : (
        children
      )}
    </SdkTabs>
  )
}

export {
  SdkTabs as TabsRoot,
  TabsIndicator,
  TabsList,
  TabsPanel,
  TabsTab,
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

export interface TooltipProps {
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
  align?: 'start' | 'center' | 'end'
  delay?: number
  className?: string
  children: ReactNode
}

export function Tooltip({
  content,
  side = 'top',
  align = 'center',
  delay = 250,
  className,
  children,
}: TooltipProps) {
  return (
    <SdkTooltip delay={delay}>
      <TooltipTrigger className="sf-ui-tooltip-trigger">{children}</TooltipTrigger>
      <TooltipContent side={side} align={align} sideOffset={6} className={cx('sf-ui-tooltip-content', className)}>
        {content}
      </TooltipContent>
    </SdkTooltip>
  )
}

export {
  SdkTooltip as TooltipRoot,
  TooltipContent,
  TooltipTrigger,
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export interface PaginationProps {
  page?: number
  defaultPage?: number
  pageCount?: number
  total?: number
  pageSize?: number
  siblings?: number
  boundaries?: number
  disabled?: boolean
  showTotal?: boolean | ((total: number, range: [number, number]) => ReactNode)
  onPageChange?: (page: number) => void
  onChange?: (page: number) => void
  previousLabel?: string
  nextLabel?: string
  ariaLabel?: string
  className?: string
  style?: CSSProperties
}

export function Pagination({
  page,
  defaultPage = 1,
  pageCount,
  total,
  pageSize = 10,
  siblings = 1,
  boundaries = 1,
  disabled,
  showTotal,
  onPageChange,
  onChange,
  previousLabel = '上一页',
  nextLabel = '下一页',
  ariaLabel = '分页导航',
  className,
  style,
}: PaginationProps) {
  const current = page ?? defaultPage
  const totalCount = total ?? 0
  const rangeStart = totalCount === 0 ? 0 : (current - 1) * pageSize + 1
  const rangeEnd = Math.min(current * pageSize, totalCount)

  return (
    <div className={cx('sf-ui-pagination-wrap', className)} style={style}>
      {showTotal && total !== undefined ? (
        <span className="sf-ui-pagination-total">
          {typeof showTotal === 'function'
            ? showTotal(total, [rangeStart, rangeEnd])
            : `共 ${total} 条`}
        </span>
      ) : null}
      <SdkPagination
        aria-label={ariaLabel}
        page={page}
        defaultPage={page === undefined ? defaultPage : undefined}
        pageCount={pageCount}
        total={pageCount === undefined ? total : undefined}
        pageSize={pageCount === undefined ? pageSize : undefined}
        siblings={siblings}
        boundaries={boundaries}
        disabled={disabled}
        onPageChange={(next) => {
          onPageChange?.(next)
          onChange?.(next)
        }}
        className="sf-ui-pagination"
      >
        <PaginationList className="sf-ui-pagination-list">
          {({ items }) => (
            <>
              <PaginationItem>
                <PaginationPrevious className="sf-ui-pagination-btn" aria-label={previousLabel}>
                  <ChevronLeftIcon size={14} />
                </PaginationPrevious>
              </PaginationItem>
              {items.map((item) => (
                <PaginationItem key={item}>
                  {typeof item === 'number' ? (
                    <PaginationLink page={item} className="sf-ui-pagination-btn" />
                  ) : (
                    <PaginationEllipsis className="sf-ui-pagination-ellipsis">
                      <MoreHorizontalIcon size={14} />
                    </PaginationEllipsis>
                  )}
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext className="sf-ui-pagination-btn" aria-label={nextLabel}>
                  <ChevronRightIcon size={14} />
                </PaginationNext>
              </PaginationItem>
            </>
          )}
        </PaginationList>
      </SdkPagination>
    </div>
  )
}
