import { Table } from 'antd';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { RowContext, ScopeContext, useFormContext, useWatch } from '@shikiform/react';
import type { ShikiForm } from '@shikiform/react';

export interface DataTableColumn {
  title: ReactNode;
  key: string;
  width?: number;
  render: () => ReactNode;
}

export function DataTable({
  name,
  rowKey,
  columns,
  virtualScroll = false,
  scrollY = 360,
  loading = false,
  pagination,
  selection,
}: {
  name: string;
  rowKey: string;
  columns: DataTableColumn[];
  /** Windowed rows. Named virtualScroll so it does not collide with the field `virtual` prop. */
  virtualScroll?: boolean;
  scrollY?: number;
  loading?: boolean;
  pagination?:
    | false
    | {
        current: number;
        pageSize: number;
        total: number;
        onChange: (page: number, pageSize: number) => void;
      };
  selection?: {
    selectedKeys: (string | number)[];
    onChange: (keys: (string | number)[]) => void;
  };
}) {
  const value = useWatch((d) => {
    let cursor: any = d;
    for (const part of name.split('.')) cursor = cursor[part];
    return cursor.$value;
  });
  const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const page = typeof pagination === 'object' ? pagination : undefined;
  // Ant Design Table slices dataSource by (current - 1) * pageSize. Server pages are already sliced,
  // so pad the front and let that window land on the rows we were given.
  const offset = page ? Math.max(0, (page.current - 1) * page.pageSize) : 0;
  const dataSource =
    offset > 0
      ? [...Array.from({ length: offset }, (_, index) => ({ [rowKey]: `__pad_${index}` })), ...rows]
      : rows;
  return (
    <Table
      rowKey={rowKey}
      loading={loading}
      dataSource={dataSource}
      pagination={
        page
          ? {
              current: page.current,
              pageSize: page.pageSize,
              total: page.total,
              showSizeChanger: false,
              onChange: page.onChange,
            }
          : false
      }
      virtual={virtualScroll}
      scroll={virtualScroll ? { y: scrollY, x: Math.max(640, columns.length * 160) } : { x: 'max-content' }}
      rowSelection={
        selection
          ? {
              selectedRowKeys: selection.selectedKeys,
              onChange: (keys) => selection.onChange(keys as (string | number)[]),
            }
          : undefined
      }
      columns={columns.map((column) => ({
        title: column.title,
        key: column.key,
        dataIndex: column.key,
        width: column.width,
        render: (_value: unknown, _record: unknown, index: number) => {
          const rowPath = `${name}.${index}`;
          return (
            <ScopeContext.Provider value={rowPath}>
              <RowContext.Provider value={{ index, path: rowPath, arrayPath: name }}>
                {column.render()}
              </RowContext.Provider>
            </ScopeContext.Provider>
          );
        },
      }))}
    />
  );
}

export interface QueryRequest {
  query: Record<string, unknown>;
  page: number;
  pageSize: number;
  signal: AbortSignal;
}

export interface QueryResult<T> {
  data: T[];
  total: number;
}

function readPath(form: ShikiForm, path: string): unknown {
  return form.read((draft) => {
    let cursor: any = draft;
    for (const part of path.split('.')) cursor = cursor[part];
    return cursor.$value;
  });
}

/**
 * Server query helper: refetches when page, page size, the submitted query object,
 * or an explicit refresh counter changes. In-flight requests are dropped when a newer one starts.
 */
export function useQueryTable<T>({
  request,
  page = 'page',
  pageSize = 'pageSize',
  rows = 'rows',
  submitted = 'submitted',
  refresh = 'searchSeq',
}: {
  request: (args: QueryRequest) => Promise<QueryResult<T>>;
  page?: string;
  pageSize?: string;
  rows?: string;
  submitted?: string;
  refresh?: string;
}) {
  const form = useFormContext();
  const requestRef = useRef(request);
  requestRef.current = request;
  const pageValue = useWatch(() => readPath(form, page));
  const pageSizeValue = useWatch(() => readPath(form, pageSize));
  const submittedValue = useWatch(() => readPath(form, submitted));
  const refreshValue = useWatch(() => readPath(form, refresh));
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [fetches, setFetches] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const id = ++seq.current;
    const ctrl = new AbortController();
    setLoading(true);
    void Promise.resolve(
      requestRef.current({
        query: (form.getValue(submitted) as Record<string, unknown> | undefined) ?? {},
        page: Number(form.getValue(page) ?? 1),
        pageSize: Number(form.getValue(pageSize) ?? 10),
        signal: ctrl.signal,
      }),
    )
      .then((result) => {
        if (id !== seq.current) return;
        form.setValue(rows, result.data);
        setTotal(result.total);
        setFetches((count) => count + 1);
        setLoading(false);
      })
      .catch((error: { name?: string }) => {
        if (id !== seq.current || error?.name === 'AbortError') return;
        setLoading(false);
      });
    return () => {
      seq.current += 1;
      ctrl.abort();
    };
  }, [form, page, pageSize, rows, submitted, pageValue, pageSizeValue, submittedValue, refreshValue]);

  return { loading, total, fetches };
}
