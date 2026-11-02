import { Collapse, type CollapseProps } from 'antd'
import { useState, type ReactNode } from 'react'
import { FieldGroup, useGroupsErrors } from '../../react/field-group'
import { useRequiredForm } from '../../react/context'
import { collectPanes, ErrorBadge, markerOutside, usePaneGroups } from './panes'

/** One panel of a {@link FormCollapse}. Read as data by `FormCollapse`; it renders nothing on its own. */
export interface FormCollapsePanelProps {
  /** The panel key (`activeKey` / `onChange` use it). Default: the panel's index as a string. */
  name?: string
  /** The panel title. An error count badge is added when fields inside have errors. */
  header: ReactNode
  /** Right side of the header (antd `extra`). */
  extra?: ReactNode
  /** antd `collapsible` (`'header' | 'icon' | 'disabled'`). */
  collapsible?: 'header' | 'icon' | 'disabled'
  /** Any fields and layout. They stay mounted while the panel is collapsed. */
  children?: ReactNode
}

const Panel = function Panel(_props: FormCollapsePanelProps): ReactNode {
  return markerOutside('FormCollapse', 'Panel')
}

/** `FormCollapse` props: antd `Collapse` props except `items` (from the panels), plus the active keys. */
export interface FormCollapseProps extends Omit<CollapseProps, 'items' | 'children' | 'activeKey' | 'defaultActiveKey' | 'onChange'> {
  /** Controlled open panels (panel `name`s). */
  activeKey?: string[]
  /** Initially open panels when uncontrolled. Default: every panel (the first one with `accordion`). */
  defaultActiveKey?: string[]
  onChange?: (activeKey: string[]) => void
  /** `<FormCollapse.Panel>` elements (fragments and `cond && <FormCollapse.Panel>` are fine). */
  children?: ReactNode
}

function FormCollapseRoot({ activeKey, defaultActiveKey, onChange, accordion, children, ...rest }: FormCollapseProps) {
  const form = useRequiredForm('<FormCollapse>')
  const panels = collectPanes(children, Panel, 'FormCollapse.Panel')
  const keys = panels.map((panel) => panel.key)
  const groups = usePaneGroups(keys)
  const errors = useGroupsErrors(form, groups)
  const [inner, setInner] = useState<string[] | undefined>(defaultActiveKey)
  const open = activeKey ?? inner ?? (accordion ? keys.slice(0, 1) : keys)
  return (
    <Collapse
      {...rest}
      accordion={accordion}
      activeKey={open}
      onChange={(next) => {
        const list = (Array.isArray(next) ? next : next === undefined || next === null ? [] : [next]).map(String)
        if (activeKey === undefined) setInner(list)
        onChange?.(list)
      }}
      items={panels.map(({ key, props }, index) => ({
        key,
        label: <ErrorBadge count={errors[index]!.length}>{props.header}</ErrorBadge>,
        extra: props.extra,
        collapsible: props.collapsible,
        forceRender: true,
        children: <FieldGroup value={groups[index]!}>{props.children}</FieldGroup>,
      }))}
    />
  )
}

/**
 * Collapsible panels whose bodies hold fields (Formily `FormCollapse`). Every panel body is rendered (antd
 * `forceRender`), so fields in a collapsed panel keep their values and are validated / submitted. A panel header
 * shows a badge with the number of fields inside that have errors.
 *
 * ```tsx
 * <FormCollapse>
 *   <FormCollapse.Panel name="base" header="基本信息"><Field name="name" … /></FormCollapse.Panel>
 *   <FormCollapse.Panel name="more" header="更多"><Field name="note" … /></FormCollapse.Panel>
 * </FormCollapse>
 * ```
 */
export const FormCollapse = Object.assign(FormCollapseRoot, { Panel })
