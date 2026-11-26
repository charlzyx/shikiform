import React from 'react'
import type { ReactNode, UIEvent } from 'react'
import { useCallback, useRef, useState } from '../compat/react-compat'

const indexKey = (index: number) => index

/**
 * Windowed list. Renders only the rows intersecting the scroll viewport plus `overscan`.
 * Pass the row as `children(index)` — the row should subscribe to its own fields,
 * so a cell edit does not re-render the other mounted rows.
 */
export function VirtualRows({
  count,
  height,
  rowHeight = 40,
  overscan = 4,
  getItemKey = indexKey,
  children,
}: {
  count: number
  height: number
  rowHeight?: number
  overscan?: number
  getItemKey?: (index: number) => string | number
  children: (index: number) => ReactNode
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)
  const onScroll = useCallback((event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop)
  }, [])

  const size = rowHeight > 0 ? rowHeight : 40
  const viewportHeight = parentRef.current?.clientHeight || height
  const totalSize = count * size
  const clampedScroll = Math.max(0, Math.min(scrollTop, Math.max(0, totalSize - viewportHeight)))
  const firstVisible = Math.floor(clampedScroll / size)
  const lastVisible = Math.ceil((clampedScroll + viewportHeight) / size) - 1
  const startIndex = count > 0 ? Math.max(0, firstVisible - overscan) : 0
  const endIndex = count > 0 ? Math.min(count - 1, Math.max(0, lastVisible + overscan)) : -1

  const items: ReactNode[] = []
  for (let index = startIndex; index <= endIndex; index++) {
    items.push(
      <div
        key={getItemKey(index)}
        data-virtual-index={index}
        style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${index * size}px)` }}
      >
        {children(index)}
      </div>,
    )
  }

  return (
    <div
      ref={parentRef}
      onScroll={onScroll}
      data-virtual-scroll="true"
      style={{ height, overflow: 'auto', position: 'relative' }}
    >
      <div style={{ height: totalSize, position: 'relative' }}>
        {items}
      </div>
    </div>
  )
}
