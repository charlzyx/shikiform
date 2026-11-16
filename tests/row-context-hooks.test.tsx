// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ArrayField, createForm, Form, TreeField, useArray, useIndex, useRecord, useTree, useTreeNode } from '@shikiform/react'
import { ArrayTable } from '@shikiform/antd'

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
      expect(() => render(<Form form={form}><Bad hook={useTree} /></Form>)).toThrow(/useTree\(\) must render inside/)
      expect(() => render(<Form form={form}><Bad hook={useTreeNode} /></Form>)).toThrow(/useTreeNode\(\)/)
    } finally {
      console.error = quiet
    }
  })

  it('useTree reads the nearest tree; a nested tree wins; move uses final pos', () => {
    type Node = { id: string; name: string; children: Node[]; notes?: Node[] }
    const form = createForm<{ menu: Node[] }>({
      initialValues: {
        menu: [
          {
            id: 'file',
            name: '文件',
            children: [{ id: 'new', name: '新建', children: [] }],
            notes: [{ id: 'note', name: '备注', children: [] }],
          },
          { id: 'edit', name: '编辑', children: [] },
        ],
      },
    })
    function NodeLabel() {
      const tree = useTree<Node>()
      const node = useTreeNode<Node>()
      return (
        <div>
          <span data-testid={`tree-${node.record.id}`}>{tree.path}</span>
          <button data-testid={`front-${node.record.id}`} type="button" onClick={() => tree.move(node.pos, [0])}>
            front
          </button>
        </div>
      )
    }
    render(
      <Form form={form}>
        <TreeField name="menu" rowKey="id">
          {(node) => (
            <>
              <NodeLabel />
              {node.children}
              {node.index === 0 && node.depth === 0 ? (
                <TreeField name="notes" rowKey="id">{() => <NodeLabel />}</TreeField>
              ) : null}
            </>
          )}
        </TreeField>
      </Form>,
    )
    expect(screen.getByTestId('tree-file').textContent).toBe('menu')
    expect(screen.getByTestId('tree-new').textContent).toBe('menu')
    expect(screen.getByTestId('tree-note').textContent).toBe('menu.0.notes')
    fireEvent.click(screen.getByTestId('front-edit'))
    expect(form.getValue('menu.0.id')).toBe('edit')
    expect(screen.getByTestId('tree-edit').textContent).toBe('menu')
  })

  it('useTreeNode reads pos / index / record inside <TreeField>', () => {
    const form = createForm({ initialValues: { nodes: [{ label: 'root', children: [{ label: 'leaf', children: [] }] }] } })
    function Node() {
      const node = useTreeNode<{ label: string }>()
      return <span data-testid="node">{`${node.path}|${node.pos.join('.')}|${node.index}|${node.record.label}`}</span>
    }
    render(
      <Form form={form}>
        <TreeField name="nodes">
          {(node) => (
            <>
              <Node />
              {node.children}
            </>
          )}
        </TreeField>
      </Form>,
    )
    expect(screen.getAllByTestId('node').map((el) => el.textContent)).toEqual([
      'nodes.0|0|0|root',
      'nodes.0.children.0|0.0|0|leaf',
    ])
  })

  it('useTreeNode moves nodes and exposes dragProps like the tree handle', () => {
    type Node = { id: string; name: string; children: Node[] }
    const form = createForm<{ menu: Node[] }>({
      initialValues: {
        menu: [
          { id: 'file', name: '文件', children: [{ id: 'new', name: '新建', children: [] }] },
          { id: 'edit', name: '编辑', children: [{ id: 'undo', name: '撤销', children: [] }] },
        ],
      },
    })
    function Node() {
      const node = useTreeNode<Node>()
      return (
        <div>
          <span data-testid={`node-${node.record.id}`} {...node.dragProps()}>{node.path}</span>
          <button data-testid={`to-front-${node.record.id}`} type="button" onClick={() => node.move(node.pos, [0, 0])}>
            to front
          </button>
          <span data-testid={`drag-${node.record.id}`}>{String(node.dragProps().draggable)}</span>
        </div>
      )
    }
    render(
      <Form form={form}>
        <TreeField name="menu" rowKey="id">
          {(node) => (
            <>
              <Node />
              {node.children}
            </>
          )}
        </TreeField>
      </Form>,
    )
    expect(screen.getByTestId('node-undo').textContent).toBe('menu.1.children.0')
    expect(screen.getByTestId('drag-undo').textContent).toBe('true')
    // 节点自己的 move：把「撤销」移到「文件」前面
    fireEvent.click(screen.getByTestId('to-front-undo'))
    expect(form.getValue('menu.0.children.0.id')).toBe('undo')
    expect(screen.getByTestId('node-undo').textContent).toBe('menu.0.children.0')
    // 拖拽属性也能移动：drop 「新建」(pos 0.1) onto 「撤销」(pos 0.0)
    fireEvent.drop(screen.getByTestId('node-undo'), {
      dataTransfer: { getData: () => 'menu|0.1', dropEffect: 'move' },
    })
    expect(form.getValue('menu.0.children.0.id')).toBe('new')
    expect(form.getValue('menu.0.children.1.id')).toBe('undo')
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
        <ArrayField name="list" rowKey="id" component={[ArrayTable, {
          settings: false,
          pagination: false,
          columns: [{ key: 'c', render: () => <Cell /> }],
        }]} />
      </Form>,
    )
    expect(screen.getByTestId('cell-1').textContent).toBe('b|2|B|list')
    act(() => form.setValue('list.1.name', 'B3'))
    expect(screen.getByTestId('cell-1').textContent).toBe('b|2|B3|list')
  })
})
