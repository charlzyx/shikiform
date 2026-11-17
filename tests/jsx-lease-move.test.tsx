// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { engineOf } from '@shikiform/core/internal'
import { Form, TreeField, useField, useForm, useTreeField } from '@shikiform/react'
import type { FormInstance } from '@shikiform/react'
import { fieldErrorsOf } from './field-errors'


afterEach(cleanup)

type Node = { id: string; name: string; children: Node[] }
type Values = { menu: Node[] }

function NodeRow() {
  const { pos, record } = useTreeField<Node>()
  const name = useField<Node, 'name'>('name', { required: true }) // a JSX rule, not a template
  return <div>[{record.id} {pos.join(',')} {name.errors[0] ?? 'ok'}]</div>
}

/** arrays example「树：跨层移动」: a node's error follows its id when another node is moved in front of it. */
describe('JSX validation lease across a tree move', () => {
  it('a sibling shifting onto the old path does not release the moved node rules', async () => {
    let form!: FormInstance<Values>
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
            {(node) => (
              <>
                <NodeRow />
                {node.children}
              </>
            )}
          </TreeField>
        </Form>
      )
    }
    const view = render(<App />)
    await act(async () => { await fieldErrorsOf(form.validate()) })
    expect(view.container.textContent).toContain('[new 0,0 必填]')
    await act(async () => { engineOf(form).moveTree('menu', [1, 0], [0, 0]) })
    expect(view.container.textContent).toContain('[undo 0,0 ok][new 0,1 必填][open 0,2 ok]')
    expect(form.errors.map((error: { path: string }) => error.path)).toEqual(['menu.0.children.1.name'])
    // the rule is still leased: fixing and clearing the name re-validates as required
    await act(async () => { await fieldErrorsOf(form.validate()) })
    expect(form.errors.map((error: { path: string }) => error.path)).toEqual(['menu.0.children.1.name'])
  })
})
