import React from 'react'
import type { ComponentType, ReactNode } from 'react'
import { createContext, useContext } from '../compat/react-compat'
import type { FieldUiSpec, UiName } from '@shikiform/core/internal'
import { useRequiredForm, useScope } from '../context'
import { useFieldKit, withResolvedSlots } from '../field-kit'
import { useUiNode, type FieldSlot, type RegisteredComponentSlot, type RegisteredDecoratorSlot } from '../hooks/use-field'
import { normalizeUiSpec } from '@shikiform/core/internal'
import { useIdPrefix, withDomId } from '../id-prefix'

/** What `<UI>` renders with: the node's effective state (reaction > JSX props > the scope's flags). */
export interface UiBinding {
  /** The node name (`d.$ui(name)`). */
  ui: string
  /** DOM id: `<prefix>-<scope>--<name>` (`<prefix>-ui--approvalTip` at the root). */
  id: string
  visible: boolean
  disabled: boolean
  readOnly: boolean
  title: ReactNode
  description: ReactNode
  component: ComponentType<any> | undefined
  decorator: ComponentType<any> | undefined
  componentProps: Record<string, any>
  decoratorProps: Record<string, any>
}

/** `<UI>` props. A UI node has no value: nothing here is submitted or validated. */
export interface UIProps<C extends ComponentType<any> = ComponentType<any>, D extends ComponentType<any> = ComponentType<any>> {
  /** Addressed in effects as `d.$ui(name)` (inside a row / `<ObjectField>`: that scope's `row.$ui(name)`). */
  name: UiName
  /** The component: `component={[Alert, { type: 'warning' }]}`, or a name registered on `<FieldKit>` / `<Form kit>`. Children render inside it. */
  component?: FieldSlot<C> | RegisteredComponentSlot
  /** Wrapper (`decorator={[FormItem]}`: `title` → label, `description` → extra), or a registered decorator name. */
  decorator?: FieldSlot<D> | RegisteredDecoratorSlot | false
  title?: ReactNode
  description?: ReactNode
  /** `false` hides this UI (default: the scope's `visible`). An explicit `false` exits that fallback. */
  visible?: boolean
  /** Gray this UI out (default: the scope's `disabled`). */
  disabled?: boolean
  /** Render this UI's preview (default: the scope's `readOnly`). Wins over `disabled`. */
  readOnly?: boolean
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
 * `$visible` / `$disabled` / `$readOnly` / `$title` / `$description` / `$componentProps` / `$decoratorProps`, same
 * priority as a field's UI layer (reaction > these props). Hiding it unmounts its children but does **not** hide,
 * skip or drop the fields inside: a field's validation and submit depend only on its own flags.
 */
export function UI<C extends ComponentType<any> = ComponentType<any>, D extends ComponentType<any> = ComponentType<any>>({
  name,
  children,
  visible,
  disabled,
  readOnly,
  ...slots
}: UIProps<C, D>) {
  const form = useRequiredForm(`<UI name="${String(name)}">`)
  const path = useScope().path
  const prefix = useIdPrefix()
  useUiNode(form, path, name, 'node')
  const kit = useFieldKit()
  // No default decorator: a `<UI>` is not a field, and the kit's FormItem would wrap a tip.
  const ui = withResolvedSlots(withDomId(form.uiBinding(path, name, { ...(normalizeUiSpec(slots, `<UI name="${String(name)}">`) as FieldUiSpec), visible, disabled, readOnly }, 'node') as UiBinding, prefix), kit, false)
  if (!ui.visible) return null
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
