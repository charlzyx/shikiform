// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useRef, useState, type ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { engineOf } from '@shikiform/core/internal'
import { createForm, Field, Form, TreeField, typed, useField, useTreeField, type TreeNodeRender } from '@shikiform/react'
import { fieldErrorsOf } from './field-errors'

afterEach(cleanup)

type MenuNode = {
  id: string
  name: string
  children: MenuNode[]
}

describe('<TreeField>', () => {
  it('recursively renders nested nodes with path, pos, index, key, depth, and null children on leaves', () => {
    const form = createForm<{ menu: MenuNode[] }>({
      initialValues: {
        menu: [
          {
            id: 'file',
            name: '文件',
            children: [
              { id: 'new', name: '新建', children: [] },
              { id: 'open', name: '打开', children: [] },
            ],
          },
          {
            id: 'edit',
            name: '编辑',
            children: [],
          },
        ],
      },
    })

    const snapshots: Array<Omit<TreeNodeRender, 'children'> & { hasChildren: boolean }> = []

    function NodeLabel() {
      const field = useField<MenuNode, 'name'>('name')
      const { record } = useTreeField<MenuNode>()
      return <span data-testid={`label-${record.id}`}>{field.value}</span>
    }

    render(
      <Form form={form}>
        <ul data-testid="root">
          <TreeField name="menu" rowKey="id">
            {(node) => {
              snapshots.push({
                path: node.path,
                pos: node.pos,
                index: node.index,
                key: node.key,
                depth: node.depth,
                hasChildren: node.children !== null,
              })
              return (
                <li data-testid={`li-${node.key}`} data-depth={node.depth} data-path={node.path}>
                  <NodeLabel />
                  {node.children && <ul data-testid={`sub-${node.key}`}>{node.children}</ul>}
                </li>
              )
            }}
          </TreeField>
        </ul>
      </Form>,
    )

    expect(snapshots).toEqual([
      { path: 'menu.0', pos: [0], index: 0, key: 'file', depth: 0, hasChildren: true },
      { path: 'menu.0.children.0', pos: [0, 0], index: 0, key: 'new', depth: 1, hasChildren: false },
      { path: 'menu.0.children.1', pos: [0, 1], index: 1, key: 'open', depth: 1, hasChildren: false },
      { path: 'menu.1', pos: [1], index: 1, key: 'edit', depth: 0, hasChildren: false },
    ])
    expect(screen.getAllByTestId(/^li-/).map((el) => el.getAttribute('data-path'))).toEqual([
      'menu.0',
      'menu.0.children.0',
      'menu.0.children.1',
      'menu.1',
    ])
    expect(screen.getByTestId('sub-file')).toBeTruthy()
    expect(screen.queryByTestId('sub-new')).toBeNull()
    expect(screen.queryByTestId('sub-open')).toBeNull()
    expect(screen.queryByTestId('sub-edit')).toBeNull()
    expect(screen.getByTestId('label-new').textContent).toBe('新建')
  })

  it('supports custom childrenKey and rowKey', () => {
    type CustomNode = { code: string; title: string; items?: CustomNode[] }
    const form = createForm<{ tree: CustomNode[] }>({
      initialValues: {
        tree: [{ code: 'r1', title: 'Root', items: [{ code: 'c1', title: 'Child' }] }],
      },
    })

    const paths: string[] = []
    render(
      <Form form={form}>
        <TreeField name="tree" childrenKey="items" rowKey="code">
          {(node) => {
            paths.push(`${node.key}:${node.path}:${node.depth}:${node.children === null ? 'leaf' : 'branch'}`)
            return (
              <div>
                <Field name="title">{(f) => <span data-testid={`title-${node.key}`}>{f.value}</span>}</Field>
                {node.children}
              </div>
            )
          }}
        </TreeField>
      </Form>,
    )

    expect(paths).toEqual([
      'r1:tree.0:0:branch',
      'c1:tree.0.items.0:1:leaf',
    ])
    expect(screen.getByTestId('title-c1').textContent).toBe('Child')
  })

  it('preserves field errors and state across a cross-parent moveTree', async () => {
    const form = createForm<{ menu: MenuNode[] }>({
      initialValues: {
        menu: [
          {
            id: 'file',
            name: '文件',
            children: [
              { id: 'new', name: '', children: [] },
              { id: 'open', name: '打开', children: [] },
            ],
          },
          {
            id: 'edit',
            name: '编辑',
            children: [{ id: 'undo', name: '撤销', children: [] }],
          },
        ],
      },
    })

    function NodeRow() {
      const { pos, path, record } = useTreeField<MenuNode>()
      const name = useField<MenuNode, 'name'>('name', { required: true })
      const [localCount, setLocalCount] = useState(0)
      return (
        <div data-testid={`row-${record.id}`}>
          <span data-testid={`meta-${record.id}`}>{`${pos.join('.')}|${path}|${name.errors[0] ?? 'ok'}|${localCount}`}</span>
          <button data-testid={`bump-${record.id}`} type="button" onClick={() => setLocalCount((c) => c + 1)}>
            +
          </button>
        </div>
      )
    }

    render(
      <Form form={form}>
        <TreeField name="menu" rowKey="id">
          {(node) => (
            <div>
              <NodeRow />
              {node.children}
            </div>
          )}
        </TreeField>
      </Form>,
    )

    // Increment local component state on sibling `new` (stays under `file`) and validate so `new` has an error
    fireEvent.click(screen.getByTestId('bump-new'))
    await act(async () => {
      await fieldErrorsOf(form.validate())
    })
    expect(screen.getByTestId('meta-new').textContent).toBe('0.0|menu.0.children.0|必填|1')
    expect(screen.getByTestId('meta-undo').textContent).toBe('1.0|menu.1.children.0|ok|0')

    // Move `undo` ([1, 0]) across parents to the front of `file` ([0, 0])
    await act(async () => {
      engineOf(form).moveTree('menu', [1, 0], [0, 0])
    })

    // `new` shifted to [0, 1] (`menu.0.children.1`) and keeps both its field error and its local React state
    expect(screen.getByTestId('meta-undo').textContent).toBe('0.0|menu.0.children.0|ok|0')
    expect(screen.getByTestId('meta-new').textContent).toBe('0.1|menu.0.children.1|必填|1')
    expect(screen.getByTestId('meta-open').textContent).toBe('0.2|menu.0.children.2|ok|0')
    expect(form.errors.map((e) => e.path)).toEqual(['menu.0.children.1.name'])
  })

  it('assigns stable WeakMap keys to id-less object nodes', () => {
    type IdlessNode = { name: string; children: IdlessNode[] }
    const rootNode: IdlessNode = { name: 'Root', children: [{ name: 'Leaf', children: [] }] }
    const form = createForm<{ nodes: IdlessNode[]; tick: number }>({
      initialValues: {
        nodes: [rootNode],
        tick: 0,
      },
    })

    const seenKeys: string[][] = []

    function App() {
      const tick = useField('tick')
      const currentKeys: string[] = []
      return (
        <div data-tick={tick.value}>
          <TreeField name="nodes">
            {(node) => {
              currentKeys.push(node.key)
              return (
                <div data-testid={`idless-${node.pos.join('.')}`}>
                  <Field name="name">{(f) => <span>{f.value}</span>}</Field>
                  {node.children}
                </div>
              )
            }}
          </TreeField>
          {(() => {
            seenKeys.push(currentKeys)
            return null
          })()}
        </div>
      )
    }

    render(
      <Form form={form}>
        <App />
      </Form>,
    )

    expect(seenKeys[0]).toHaveLength(2)
    expect(seenKeys[0]![0]).not.toBe(seenKeys[0]![1])
    expect(screen.getByTestId('idless-0').textContent).toBe('RootLeaf')

    // Re-rendering the tree with the same object references preserves the WeakMap keys
    act(() => {
      form.setValue('tick', 1)
    })
    expect(seenKeys[seenKeys.length - 1]).toEqual(seenKeys[0])
  })

  it('works with typed(form).TreeField and scopes child Field / ObjectField / ArrayField / TreeField', () => {
    const form = createForm<{ menu: MenuNode[] }>({
      initialValues: {
        menu: [
          {
            id: 'file',
            name: '文件',
            children: [{ id: 'new', name: '新建', children: [] }],
          },
        ],
      },
    })
    const F = typed(form)

    function typeCheckOnly() {
      void (
        <F.TreeField name="menu" rowKey="id">
          {(node) => (
            <>
              <node.Field name="name" />
              {/* @ts-expect-error invalid field on MenuNode */}
              <node.Field name="nonExistent" />
              {node.children}
            </>
          )}
        </F.TreeField>
      )
      void (
        // @ts-expect-error invalid array path on form
        <F.TreeField name="notATree">{() => null}</F.TreeField>
      )
    }
    void typeCheckOnly

    render(
      <Form form={form}>
        <F.TreeField name="menu" rowKey="id">
          {(node) => (
            <div data-testid={`typed-node-${node.key}`}>
              <node.Field name="name">
                {(field) => <span data-testid={`typed-val-${node.key}`}>{`${field.value}@${node.depth}`}</span>}
              </node.Field>
              {node.children}
            </div>
          )}
        </F.TreeField>
      </Form>,
    )

    expect(screen.getByTestId('typed-val-file').textContent).toBe('文件@0')
    expect(screen.getByTestId('typed-val-new').textContent).toBe('新建@1')
  })

  it('moving one node does not re-render siblings or other subtrees', () => {
    type Node = { id: string; name: string; children: Node[] }
    const form = createForm<{ menu: Node[] }>({
      initialValues: {
        menu: [
          { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1', children: [] }, { id: 'a2', name: 'A2', children: [] }] },
          { id: 'b', name: 'B', children: [{ id: 'b1', name: 'B1', children: [] }] },
          { id: 'c', name: 'C', children: [{ id: 'c1', name: 'C1', children: [] }] },
        ],
      },
    })
    function Mark({ id, pos, children }: { id: string; pos: string; children?: ReactNode }) {
      const renders = useRef(0)
      renders.current += 1
      return <div data-testid={`n-${id}`} data-pos={pos} data-renders={renders.current}>{children}</div>
    }
    function Move() {
      const tree = useTreeField('menu')
      return <button type="button" data-testid="move" onClick={() => tree.move([0, 1], [1, 1])}>move</button>
    }
    render(
      <Form form={form}>
        <Move />
        <TreeField name="menu" rowKey="id">
          {(node) => <Mark id={node.key} pos={node.pos.join('.')}>{node.children}</Mark>}
        </TreeField>
      </Form>,
    )
    const renders = (id: string) => screen.getByTestId(`n-${id}`).getAttribute('data-renders')
    const before = Object.fromEntries(['a', 'a1', 'b', 'b1', 'c', 'c1'].map((id) => [id, renders(id)]))
    fireEvent.click(screen.getByTestId('move'))
    expect(screen.getByTestId('n-a2').getAttribute('data-pos')).toBe('1.1')
    expect(screen.getByTestId('n-a1').getAttribute('data-pos')).toBe('0.0')
    expect(screen.getByTestId('n-b1').getAttribute('data-pos')).toBe('1.0')
    for (const id of ['a1', 'b1', 'c', 'c1']) expect(renders(id)).toBe(before[id])
    expect(Number(renders('a'))).toBe(Number(before.a) + 1)
    expect(Number(renders('b'))).toBe(Number(before.b) + 1)
  })

  it('useTreeField() inside a node does not re-render when another node moves', () => {
    type Node = { id: string; name: string; children: Node[] }
    const form = createForm<{ menu: Node[] }>({
      initialValues: {
        menu: [
          { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1', children: [] }, { id: 'a2', name: 'A2', children: [] }] },
          { id: 'b', name: 'B', children: [{ id: 'b1', name: 'B1', children: [] }] },
          { id: 'c', name: 'C', children: [{ id: 'c1', name: 'C1', children: [] }] },
        ],
      },
    })
    function NodeView({ children }: { children?: ReactNode }) {
      const node = useTreeField<Node>()
      const renders = useRef(0)
      renders.current += 1
      return <div data-testid={`hook-${node.record.id}`} data-path={node.path} data-tree={node.treePath} data-renders={renders.current}>{children}</div>
    }
    function Move() {
      const tree = useTreeField('menu')
      return <button type="button" data-testid="move-hook" onClick={() => tree.move([0, 1], [1, 1])}>move</button>
    }
    render(
      <Form form={form}>
        <Move />
        <TreeField name="menu" rowKey="id">
          {(node) => <NodeView>{node.children}</NodeView>}
        </TreeField>
      </Form>,
    )
    const renders = (id: string) => screen.getByTestId(`hook-${id}`).getAttribute('data-renders')
    const before = Object.fromEntries(['a', 'a1', 'a2', 'b', 'b1', 'c', 'c1'].map((id) => [id, renders(id)]))
    fireEvent.click(screen.getByTestId('move-hook'))
    expect(screen.getByTestId('hook-a2').getAttribute('data-path')).toBe('menu.1.children.1')
    expect(screen.getByTestId('hook-a1').getAttribute('data-path')).toBe('menu.0.children.0')
    expect(screen.getByTestId('hook-a1').getAttribute('data-tree')).toBe('menu')
    // a2 moved; a and b are ancestors whose child lists changed. Unrelated nodes stay put.
    for (const id of ['a1', 'b1', 'c', 'c1']) expect(renders(id)).toBe(before[id])
  })

  it('errors and warnings are this path only; path is the handle target and treePath is the root', () => {
    const form = createForm({ initialValues: { menu: [{ id: 'a', name: '', children: [] }] } })
    function Root() {
      const tree = useTreeField('menu')
      return <span data-testid="root">{`${tree.path}|${tree.treePath}|${tree.errors.join('/')}|${tree.warnings.join('/')}`}</span>
    }
    function Node() {
      const node = useTreeField<{ id: string }>()
      return <span data-testid="node">{`${node.path}|${node.treePath}|${node.errors.join('/')}`}</span>
    }
    render(
      <Form form={form}>
        <Root />
        <TreeField name="menu" rowKey="id">{() => <Node />}</TreeField>
      </Form>,
    )
    act(() => form.setErrors({ menu: '根', 'menu.0': '节点', 'menu.0.name': '名称' }))
    expect(screen.getByTestId('root').textContent).toBe('menu|menu|根|')
    expect(screen.getByTestId('node').textContent).toBe('menu.0|menu|节点')
  })
})
