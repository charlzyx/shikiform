import { Badge } from 'antd'
import { Children, Fragment, isValidElement, useEffect, useRef, type ComponentType, type ReactElement, type ReactNode } from 'react'
import { flushSync } from 'react-dom'
import { ShikiUsageError } from '@shikiform/core/internal'
import type { FormEngine } from '@shikiform/core/internal'
import { FieldGroupStore } from '@shikiform/react/internal'

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
        throw new ShikiUsageError(`<${markerName.split('.')[0]}> children must be <${markerName}> elements.`)
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
  throw new ShikiUsageError(`<${owner}.${name}> renders only as a direct child of <${owner}>.`)
}

function inPaths(path: string, paths: readonly string[]): boolean {
  for (const one of paths) if (one === '' || path === one || path.startsWith(one + '.')) return true
  return false
}

/**
 * When a `submit()` / `validate()` call fails (`form.subscribeValidateFailed`), call `reveal` with the indexes of the
 * panes that hold one of its errors, in pane order (nothing when none does). The switch is flushed synchronously, so
 * `<Form>`'s focus of the first errored field (a task later) finds the pane shown.
 */
export function useRevealOnFail(form: FormEngine<any, any>, groups: readonly FieldGroupStore[], reveal: (indexes: number[]) => void): void {
  const latest = useRef({ groups, reveal })
  latest.current = { groups, reveal }
  useEffect(
    () =>
      form.subscribeValidateFailed((errors) => {
        const { groups: now, reveal: show } = latest.current
        const hit: number[] = []
        now.forEach((group, index) => {
          const paths = group.paths()
          if (paths.length && errors.some((error) => inPaths(error.path, paths))) hit.push(index)
        })
        if (hit.length) flushSync(() => show(hit))
      }),
    [form],
  )
}
