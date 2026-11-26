import React from 'react'
import type { ReactNode } from 'react'
import { pathDomId } from '@shikiform/core/internal'
import { createContext, useContext, useId } from './compat/react-compat'

const IdPrefixContext = createContext('')

/**
 * Internal prefix for field DOM ids. `<Form>` and shadow drafts provide it.
 * Not a public component: two forms on one page must not share `id="email"`.
 */
export function IdPrefixProvider({ prefix, children }: { prefix: string; children: ReactNode }) {
  return <IdPrefixContext.Provider value={prefix}>{children}</IdPrefixContext.Provider>
}

/** The nearest form's DOM id prefix, or `''` outside `<Form>` / a shadow draft. */
export function useIdPrefix(): string {
  return useContext(IdPrefixContext)
}

/**
 * Prefix for one `<Form>` (or a shadow draft, which has no `id` prop).
 * An explicit `id` wins; otherwise React `useId()`. `useId` always runs.
 */
export function useAutoIdPrefix(explicit?: string): string {
  const auto = useId()
  return explicit || auto
}

/** `${prefix}-${id}` when a form prefix is set. Engine ids stay unprefixed. */
export function prefixDomId(prefix: string, id: string): string {
  return prefix ? `${prefix}-${id}` : id
}

/** The id `<Field>` puts on a control, and the id a failed submit focuses. */
export function focusFieldDomId(prefix: string, path: string): string {
  return prefixDomId(prefix, pathDomId(path))
}

/** Overlay the form prefix onto a binding's `id` (path ids and `<path>--<ui>` ids). */
export function withDomId<T extends { id: string }>(binding: T, prefix: string): T {
  const id = prefixDomId(prefix, binding.id)
  return id === binding.id ? binding : { ...binding, id }
}
