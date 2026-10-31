// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Form, RowScope, TreeField, useField, useForm, useTreeNode } from '../src'
import type { FormEngine } from '../src/core'

afterEach(cleanup)

type Node = { id: string; name: string; children: Node[] }
type Values = { menu: Node[] }

function NodeRow() {
  const { pos, record } = useTreeNode<Node>()
  const name = useField<Node, 'name'>('name', { required: true }) // a JSX rule, not a template
  return <div>[{record.id} {pos.join(',')} {name.errors[0] ?? 'ok'}]</div>
}

function Branch({ path, nodes, pos }: { path: string; nodes: Node[]; pos: number[] }) {
  return (
    <>
      {nodes.map((node, index) => (
        <RowScope key={node.id} path={`${path}.${index}`} pos={[...pos, index]}>
          <NodeRow />
          <Branch path={`${path}.${index}.children`} nodes={node.children} pos={[...pos, index]} />
        </RowScope>
      ))}
    </>
  )
}

/** arrays example「树：跨层移动」: a node's error follows its id when another node is moved in front of it. */
describe('JSX validation lease across a tree move', () => {
  it('a sibling shifting onto the old path does not release the moved node rules', async () => {
    let form!: FormEngine<Values>
    let move!: (from: number[], to: number[]) => unknown
    function App() {
      form = useForm<Values>({
        initialValues: {
          menu: [
            { id: 'file', name: '文件', children: [{ id: 'new', name: '', children: [] }, { id: 'open', name: '打开', children: [] }] },
            { id: 'edit', name: '编辑', children: [{ id: 'undo', name: '撤销', children: [] }] },
          ],
        },
      })
      return (
        <Form form={form}>
          <TreeField name="menu" rowKey="id">
            {(tree) => {
              move = tree.move
              return <Branch path={tree.path} nodes={tree.value as Node[]} pos={[]} />
            }}
          </TreeField>
        </Form>
      )
    }
    const view = render(<App />)
    await act(async () => { await form.validate() })
    expect(view.container.textContent).toContain('[new 0,0 必填]')
    await act(async () => { move([1, 0], [0, 0]) })
    expect(view.container.textContent).toContain('[undo 0,0 ok][new 0,1 必填][open 0,2 ok]')
    expect(form.errors.map((error: { path: string }) => error.path)).toEqual(['menu.0.children.1.name'])
    // the rule is still leased: fixing and clearing the name re-validates as required
    await act(async () => { await form.validate() })
    expect(form.errors.map((error: { path: string }) => error.path)).toEqual(['menu.0.children.1.name'])
  })
})
