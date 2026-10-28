import { useRef, type ReactNode } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'

/**
 * Windowed list. `@tanstack/react-virtual` is the scroll engine.
 * Pass the row as `children(index)` — the row should subscribe to its own fields,
 * so a cell edit does not re-render the other mounted rows.
 */
export function VirtualRows({
  count,
  height,
  rowHeight = 40,
  overscan = 4,
  children,
}: {
  count: number
  height: number
  rowHeight?: number
  overscan?: number
  children: (index: number) => ReactNode
}) {
  const parentRef = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => parentRef.current,
    estimateSize: () => rowHeight,
    overscan,
  })
  const items = virtualizer.getVirtualItems()
  return (
    <div ref={parentRef} data-virtual-scroll="true" style={{ height, overflow: 'auto', position: 'relative' }}>
      <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
        {items.map((item) => (
          <div
            key={item.index}
            data-virtual-index={item.index}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${item.start}px)` }}
          >
            {children(item.index)}
          </div>
        ))}
      </div>
    </div>
  )
}
