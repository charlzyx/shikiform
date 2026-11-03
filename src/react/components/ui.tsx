import { createContext, useContext, type ComponentType, type ReactNode } from 'react'
import type { Display, Pattern, UiName } from '../../core/types'
import { useRequiredForm, useScope } from '../context'
import { useUiNode, type FieldSlot } from '../hooks/use-field'
import { normalizeUiSpec } from '../../core/state/field-model'

/** What `<UI>` renders with: the node's effective state (reaction > JSX props > the scope's display / pattern). */
export interface UiBinding {
  /** The node name (`d.$ui(name)`). */
  ui: string
  /** DOM id: `<scope>--<name>` (`ui--approvalTip` at the root). */
  id: string
  display: Display
  pattern: Pattern
  title: ReactNode
  description: ReactNode
  component: ComponentType<any> | undefined
  decorator: ComponentType<any> | undefined
  componentProps: Record<string, any>
  decoratorProps: Record<string, any>
}

/** `<UI>` props. A UI node has no value: nothing here is submitted or validated. */
export interface UIProps {
  /** Addressed in effects as `d.$ui(name)` (inside a row / `<ObjectField>`: that scope's `row.$ui(name)`). */
  name: UiName
  /** The component: `component={[Alert, { type: 'warning' }]}`. Children render inside it. */
  component?: FieldSlot
  /** Wrapper (`decorator={[FormItem]}`: `title` → label, `description` → extra). */
  decorator?: FieldSlot
  componentProps?: Record<string, any>
  decoratorProps?: Record<string, any>
  title?: ReactNode
  description?: ReactNode
  /** Initial display when no reaction wrote `$visible` / `$display` (default: the scope's). */
  display?: Display
  /** Initial pattern when no reaction wrote `$pattern` (default: inherited from the scope / form). */
  pattern?: Pattern
  /** Rendered inside `component` (or alone), or a render prop `(ui) => …`. */
  children?: ReactNode | ((ui: UiBinding) => ReactNode)
}

/** Internal: the `<UI>` whose decorator is rendering (`FormItem` reads `title` / `description` from it). */
export const UiNodeContext = createContext<UiBinding | null>(null)

/** Internal: the surrounding `<UI>`, or `null`. */
export function useUiNodeOrNull(): UiBinding | null {
  return useContext(UiNodeContext)
}

/**
 * A UI with no data, addressed by name in effects: `d.$ui('approvalTip').$visible = d.amount.$value >= 50000`.
 *
 * ```tsx
 * <UI name="approvalTip" component={[Alert, { type: 'warning', message: '金额 ≥ 5 万需要审批' }]} />
 * ```
 *
 * `$visible` / `$display` / `$pattern` / `$title` / `$description` / `$componentProps` / `$decoratorProps`, same
 * priority as a field's UI layer (reaction > these props). Hiding it unmounts its children but does **not** hide,
 * skip or drop the fields inside: a field's validation and submit depend only on its own `$visible` / display.
 */
export function UI({ name, children, display, pattern, ...slots }: UIProps) {
  const form = useRequiredForm(`<UI name="${String(name)}">`)
  const path = useScope().path
  useUiNode(form, path, name, 'node')
  const ui = form.uiBinding(path, name, { ...normalizeUiSpec(slots), display, pattern }, 'node') as UiBinding
  if (ui.display !== 'visible') return null
  const Component = ui.component
  const Decorator = ui.decorator
  const inner = typeof children === 'function' ? children(ui) : children
  const content = Component ? <Component {...ui.componentProps}>{inner}</Component> : inner
  if (!Decorator) return content
  // Only the decorator sees the node (FormItem label / extra); a pure-layout FormItem inside does not.
  return (
    <UiNodeContext.Provider value={ui}>
      <Decorator {...ui.decoratorProps}>
        <UiNodeContext.Provider value={null}>{content}</UiNodeContext.Provider>
      </Decorator>
    </UiNodeContext.Provider>
  )
}
