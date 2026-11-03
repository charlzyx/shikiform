import { Tabs, type TabsProps } from 'antd'
import { useState, type ReactNode } from 'react'
import { FieldGroup, useGroupsErrors } from '../../react/field-group'
import { useRequiredForm } from '../../react/context'
import { collectPanes, ErrorBadge, markerOutside, usePaneGroups, useRevealOnFail } from './panes'

/** One tab of a {@link FormTab}. Read as data by `FormTab`; it renders nothing on its own. */
export interface FormTabPaneProps {
  /** The tab key (`activeKey` / `onChange` use it). Default: the pane's index as a string. */
  name?: string
  /** The tab title. An error count badge is added when fields inside have errors. */
  tab: ReactNode
  disabled?: boolean
  /** Any fields and layout. They stay mounted while the tab is inactive. */
  children?: ReactNode
}

const Pane = function Pane(_props: FormTabPaneProps): ReactNode {
  return markerOutside('FormTab', 'Pane')
}

/** `FormTab` props: antd `Tabs` props except `items` (from the panes), plus the active key. */
export interface FormTabProps extends Omit<TabsProps, 'items' | 'children' | 'activeKey' | 'defaultActiveKey' | 'onChange'> {
  /** Controlled active tab (a pane `name`). */
  activeKey?: string
  /** Initial active tab when uncontrolled. Default: the first pane. */
  defaultActiveKey?: string
  onChange?: (activeKey: string) => void
  /** `<FormTab.Pane>` elements (fragments and `cond && <FormTab.Pane>` are fine). */
  children?: ReactNode
}

function FormTabRoot({ activeKey, defaultActiveKey, onChange, children, ...rest }: FormTabProps) {
  const form = useRequiredForm('<FormTab>')
  const panes = collectPanes(children, Pane, 'FormTab.Pane')
  const keys = panes.map((pane) => pane.key)
  const groups = usePaneGroups(keys)
  const errors = useGroupsErrors(form, groups)
  const [inner, setInner] = useState<string | undefined>(defaultActiveKey)
  const active = activeKey ?? (inner !== undefined && keys.includes(inner) ? inner : keys[0])
  // A failed submit / validate shows the first pane with an error (controlled: `onChange` only).
  useRevealOnFail(form, groups, ([first]) => {
    const key = keys[first!]!
    if (key === active) return
    if (activeKey === undefined) setInner(key)
    onChange?.(key)
  })
  return (
    <Tabs
      {...rest}
      activeKey={active}
      onChange={(key) => {
        if (activeKey === undefined) setInner(key)
        onChange?.(key)
      }}
      items={panes.map(({ key, props }, index) => ({
        key,
        label: <ErrorBadge count={errors[index]!.length}>{props.tab}</ErrorBadge>,
        disabled: props.disabled,
        forceRender: true,
        children: <FieldGroup value={groups[index]!}>{props.children}</FieldGroup>,
      }))}
    />
  )
}

/**
 * Tabs whose panes hold fields (Formily `FormTab`). Every pane is rendered (antd `forceRender`), so fields in an
 * inactive tab keep their values and are validated / submitted like any other field. A tab title shows a badge
 * with the number of fields inside that have errors. When a submit (or `form.validate()`) fails, the first pane
 * holding an error becomes active (controlled: `onChange` is called) and `<Form>` focuses the first errored field.
 *
 * ```tsx
 * <FormTab>
 *   <FormTab.Pane name="base" tab="基本信息"><Field name="name" … /></FormTab.Pane>
 *   <FormTab.Pane name="contact" tab="联系方式"><Field name="email" … /></FormTab.Pane>
 * </FormTab>
 * ```
 *
 * It is layout only: no value path, so `$pattern` / `$display` inherit along field paths as everywhere else
 * (switch a whole tab with a reaction on its fields, or the root `$pattern`).
 */
export const FormTab = Object.assign(FormTabRoot, { Pane })
