// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Field } from '../src'
import { FormItem, Input, QueryList } from '../src/antd'
import { useQueryTable, type QueryRequestArgs } from '../src/pro'
import { normalizeFilters, normalizeSort } from '../src/pro/use-query-table'

afterEach(() => cleanup())

interface Row {
  id: string
  status: 'active' | 'disabled'
  n: number
}

const ROWS: Row[] = Array.from({ length: 25 }, (_, i) => ({
  id: `row-${String(i + 1).padStart(3, '0')}`,
  status: i % 2 === 0 ? 'active' : 'disabled',
  n: i + 1,
}))

/** A fake backend that honours column filters and sort, like a real one would. */
function backend() {
  return vi.fn(async ({ page, pageSize, filters, sorter }: QueryRequestArgs<unknown>) => {
    let rows = ROWS.filter((row) => !filters.status || filters.status.includes(row.status))
    const sort = sorter[0]
    if (sort) rows = [...rows].sort((a, b) => (sort.order === 'ascend' ? 1 : -1) * ((a as any)[sort.field] - (b as any)[sort.field]))
    return { data: rows.slice((page - 1) * pageSize, page * pageSize), total: rows.length }
  })
}

function setup() {
  const request = backend()
  const hook = renderHook(() =>
    useQueryTable({ initialValues: { q: '' } as { q: string; page?: number; pageSize?: number; selectedKeys?: string[] }, request, defaultPageSize: 10 }),
  )
  return { request, hook }
}

describe('useQueryTable column filters keep the selection inside the result (#3)', () => {
  it('a column filter change clears the old selection, so a batch action cannot touch hidden rows', async () => {
    const { request, hook } = setup()
    await waitFor(() => expect(hook.result.current.data).toHaveLength(10))
    act(() => hook.result.current.setSelectedKeys(['row-001']))
    expect(hook.result.current.selectedKeys).toEqual(['row-001'])
    act(() => hook.result.current.onTableChange({}, { status: ['disabled'] }, {}, { action: 'filter' }))
    await waitFor(() => expect(hook.result.current.data.every((row) => row.status === 'disabled')).toBe(true))
    expect(hook.result.current.selectedKeys).toEqual([])
    expect(hook.result.current.page).toBe(1)
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ page: 1, filters: { status: ['disabled'] } })
    // The batch action reads the selection: nothing hidden is in it.
    const visible = new Set(hook.result.current.data.map((row) => row.id))
    expect(hook.result.current.selectedKeys.every((key) => visible.has(key))).toBe(true)
  })

  it('a page change within the same query keeps the selection', async () => {
    const { request, hook } = setup()
    await waitFor(() => expect(hook.result.current.data).toHaveLength(10))
    act(() => hook.result.current.setSelectedKeys(['row-001', 'row-002']))
    act(() => hook.result.current.onPageChange(2))
    await waitFor(() => expect(hook.result.current.data[0]!.id).toBe('row-011'))
    expect(hook.result.current.selectedKeys).toEqual(['row-001', 'row-002'])
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ page: 2 })
    // antd fires Table onChange for paging too; that action is the pager's, not a filter change.
    act(() => hook.result.current.onTableChange({ current: 3 }, {}, {}, { action: 'paginate' }))
    expect(hook.result.current.page).toBe(2)
    expect(hook.result.current.selectedKeys).toEqual(['row-001', 'row-002'])
  })

  it('re-sending the same filters does nothing', async () => {
    const { request, hook } = setup()
    await waitFor(() => expect(hook.result.current.data).toHaveLength(10))
    act(() => hook.result.current.setFilters({ status: ['active'] }))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    act(() => hook.result.current.setSelectedKeys(['row-001']))
    act(() => hook.result.current.onTableChange({}, { status: ['active'], n: null }, undefined, { action: 'filter' }))
    expect(hook.result.current.selectedKeys).toEqual(['row-001'])
    expect(request).toHaveBeenCalledTimes(2)
  })
})

describe('useQueryTable sort and filter passthrough', () => {
  it('forwards the sorter, returns to page 1, keeps the selection; reset clears sort and filters', async () => {
    const { request, hook } = setup()
    await waitFor(() => expect(hook.result.current.data).toHaveLength(10))
    act(() => hook.result.current.onPageChange(2))
    await waitFor(() => expect(hook.result.current.data[0]!.id).toBe('row-011'))
    act(() => hook.result.current.setSelectedKeys(['row-003']))
    act(() => hook.result.current.onTableChange({}, {}, { columnKey: 'n', field: 'n', order: 'descend' }, { action: 'sort' }))
    await waitFor(() => expect(hook.result.current.data[0]!.id).toBe('row-025'))
    expect(hook.result.current.page).toBe(1)
    expect(hook.result.current.selectedKeys).toEqual(['row-003'])
    expect(hook.result.current.sortOrderOf('n')).toBe('descend')
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ page: 1, sorter: [{ field: 'n', order: 'descend' }], filters: {} })
    act(() => hook.result.current.setFilters({ status: ['active'] }))
    await waitFor(() => expect(hook.result.current.filteredValueOf('status')).toEqual(['active']))
    act(() => hook.result.current.reset())
    await waitFor(() => expect(hook.result.current.data[0]!.id).toBe('row-001'))
    expect(hook.result.current.sorter).toEqual([])
    expect(hook.result.current.filters).toEqual({})
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ sorter: [], filters: {} })
  })

  it('normalizes antd sorter / filter shapes', () => {
    expect(normalizeSort([{ field: ['a', 'b'], order: 'ascend' }, { columnKey: 'c', order: null }, { columnKey: 'd', field: 'x', order: 'descend' }])).toEqual([
      { field: 'a.b', order: 'ascend' },
      { field: 'd', order: 'descend' },
    ])
    expect(normalizeFilters({ a: null, b: [], c: ['x', 1], d: 'y' })).toEqual({ c: ['x', 1], d: ['y'] })
  })
})

describe('antd tables forward header sort / filter to the request', () => {
  it('QueryList: a sortable column header reaches the request through ArrayTable', async () => {
    const request = backend()
    function Page() {
      const table = useQueryTable({
        initialValues: { query: { q: '' }, list: [] as Row[] },
        params: 'query',
        rows: 'list',
        request,
        defaultPageSize: 5,
      })
      return (
        <QueryList
          table={table}
          settings={false}
          columns={[
            { key: 'id', title: 'ID', render: ({ record }) => <span data-testid="row-id">{record.id}</span> },
            { key: 'n', title: 'N', sorter: true, render: ({ record }) => record.n },
          ]}
        >
          <Field name="query.q" title="Q" decorator={[FormItem]}><Input /></Field>
        </QueryList>
      )
    }
    render(<Page />)
    await waitFor(() => expect(screen.getAllByTestId('row-id')).toHaveLength(5))
    fireEvent.click(screen.getByText('N'))
    await waitFor(() => expect(request.mock.calls.at(-1)![0]).toMatchObject({ page: 1, sorter: [{ field: 'n', order: 'ascend' }] }))
    fireEvent.click(screen.getByText('N'))
    await waitFor(() => expect(request.mock.calls.at(-1)![0]).toMatchObject({ sorter: [{ field: 'n', order: 'descend' }] }))
    await waitFor(() => expect(screen.getAllByTestId('row-id')[0]!.textContent).toBe('row-025'))
    fireEvent.click(screen.getByTestId('query-reset'))
    await waitFor(() => expect(request.mock.calls.at(-1)![0]).toMatchObject({ sorter: [] }))
  })
})
