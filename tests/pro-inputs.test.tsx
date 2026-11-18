// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createForm, Field, Form } from '@shikiform/react'
import { CascaderPlus, FormItem, Input, PreviewText, QueryList, Select } from '@shikiform/antd'
import { enumItems, useLazyCascader, useQueryTable, useSuggestion, type CascaderOption } from '@shikiform/hooks'
import { useCascaderLabels, useColumnSettings } from '@shikiform/hooks/internal'
import { cascaderPaths } from '../packages/hooks/src/use-lazy-cascader'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LIST = [
  { label: '啊', value: 'a' },
  { label: '哦', value: 'o', color: 'success' },
  { label: '呃', value: 'e' },
]

describe('enumItems / prettyType', () => {
  it('resolves labels and colors loosely; an unknown value keeps its own text', () => {
    expect(enumItems(['a', 'o'], LIST).map((item) => [item.label, item.color])).toEqual([
      ['啊', 'blue'],
      ['哦', 'green'],
    ])
    expect(enumItems(1, [{ label: 'one', value: '1' }])[0]).toMatchObject({ label: 'one', matched: true })
    expect(enumItems('x', LIST)).toEqual([{ value: 'x', label: 'x', color: '', matched: false }])
    expect(enumItems({ label: '外', value: 'w' }, LIST)[0]).toMatchObject({ label: '外', value: 'w' })
  })

  it('renders tags / badges from the field enum through the choice controls, and as a pure view', () => {
    const form = createForm({ initialValues: { tags: ['a', 'e'], one: 'o' }, fields: { tags: { enum: LIST, readOnly: true }, one: { enum: LIST, readOnly: true } } })
    const { container } = render(
      <Form form={form}>
        <Field name="tags" decorator={[FormItem]}><Select mode="multiple" prettyType="tag" /></Field>
        <Field name="one" decorator={[FormItem]}><Select prettyType="badge" /></Field>
      </Form>,
    )
    expect([...container.querySelectorAll('.ant-tag')].map((node) => node.textContent)).toEqual(['啊', '呃'])
    expect(container.querySelector('[data-pretty="badge"]')?.textContent).toBe('哦')
    const cell = render(<PreviewText.Select value={1} options={[{ label: '运行中', value: 1, color: 'success' }]} prettyType="badge" />)
    expect(cell.container.textContent).toBe('运行中')
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

describe('CascaderPlus read-only labels', () => {
  const load = () => vi.fn(async (path: Array<string | number>) => AREA[JSON.stringify(path)] ?? [])

  it('useCascaderLabels resolves bare codes through the loader, and skips loading for labelInValue', async () => {
    const loader = load()
    const { result } = renderHook(() => useCascaderLabels({ value: ['410000', '410600', '410621'], load: loader }))
    await waitFor(() => expect(result.current.labels).toEqual([['河南省', '鹤壁市', '浚县']]))
    expect(result.current.loading).toBe(false)
    const labeledLoader = load()
    const labeled = renderHook(() =>
      useCascaderLabels({ value: [{ label: '北京市', value: '110000' }, { label: '朝阳区', value: '110105' }], load: labeledLoader }),
    )
    expect(labeled.result.current.labels).toEqual([['北京市', '朝阳区']])
    expect(labeledLoader).not.toHaveBeenCalled()
    // No loader: the value is all there is.
    expect(renderHook(() => useCascaderLabels({ value: ['x', 'y'] })).result.current.labels).toEqual([['x', 'y']])
    expect(cascaderPaths([[{ label: 'a', value: 1 }, 2], 'bad'], true)).toEqual([[1, 2]])
  })

  it('shows labels, not codes, for a read-only field without labelInValue (single and multiple)', async () => {
    const form = createForm({
      initialValues: { one: ['110000', '11000000', '110105'], many: [['110000', '11000000', '110105'], ['410000', '410600', '410621']] },
      fields: { one: { readOnly: true }, many: { readOnly: true } },
    })
    const loader = load()
    const { container } = render(
      <Form form={form}>
        <Field name="one" decorator={[FormItem]} component={[CascaderPlus, { loadData: loader }]} />
        <Field name="many" decorator={[FormItem]} component={[CascaderPlus, { loadData: loader, multiple: true }]} />
      </Form>,
    )
    await waitFor(() =>
      expect([...container.querySelectorAll('[data-read-pretty]')].map((node) => node.textContent)).toEqual([
        '北京市 / 北京市 / 朝阳区',
        '北京市 / 北京市 / 朝阳区河南省 / 鹤壁市 / 浚县',
      ]),
    )
    act(() => form.setValue('one', ['410000', '410600']))
    await waitFor(() => expect(container.querySelector('[data-read-pretty]')?.textContent).toBe('河南省 / 鹤壁市'))
  })
})

describe('useColumnSettings drag', () => {
  it('moveKey and dragProps reorder by key', () => {
    const { result } = renderHook(() => useColumnSettings([{ key: 'a' }, { key: 'b' }, { key: 'c' }]))
    act(() => result.current.moveKey('c', 'a'))
    expect(result.current.visibleKeys).toEqual(['c', 'a', 'b'])
    const event = { preventDefault: vi.fn(), dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' } }
    act(() => result.current.dragProps('c').onDragStart(event))
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'c')
    act(() => result.current.dragProps('b').onDragOver(event))
    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.current.drag).toEqual({ from: 'c', over: 'b' })
    act(() => result.current.dragProps('b').onDrop(event))
    expect(result.current.visibleKeys).toEqual(['a', 'b', 'c'])
    expect(result.current.drag).toEqual({ from: null, over: null })
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
          columns={[
            { key: 'id', title: 'ID', render: ({ record }) => record.id },
            { key: 'domain', title: 'DOMAIN', render: ({ index }) => <Field name="domain" decorator={[FormItem]}><Input data-testid={`domain-${index}`} /></Field> },
          ]}
        >
          <Field name="query.domain" title="域名" decorator={[FormItem]}><Input data-testid="q-domain" /></Field>
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
