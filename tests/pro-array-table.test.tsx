// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ArrayField, createForm, Field, Form } from '../src'
import { FormItem, Input, ArrayTable } from '../src/antd'

afterEach(cleanup)

interface Row {
  a1: string
  subitems?: { a1: string }[]
}

function rows(count: number): Row[] {
  return Array.from({ length: count }, (_, index) => ({ a1: `${index}.1`, subitems: index % 2 ? undefined : [{ a1: `c.${index}.1` }] }))
}

function mount(initial: Row[], extra: Partial<Parameters<typeof ArrayTable>[0]> = {}) {
  const form = createForm({ initialValues: { list: initial } })
  const view = render(
    <Form form={form}>
      <ArrayField name="list"
        component={[
          ArrayTable,
          {
            pagination: { pageSize: 5 },
            rowSelection: true,
            columns: [
              { key: 'index', title: 'Index', render: () => <ArrayTable.Index /> },
              { key: 'a1', title: 'A1', render: (cell) => <Field name="a1" decorator={[FormItem]}><Input data-testid={`a1-${cell.index}`} /></Field> },
              { key: 'act', title: '操作', render: () => <><ArrayTable.MoveUp /><ArrayTable.MoveDown /><ArrayTable.Remove /></> },
            ],
            extra: <ArrayTable.Addition defaultValue={() => ({ a1: 'new' })} />,
            ...extra,
          },
        ]}
      />
    </Form>,
  )
  return { form, view }
}

