// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrayField, enUS, Field, Form, setDefaultMessages, useForm, useFormMessage, zhCN } from '../src'
import { moveNode } from '../src/core'
import { PreviewText, ArrayTable, QueryList, Reset, ShadowDrawer, ShadowPopconfirm, Submit } from '../src/antd'
import { useQueryTable } from '../src/pro'
import { createEngine } from '../src/core/engine/create'

afterEach(() => {
  cleanup()
  setDefaultMessages(zhCN)
})

describe('built-in texts go through messages', () => {
  it('zhCN and enUS define the same keys', () => {
    expect(Object.keys(enUS).sort()).toEqual(Object.keys(zhCN).sort())
  })

  it('tree-move refusals: Chinese by default, per-form messages, enUS', () => {
    const nodes = () => [{ id: 'a', children: [{ id: 'a1', children: [] }] }]
    const zh = createEngine({ initialValues: { nodes: nodes() } })
    zh.registerTree('nodes')
    expect(zh.moveTree('nodes', [0], [0, 0])).toEqual({ ok: false, reason: '不能移入自身或其后代' })
    const en = createEngine({ initialValues: { nodes: nodes() }, messages: enUS })
    en.registerTree('nodes')
    expect(en.moveTree('nodes', [0], [0, 0]).reason).toBe('Cannot move a node into itself or its descendants')
    expect(en.moveTree('nodes', [5], [0]).reason).toBe('Source node not found')
    const custom = createEngine({ initialValues: { nodes: nodes() }, messages: { treeIntoSelf: ({ from }) => `no ${from.join('.')}` } })
    custom.registerTree('nodes')
    expect(custom.moveTree('nodes', [0], [0, 0]).reason).toBe('no 0')
    expect(moveNode(nodes(), [], [0]).reason).toBe('pos 不能为空')
    expect(moveNode(nodes(), [], [0], 'children', undefined, enUS).reason).toBe('Position must not be empty')
  })

  it('form.message and useFormMessage resolve form → app defaults', () => {
    const form = createEngine({ messages: { submit: 'Save' } })
    expect(form.message('submit')).toBe('Save')
    expect(form.message('reset')).toBe('重置')
    expect(form.message('selectionCount', { count: 2 })).toBe('选中 2 项')
    setDefaultMessages(enUS)
    expect(form.message('reset')).toBe('Reset')
    const { result } = renderHook(() => useFormMessage())
    expect(result.current('density', { density: 'small' })).toBe('Density: Compact')
  })

  it('antd Submit / Reset and PreviewText follow the form messages', () => {
    function Page({ en }: { en?: boolean }) {
      const form = useForm({ initialValues: { ok: true, no: false, empty: '' }, messages: en ? { ...enUS, empty: '—' } : undefined })
      return (
        <Form form={form}>
          <span data-testid="yes"><PreviewText value={form.getValue('ok')} /></span>
          <span data-testid="no"><PreviewText value={form.getValue('no')} /></span>
          <span data-testid="empty"><PreviewText value={form.getValue('empty')} /></span>
          <Submit />
          <Reset data-testid="reset" />
        </Form>
      )
    }
    const zh = render(<Page />)
    expect(screen.getAllByRole('button')[0]!.textContent?.replace(/\s/g, '')).toBe('提交')
    expect(screen.getByTestId('reset').textContent?.replace(/\s/g, '')).toBe('重置')
    expect(screen.getByTestId('yes').textContent).toBe('是')
    expect(screen.getByTestId('empty').textContent).toBe('-')
    zh.unmount()
    render(<Page en />)
    expect(screen.getAllByRole('button')[0]!.textContent).toBe('Submit')
    expect(screen.getByTestId('reset').textContent).toBe('Reset')
    expect(screen.getByTestId('yes').textContent).toBe('Yes')
    expect(screen.getByTestId('no').textContent).toBe('No')
    expect(screen.getByTestId('empty').textContent).toBe('—')
  })

  it('ArrayTable labels follow enUS; component props still win', () => {
    const form = createEngine({ initialValues: { list: [{ a: '1' }, { a: '2' }] }, messages: enUS })
    render(
      <Form form={form}>
        <ArrayField name="list" component={[ArrayTable, {
          rowSelection: true,
          columns: [{ key: 'act', title: 'Act', render: () => <><ArrayTable.MoveUp /><ArrayTable.Copy /><ArrayTable.Remove title="Drop" /></> }],
          extra: <ArrayTable.Addition />,
        }]} />
      </Form>,
    )
    expect(screen.getAllByTestId('row-up')[0]!.textContent).toBe('Move up')
    expect(screen.getAllByTestId('row-copy')[0]!.textContent).toBe('Copy')
    expect(screen.getAllByTestId('row-remove')[0]!.textContent).toBe('Drop')
    expect(screen.getByTestId('row-add').textContent).toBe('Add item')
    expect(screen.getByTestId('selection-count').textContent).toBe('0 selected')
    expect(screen.getByTestId('selection-invert').textContent).toBe('Invert')
  })

  it('QueryList buttons read the query form messages', async () => {
    const request = vi.fn(async () => ({ data: [], total: 0 }))
    function Page() {
      const form = useForm({ initialValues: { query: { a: '', b: '', c: '', d: '' }, list: [] as { id: string }[] }, messages: enUS })
      const table = useQueryTable({ form, params: 'query', rows: 'list', request })
      return (
        <QueryList table={table} settings={false} columns={[]}>
          <Field name="query.a" /><Field name="query.b" /><Field name="query.c" /><Field name="query.d" />
        </QueryList>
      )
    }
    render(<Page />)
    await waitFor(() => expect(request).toHaveBeenCalled())
    expect(screen.getByTestId('query-toggle').textContent).toBe('Expand')
    expect(screen.getByTestId('query-submit').textContent).toBe('Search')
    expect(screen.getByTestId('query-reset').textContent).toBe('Reset')
    expect(screen.getByTestId('query-refresh').getAttribute('title')).toBe('Refresh')
  })

  it('shadow triggers and drawer footer use messages', async () => {
    setDefaultMessages(enUS)
    render(
      <>
        <ShadowPopconfirm record={{}} onOk={() => undefined} />
        <ShadowDrawer record={{}} onOk={() => undefined} trigger={<button>open</button>} />
      </>,
    )
    expect(screen.getByText('Edit')).toBeTruthy()
    fireEvent.click(screen.getByText('open'))
    await waitFor(() => expect(screen.getByText('Cancel')).toBeTruthy())
    expect(screen.getByText('OK')).toBeTruthy()
  })
})

describe('useForm({ values })', () => {
  it('first render uses values as the baseline; a new record resets (not dirty)', () => {
    const { result, rerender } = renderHook(({ values }) => useForm({ values }), { initialProps: { values: { name: 'a' } } })
    const form = result.current
    expect(form.initial).toEqual({ name: 'a' })
    act(() => form.setValue('name', 'edited'))
    expect(form.dirty).toBe(true)
    rerender({ values: { name: 'b' } })
    expect(result.current).toBe(form)
    expect(form.values).toEqual({ name: 'b' })
    expect(form.initial).toEqual({ name: 'b' })
    expect(form.dirty).toBe(false)
  })

  it('same content under a new identity keeps edits; undefined → record loads it', () => {
    const { result, rerender } = renderHook(({ values }: { values?: { name: string } }) => useForm({ values }), {
      initialProps: { values: undefined as { name: string } | undefined },
    })
    const form = result.current
    rerender({ values: { name: 'loaded' } })
    expect(form.values).toEqual({ name: 'loaded' })
    act(() => form.setValue('name', 'edited'))
    rerender({ values: { name: 'loaded' } })
    expect(form.getValue('name')).toBe('edited')
  })
})
