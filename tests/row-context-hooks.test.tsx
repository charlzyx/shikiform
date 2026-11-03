// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Form, RowScope, useArray, useIndex, useRecord, useTreeNode } from '../src'
import { ArrayTable } from '../src/antd'

afterEach(cleanup)

type Row = { id: string; name: string }

function RowProbe() {
  const array = useArray<Row>()
  const index = useIndex()
  const record = useRecord<Row>()
  return (
    <div>
      <span data-testid={`row-${index}`}>
        {array.path}:{index}:{record.name}
      </span>
      <button data-testid={`remove-${index}`} type="button" onClick={() => array.remove(index)}>
        x
      </button>
      <button data-testid={`up-${index}`} type="button" onClick={() => array.move(index, 0)}>
        up
      </button>
    </div>
  )
}

describe('headless row context hooks (useArray / useIndex / useRecord / useTreeNode)', () => {
  it('read the nearest array and row without a name; useRecord is reactive and follows moves', () => {
    const form = createForm({ initialValues: { list: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as Row[] } })
    render(
      <Form form={form}>
        <ArrayField name="list" rowKey="id">
          {() => <RowProbe />}
        </ArrayField>
      </Form>,
    )
    expect(screen.getByTestId('row-0').textContent).toBe('list:0:A')
    expect(screen.getByTestId('row-1').textContent).toBe('list:1:B')
    act(() => form.setValue('list.1.name', 'B2'))
    expect(screen.getByTestId('row-1').textContent).toBe('list:1:B2')
    fireEvent.click(screen.getByTestId('up-1'))
    expect(screen.getByTestId('row-0').textContent).toBe('list:0:B2')
    fireEvent.click(screen.getByTestId('remove-0'))
    expect(form.getValue('list')).toEqual([{ id: 'a', name: 'A' }])
  })

  it('nested arrays resolve to the nearest one', () => {
    const form = createForm({ initialValues: { groups: [{ items: [{ id: 'x', name: 'X' }] }] } })
    render(
      <Form form={form}>
        <ArrayField name="groups">{() => <ArrayField name="items">{() => <RowProbe />}</ArrayField>}</ArrayField>
      </Form>,
    )
    expect(screen.getByTestId('row-0').textContent).toBe('groups.0.items:0:X')
  })

  it('throw outside an array / row / node', () => {
    const form = createForm({ initialValues: {} })
    const Bad = ({ hook }: { hook: () => unknown }) => {
      hook()
      return null
    }
    const quiet = console.error
    console.error = () => {}
    try {
      expect(() => render(<Form form={form}><Bad hook={useArray} /></Form>)).toThrow(/useArray\(\) must render inside/)
      expect(() => render(<Form form={form}><Bad hook={useIndex} /></Form>)).toThrow(/useIndex\(\) must render inside/)
      expect(() => render(<Form form={form}><Bad hook={useTreeNode} /></Form>)).toThrow(/useTreeNode\(\)/)
    } finally {
      console.error = quiet
    }
  })

  it('useTreeNode reads pos / index / record from <RowScope pos>', () => {
    const form = createForm({ initialValues: { nodes: [{ label: 'root', children: [{ label: 'leaf', children: [] }] }] } })
    function Node() {
      const node = useTreeNode<{ label: string }>()
      return <span data-testid="node">{`${node.path}|${node.pos.join('.')}|${node.index}|${node.record.label}`}</span>
    }
    render(
      <Form form={form}>
        <RowScope path="nodes.0.children.0" pos={[0, 0]}>
          <Node />
        </RowScope>
      </Form>,
    )
    expect(screen.getByTestId('node').textContent).toBe('nodes.0.children.0|0.0|0|leaf')
  })

  it('ArrayTable cells get the same hooks; ArrayTable.useRow is built on them', () => {
    const form = createForm({ initialValues: { list: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] as Row[] } })
    function Cell() {
      const row = ArrayTable.useRow()
      const array = useArray()
      return <span data-testid={`cell-${row.index}`}>{`${row.key}|${row.position}|${row.record.name}|${array.path}`}</span>
    }
    render(
      <Form form={form}>
        <ArrayField name="list" rowKey="id"
          component={[
            ArrayTable,
            {
              settings: false,
              pagination: false,
              columns: [{ key: 'c', render: () => <Cell /> }],
            },
          ]}
        />
      </Form>,
    )
    expect(screen.getByTestId('cell-1').textContent).toBe('b|2|B|list')
    act(() => form.setValue('list.1.name', 'B3'))
    expect(screen.getByTestId('cell-1').textContent).toBe('b|2|B3|list')
  })
})