describe('ArrayTable', () => {
  it('slices pages, shows global positions, and binds cells to the row', async () => {
    const { form } = mount(rows(12))
    expect(screen.getAllByTestId('row-index').map((node) => node.textContent)).toEqual(['1', '2', '3', '4', '5'])
    fireEvent.click(screen.getByTitle('2'))
    await waitFor(() => expect(screen.getAllByTestId('row-index')[0]!.textContent).toBe('6'))
    fireEvent.change(screen.getByTestId('a1-5'), { target: { value: 'edited' } })
    expect(form.getValue('list.5.a1' as never)).toBe('edited')
  })

  it('add jumps to the page of the new row; remove and move act on the array', async () => {
    const { form } = mount(rows(5))
    fireEvent.click(screen.getByTestId('row-add'))
    await waitFor(() => expect(screen.getAllByTestId('row-index').map((n) => n.textContent)).toEqual(['6']))
    expect(form.getValue('list').length).toBe(6)
    fireEvent.click(screen.getByTitle('1'))
    await waitFor(() => expect(screen.getAllByTestId('row-index').length).toBe(5))
    fireEvent.click(screen.getAllByTestId('row-down')[0]!)
    expect(form.getValue('list').slice(0, 2).map((row) => row.a1)).toEqual(['1.1', '0.1'])
    fireEvent.click(screen.getAllByTestId('row-remove')[0]!)
    await waitFor(() => expect(form.getValue('list').length).toBe(5))
  })

  it('selection bar selects, inverts, and clears the current page; a page change clears it', async () => {
    mount(rows(8))
    fireEvent.click(screen.getByTestId('selection-all'))
    expect(screen.getByTestId('selection-count').textContent).toBe('选中 5 项')
    const firstRow = screen.getByTestId('row-0')
    fireEvent.click(within(firstRow).getByRole('checkbox'))
    expect(screen.getByTestId('selection-count').textContent).toBe('选中 4 项')
    fireEvent.click(screen.getByTestId('selection-invert'))
    expect(screen.getByTestId('selection-count').textContent).toBe('选中 1 项')
    fireEvent.click(screen.getByTitle('2'))
    await waitFor(() => expect(screen.getByTestId('selection-count').textContent).toBe('选中 0 项'))
  })

  it('async onRemove keeps the row until it settles, and a rejection keeps it', async () => {
    let finish: (() => void) | undefined
    let fail: (() => void) | undefined
    const onRemove = vi.fn(() => new Promise<void>((resolve, reject) => ((finish = resolve), (fail = reject))))
    const { form } = mount(rows(3), { onRemove })
    fireEvent.click(screen.getAllByTestId('row-remove')[0]!)
    expect(form.getValue('list').length).toBe(3)
    await act(async () => fail!())
    expect(form.getValue('list').length).toBe(3)
    fireEvent.click(screen.getAllByTestId('row-remove')[0]!)
    await act(async () => finish!())
    expect(form.getValue('list').map((row) => row.a1)).toEqual(['1.1', '2.1'])
  })

  it('expandable rows render a nested read-only table in the row scope', async () => {
    const form = createForm({ initialValues: { list: rows(3) } })
    render(
      <Form form={form}>
        <ArrayField name="list"
          component={[
            ArrayTable,
            {
              settings: false,
              columns: [{ key: 'a1', title: 'A1', render: () => <Field name="a1" decorator={[FormItem]}><Input /></Field> }],
              expandable: {
                defaultExpandAll: true,
                rowExpandable: (record) => Array.isArray(record.subitems),
                render: () => (
                  <ArrayField name="subitems"
                    component={[
                      ArrayTable,
                      {
                        pattern: 'readPretty',
                        settings: false,
                        showHeader: false,
                        columns: [{ key: 'a1', render: () => <Field name="a1" decorator={[FormItem]}><Input /></Field> }],
                      },
                    ]}
                  />
                ),
              },
            },
          ]}
        />
      </Form>,
    )
    await waitFor(() => expect(screen.getByText('c.0.1')).toBeTruthy())
    expect(screen.getByText('c.2.1')).toBeTruthy()
    expect(screen.getByText('c.0.1').closest('[data-read-pretty]')).toBeTruthy()
  })

  it('drag sort: handle starts the drag, dropping on a row moves it there', () => {
    const { form } = mount(rows(4), {
      columns: [
        { key: 'sort', render: () => <ArrayTable.SortHandle /> },
        { key: 'a1', title: 'A1', render: () => <Field name="a1" decorator={[FormItem]}><Input /></Field> },
      ],
    })
    fireEvent.dragStart(screen.getAllByTestId('sort-handle')[0]!)
    fireEvent.dragOver(screen.getByTestId('row-2'))
    fireEvent.drop(screen.getByTestId('row-2'))
    expect(form.getValue('list').map((row) => row.a1)).toEqual(['1.1', '2.1', '0.1', '3.1'])
  })

  it('column settings hide and reorder columns', async () => {
    mount(rows(2))
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toContain('A1')
    fireEvent.click(screen.getByTestId('table-settings'))
    await waitFor(() => expect(screen.getByTestId('column-settings')).toBeTruthy())
    fireEvent.click(screen.getByTestId('column-show-a1'))
    await waitFor(() => expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).not.toContain('A1'))
    fireEvent.click(screen.getByTestId('column-up-act'))
    fireEvent.click(screen.getByTestId('column-up-act'))
    await waitFor(() => {
      const titles = screen.getAllByRole('columnheader').map((th) => th.textContent).filter(Boolean)
      expect(titles.indexOf('操作')).toBeLessThan(titles.indexOf('Index'))
    })
  })

  it('column settings reorder by dragging a row onto another; ↑ ↓ stay for the keyboard', async () => {
    mount(rows(2))
    fireEvent.click(screen.getByTestId('table-settings'))
    await waitFor(() => expect(screen.getByTestId('column-settings')).toBeTruthy())
    const titles = () => screen.getAllByRole('columnheader').map((th) => th.textContent).filter(Boolean)
    expect(titles()).toEqual(['Index', 'A1', '操作'])
    const row = (key: string) => screen.getByTestId(`column-row-${key}`)
    expect(row('act').getAttribute('draggable')).toBe('true')
    fireEvent.dragStart(row('act'))
    await waitFor(() => expect(row('act').getAttribute('data-dragging')).toBe('true'))
    fireEvent.dragOver(row('index'))
    await waitFor(() => expect(row('index').getAttribute('data-drag-over')).toBe('true'))
    fireEvent.drop(row('index'))
    await waitFor(() => expect(titles()).toEqual(['操作', 'Index', 'A1']))
    expect(row('act').getAttribute('data-dragging')).toBeNull()
    // A drop without a drag started from the list (e.g. a file) does nothing.
    fireEvent.dragOver(row('a1'))
    fireEvent.drop(row('a1'))
    expect(titles()).toEqual(['操作', 'Index', 'A1'])
    // Keyboard path still works next to drag.
    expect(screen.getByTestId('column-down-act').getAttribute('aria-label')).toBe('下移')
    fireEvent.click(screen.getByTestId('column-down-act'))
    await waitFor(() => expect(titles()).toEqual(['Index', '操作', 'A1']))
  })
})
