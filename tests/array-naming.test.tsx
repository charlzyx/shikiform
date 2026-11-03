// @vitest-environment happy-dom
// Array / table / query naming (design/array-naming.md): one name and one way per job.
// Type assertions run under `npm run check`; runtime cases under vitest.
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import * as root from '../src'
import { ArrayField, createForm, Form, typed, useArrayField, useTreeField } from '../src'
import { ShikiUsageError } from '../src/core'
import * as antd from '../src/antd'
import { ArrayItems, ArrayTable, Input, type ArrayTableColumn } from '../src/antd'

afterEach(() => cleanup())

type Row = { id: string; name: string }

// —— types: the container's props are checked through <ArrayField component> ——
function containerTypes() {
  const form = createForm<{ rows: Row[] }>({ initialValues: { rows: [] } })
  const F = typed(form)
  const columns: ArrayTableColumn<Row>[] = [{ key: 'name', render: ({ record }) => record.name }]
  void (
    <>
      <ArrayField name="rows" component={[ArrayTable, { columns }]} />
      <F.ArrayField name="rows" rowKey="id" component={[ArrayTable, { columns, pagination: false }]} />
      {/* inline columns get a typed cell */}
      <ArrayField name="rows" component={[ArrayTable, { columns: [{ key: 'i', render: (cell) => cell.position + cell.index }] }]} />
      {/* @ts-expect-error ArrayTable needs columns */}
      <ArrayField name="rows" component={[ArrayTable, {}]} />
      {/* @ts-expect-error not an ArrayTable prop */}
      <ArrayField name="rows" component={[ArrayTable, { columns, nope: 1 }]} />
      <ArrayField name="rows" component={[ArrayItems, { addition: <ArrayItems.Addition /> }]}>{() => null}</ArrayField>
    </>
  )
}
void containerTypes

function wrap(form: ReturnType<typeof createForm<any>>) {
  return ({ children }: { children: ReactNode }) => <Form form={form}>{children}</Form>
}

describe('removed names stay removed', () => {
  it('no old exports', () => {
    for (const name of ['useArrayMove', 'useTreeMove', 'useArrayMoveAt']) expect(name in root).toBe(false)
    for (const name of ['ProArrayTable', 'ProQueryTable', 'QueryForm']) expect(name in antd).toBe(false)
    expect('ShadowAddition' in ArrayTable).toBe(true)
    expect('ProAddition' in ArrayTable).toBe(false)
  })
})

describe('<ArrayField> owns every array UI', () => {
  it('virtualScroll and a container component do not combine', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', name: 'A' }] } })
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(() =>
        render(
          <Form form={form}>
            <ArrayField name="rows" virtualScroll={{ height: 100 }} component={[ArrayItems]}>{() => null}</ArrayField>
          </Form>,
        ),
      ).toThrow(ShikiUsageError)
    } finally {
      spy.mockRestore()
    }
  })

  it('ArrayTable renders cells from columns and warns once about row children', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } })
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(
      <Form form={form}>
        <ArrayField name="rows" rowKey="id" component={[ArrayTable, { settings: false, pagination: false, columns: [{ key: 'n', render: ({ record }) => <span data-testid="cell">{record.name}</span> }] }]}>
          {() => <span data-testid="ignored" />}
        </ArrayField>
      </Form>,
    )
    expect(screen.getAllByTestId('cell').map((node) => node.textContent)).toEqual(['A', 'B'])
    expect(screen.queryByTestId('ignored')).toBeNull()
    expect(warn.mock.calls.filter(([message]) => /renders its cells from `columns`/.test(String(message)))).toHaveLength(1)
    warn.mockRestore()
  })

  it('ArrayTable rows come from the surrounding <ArrayField rowKey>', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'x1', name: 'A' }] } })
    render(
      <Form form={form}>
        <ArrayField name="rows" rowKey="id" component={[ArrayTable, { settings: false, pagination: false, columns: [{ key: 'k', render: ({ key }) => <span data-testid="key">{key}</span> }, { key: 'v', render: () => <root.Field name="name" component={[Input]} /> }] }]} />
      </Form>,
    )
    expect(screen.getByTestId('key').textContent).toBe('x1')
    // the relative `name` cell binds to rows.0.name
    expect(screen.getByDisplayValue('A')).toBeTruthy()
  })
})

describe('dragProps on the array and tree handles', () => {
  it('array: stable per path, dropping row A on row B moves A to B', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a' }, { id: 'b' }, { id: 'c' }] } })
    const { result, rerender } = renderHook(() => useArrayField('rows', 'id'), { wrapper: wrap(form) })
    const first = result.current.dragProps
    rerender()
    expect(result.current.dragProps).toBe(first)
    act(() => {
      const from = result.current.dragProps(0)
      const to = result.current.dragProps(2)
      const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: null } as never
      from.onDragStart(event)
      to.onDragOver(event)
      to.onDrop(event)
    })
    expect(form.values.rows.map((row: { id: string }) => row.id)).toEqual(['b', 'c', 'a'])
  })

  it('array: falls back to dataTransfer text when the drag started elsewhere', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a' }, { id: 'b' }] } })
    const { result } = renderHook(() => useArrayField('rows'), { wrapper: wrap(form) })
    act(() => {
      const data = new Map<string, string>([['text/plain', '1']])
      const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: { getData: (k: string) => data.get(k) ?? '' } } as never
      result.current.dragProps(0).onDrop(event)
    })
    expect(form.values.rows.map((row: { id: string }) => row.id)).toEqual(['b', 'a'])
  })

  it('tree: dropping a node on another moves it there; a move into itself is refused', () => {
    const form = createForm({
      initialValues: { nodes: [{ id: 'a', children: [{ id: 'a1', children: [] }] }, { id: 'b', children: [] }] },
    })
    const { result } = renderHook(() => useTreeField('nodes'), { wrapper: wrap(form) })
    const event = { preventDefault() {}, stopPropagation() {}, dataTransfer: null } as never
    act(() => {
      result.current.dragProps([1]).onDragStart(event)
      result.current.dragProps([0, 0]).onDrop(event)
    })
    expect(form.values.nodes[0].children.map((node: { id: string }) => node.id)).toEqual(['b', 'a1'])
    act(() => {
      result.current.dragProps([0]).onDragStart(event)
      result.current.dragProps([0, 0]).onDrop(event)
    })
    expect(form.values.nodes.map((node: { id: string }) => node.id)).toEqual(['a'])
  })
})

describe('ArrayItems drag goes through the handle', () => {
  it('SortHandle → Item drop moves the row', () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a' }, { id: 'b' }] } })
    render(
      <Form form={form}>
        <ArrayField name="rows" component={[ArrayItems]}>
          {() => (
            <ArrayItems.Item>
              <ArrayItems.SortHandle />
            </ArrayItems.Item>
          )}
        </ArrayField>
      </Form>,
    )
    const handles = screen.getAllByTestId('sort-handle')
    const items = screen.getAllByTestId('array-item')
    fireEvent.dragStart(handles[1]!)
    fireEvent.dragOver(items[0]!)
    fireEvent.drop(items[0]!)
    expect(form.values.rows.map((row: { id: string }) => row.id)).toEqual(['b', 'a'])
  })
})
