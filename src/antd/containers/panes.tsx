import { Badge } from 'antd'
import { Children, Fragment, isValidElement, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { FieldGroupStore } from '../../react/field-group'

/**
 * Shared by `FormTab` / `FormCollapse` / `FormStep`: their children are marker elements (`FormTab.Pane`,
 * `FormCollapse.Panel`, `FormStep.Step`) read as data. Fragments are flattened; `false` / `null` (a conditional
 * pane) are skipped; anything else throws, because it would silently not render.
 */
export function collectPanes<P>(children: ReactNode, marker: ComponentType<P>, markerName: string): Array<{ key: string; props: P }> {
  const out: Array<{ key: string; props: P }> = []
  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (child === null || child === undefined || typeof child === 'boolean') return
      if (isValidElement(child) && child.type === Fragment) {
        visit((child.props as { children?: ReactNode }).children)
        return
      }
      if (!isValidElement(child) || child.type !== marker) {
        throw new Error(`[shikiform] <${markerName.split('.')[0]}> children must be <${markerName}> elements`)
      }
      const props = (child as ReactElement<P & { name?: string }>).props
      out.push({ key: props.name ?? String(out.length), props })
    })
  }
  visit(children)
  return out
}

/** One stable {@link FieldGroupStore} per pane key, for the life of the container. */
export function usePaneGroups(keys: readonly string[]): FieldGroupStore[] {
  const groups = useRef(new Map<string, FieldGroupStore>())
  return keys.map((key) => {
    let group = groups.current.get(key)
    if (!group) groups.current.set(key, (group = new FieldGroupStore()))
    return group
  })
}

/** A tab / panel title with the error count of its fields (nothing when 0). */
export function ErrorBadge({ count, children }: { count: number; children?: ReactNode }) {
  if (!count) return <>{children}</>
  return (
    <span data-error-count={count}>
      <Badge size="small" count={count} offset={[8, -2]}>
        {children}
      </Badge>
    </span>
  )
}

/** Throws: a marker element rendered on its own. */
export function markerOutside(owner: string, name: string): never {
  throw new Error(`[shikiform] <${owner}.${name}> renders only as a direct child of <${owner}>`)
}
