import { Button, Space } from 'antd';
import { Children, Fragment, isValidElement, useEffect, useRef, useState, type ReactElement, type ReactNode } from 'react';

function flattenElements(children: ReactNode): ReactElement<{ name?: string; gridSpan?: number }>[] {
  const out: ReactElement<{ name?: string; gridSpan?: number }>[] = [];
  Children.forEach(children, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === Fragment) {
      out.push(...flattenElements((child.props as { children?: ReactNode }).children));
      return;
    }
    out.push(child as ReactElement<{ name?: string; gridSpan?: number }>);
  });
  return out;
}

/** Responsive column count for a query filter. Width breakpoints follow the QueryFilter pattern. */
export function columnsForWidth(width: number, maxColumns = 4): number {
  const capped = Math.max(1, maxColumns);
  if (width < 576) return 1;
  if (width < 768) return Math.min(2, capped);
  if (width < 1100) return Math.min(3, capped);
  return capped;
}

export function QueryFilter({
  children,
  collapsed,
  defaultCollapsed = true,
  onCollapsedChange,
  onReset,
  maxColumns = 4,
  visibleRows = 2,
  submitText = '查询',
  resetText = '重置',
}: {
  children?: ReactNode;
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  onReset?: () => void;
  maxColumns?: number;
  /** How many rows stay visible while collapsed, including the row that holds the buttons. */
  visibleRows?: number;
  submitText?: string;
  resetText?: string;
}) {
  const [innerCollapsed, setInnerCollapsed] = useState(defaultCollapsed);
  const isCollapsed = collapsed ?? innerCollapsed;
  const setCollapsed = (next: boolean) => {
    onCollapsedChange?.(next);
    if (collapsed === undefined) setInnerCollapsed(next);
  };
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1200);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => setWidth(element.clientWidth));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const cols = columnsForWidth(width, maxColumns);
  const items = flattenElements(children);
  const capacity = Math.max(cols * visibleRows - 1, 1);
  const hasExtra = items.length > capacity;
  const visible = isCollapsed ? items.slice(0, capacity) : items;
  const hidden = isCollapsed ? items.slice(capacity) : [];

  let cursor = 0;
  const placed = visible.map((element) => {
    const span = Math.min(element.props.gridSpan ?? 1, cols);
    if (cursor % cols + span > cols) cursor += cols - (cursor % cols);
    const column = (cursor % cols) + 1;
    const row = Math.floor(cursor / cols) + 1;
    cursor += span;
    return { element, column, span, row };
  });
  const buttonRow = Math.floor(cursor / cols) + 1;

  return (
    <div
      ref={ref}
      data-testid="query-filter"
      data-columns={cols}
      data-collapsed={isCollapsed ? 'true' : 'false'}
      style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 16, alignItems: 'end' }}
    >
      {placed.map(({ element, column, span, row }) => (
        <div
          key={element.props.name ?? `${row}-${column}`}
          data-field={element.props.name}
          style={{ gridColumn: `${column} / span ${span}`, gridRow: row, minWidth: 0 }}
        >
          {element}
        </div>
      ))}
      <div hidden>
        {hidden.map((element) => (
          <div key={element.props.name} data-field={element.props.name}>
            {element}
          </div>
        ))}
      </div>
      <div style={{ gridColumn: `${cols} / span 1`, gridRow: buttonRow, display: 'flex', justifyContent: 'flex-end' }}>
        <Space>
          <Button type="primary" htmlType="submit" data-testid="query-submit">
            {submitText}
          </Button>
          <Button
            htmlType="button"
            data-testid="query-reset"
            onClick={onReset}
          >
            {resetText}
          </Button>
          {hasExtra ? (
            <Button type="link" htmlType="button" data-testid="query-expand" onClick={() => setCollapsed(!isCollapsed)}>
              {isCollapsed ? '展开' : '收起'}
            </Button>
          ) : null}
        </Space>
      </div>
    </div>
  );
}
