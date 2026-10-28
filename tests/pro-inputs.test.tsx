// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createForm, Form } from '../src'
import { EnumPretty, FormItem, Input, QueryList, Select } from '../src/antd'
import { enumItems, useLazyCascader, useQueryTable, useSuggestion, type CascaderOption } from '../src/pro'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LIST = [
  { label: '啊', value: 'a' },
  { label: '哦', value: 'o', color: 'success' },
  { label: '呃', value: 'e' },
]

describe('enumItems / EnumPretty', () => {
  it('resolves labels and colors, loosely by default', () => {
    expect(enumItems(['a', 'o'], LIST).map((item) => [item.label, item.color])).toEqual([
      ['啊', 'blue'],
      ['哦', 'green'],
    ])
    expect(enumItems(1, [{ label: 'one', value: '1' }])).toHaveLength(1)
    expect(enumItems(1, [{ label: 'one', value: '1' }], { strict: true })).toHaveLength(0)
    expect(enumItems('x', LIST)).toEqual([])
  })

  it('renders tags / badges from the field enum, and Select readPretty honours prettyType', () => {
    const form = createForm({ initialValues: { tags: ['a', 'e'], one: 'o' }, fields: { tags: { enum: LIST }, one: { enum: LIST, pattern: 'readPretty' } } })
    const { container } = render(
      <Form form={form}>
        <FormItem name="tags"><EnumPretty showType="tag" /></FormItem>
        <FormItem name="one"><Select prettyType="badge" /></FormItem>
      </Form>,
    )
    expect([...container.querySelectorAll('.ant-tag')].map((node) => node.textContent)).toEqual(['啊', '呃'])
    expect(container.querySelector('[data-enum-pretty="badge"]')?.textContent).toBe('哦')
  })
})

describe('useSuggestion', () => {
  it('debounces, keeps only the newest answer, and remembers picked labels', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const fetch = vi.fn(async (keyword: string) => {
      calls.push(keyword)
      return [{ label: `${keyword}-1`, value: `${keyword}-1` }]
    })
    const { result } = renderHook(() => useSuggestion({ fetch, debounce: 200 }))
    act(() => result.current.search('a'))
    act(() => result.current.search('ab'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(calls).toEqual(['ab'])
    expect(result.current.options.map((option) => option.value)).toEqual(['ab-1'])
    act(() => result.current.remember([{ label: 'ab-1', value: 'ab-1' }]))
    act(() => result.current.search('z'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.options.map((option) => option.value)).toEqual(['z-1', 'ab-1'])
    expect(result.current.labelOf('ab-1')).toBe('ab-1')
  })
})

const AREA: Record<string, CascaderOption[]> = {
  '[]': [
    { label: '北京市', value: '110000', isLeaf: false },
    { label: '河南省', value: '410000', isLeaf: false },
  ],
  '["110000"]': [{ label: '北京市', value: '11000000', isLeaf: false }],
  '["110000","11000000"]': [{ label: '朝阳区', value: '110105', isLeaf: true }],
  '["410000"]': [{ label: '鹤壁市', value: '410600', isLeaf: false }],
  '["410000","410600"]': [{ label: '浚县', value: '410621', isLeaf: true }],
}

describe('useLazyCascader', () => {
  it('loads the root, then each ancestor level of an echoed value', async () => {
    const load = vi.fn(async (path: Array<string | number>) => AREA[JSON.stringify(path)] ?? [])
    const { result } = renderHook(() => useLazyCascader({ load, paths: [['110000', '11000000', '110105']] }))
    await waitFor(() => expect(result.current.labelsOf(['110000', '11000000', '110105'])).toEqual(['北京市', '北京市', '朝阳区']))
    expect(load.mock.calls.map((call) => call[0])).toEqual([[], ['110000'], ['110000', '11000000']])
    await act(() => result.current.loadChildren(['410000']))
    expect(result.current.labelsOf(['410000', '410600'])).toEqual(['河南省', '鹤壁市'])
    await act(() => result.current.loadChildren(['410000']))
    expect(load).toHaveBeenCalledTimes(4)
  })
})

describe('QueryList', () => {
  it('writes each page into the list field so rows are editable, and pages through the hook', async () => {
    const request = vi.fn(async ({ page, pageSize, params }: { page: number; pageSize: number; params: { domain: string } }) => ({
      data: Array.from({ length: pageSize }, (_, i) => ({ id: (page - 1) * pageSize + i + 1, domain: `${params.domain || 'x'}.${(page - 1) * pageSize + i + 1}` })),
      total: 45,
    }))
    function Page() {
      const table = useQueryTable({
        initialValues: { query: { domain: '' }, list: [] as { id: number; domain: string }[] },
        params: 'query',
        rows: 'list',
        request,
        defaultPageSize: 10,
      })
      return (
        <QueryList
          table={table}
          list="list"
          columns={[
            { key: 'id', title: 'ID', render: ({ record }) => record.id },
            { key: 'domain', title: 'DOMAIN', render: ({ index }) => <FormItem name="domain"><Input data-testid={`domain-${index}`} /></FormItem> },
          ]}
        >
          <FormItem name="query.domain" label="域名"><Input data-testid="q-domain" /></FormItem>
        </QueryList>
      )
    }
    render(<Page />)
    await waitFor(() => expect((screen.getByTestId('domain-0') as HTMLInputElement).value).toBe('x.1'))
    fireEvent.change(screen.getByTestId('domain-0'), { target: { value: 'edited' } })
    expect((screen.getByTestId('domain-0') as HTMLInputElement).value).toBe('edited')
    fireEvent.click(screen.getByTitle('2'))
    await waitFor(() => expect((screen.getByTestId('domain-0') as HTMLInputElement).value).toBe('x.11'))
    fireEvent.change(screen.getByTestId('q-domain'), { target: { value: 'shiki' } })
    fireEvent.click(screen.getByTestId('query-submit'))
    await waitFor(() => expect((screen.getByTestId('domain-0') as HTMLInputElement).value).toBe('shiki.1'))
    expect(request.mock.calls.at(-1)![0]).toMatchObject({ page: 1, params: { domain: 'shiki' } })
  })
})
