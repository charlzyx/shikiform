import { useCallback, useEffect, useState } from 'react'

/**
 * Width of an element, kept current with a `ResizeObserver` (layouts and grids that respond to their own box, not
 * the window). `undefined` until measured — on the server and on the first client render — so callers pick a
 * deterministic default and hydration matches. `enabled = false` observes nothing.
 */
export function useContainerWidth<E extends HTMLElement>(enabled = true): [(node: E | null) => void, number | undefined] {
  const [node, setNode] = useState<E | null>(null)
  const [width, setWidth] = useState<number | undefined>(undefined)
  const ref = useCallback((next: E | null) => setNode(next), [])
  useEffect(() => {
    if (!enabled || !node) return
    const measure = () => setWidth(node.getBoundingClientRect().width)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [enabled, node])
  return [ref, width]
}
