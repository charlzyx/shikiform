import { createContext, memo, useContext, useRef } from 'react'
import { Form, RowScope, useArrayField, useField, useForm, useTreeField } from '@shikiform/react'

interface Item {
  id: string
  name: string
}

interface Node {
  id: string
  name: string
  children: Node[]
}

/** `handle.dragProps` is stable per array / tree, so memoized rows read it from context without re-rendering. */
const ArrayDrag = createContext<ReturnType<typeof useArrayField>['dragProps'] | null>(null)
const TreeDrag = createContext<ReturnType<typeof useTreeField>['dragProps'] | null>(null)

export function HeadlessPage() {
  const form = useForm<{ items: Item[]; nodes: Node[] }>({
    initialValues: {
      items: [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
        { id: 'c', name: 'C' },
        { id: 'd', name: 'D' },
      ],
      nodes: [
        { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1', children: [] }, { id: 'a2', name: 'A2', children: [] }] },
        { id: 'b', name: 'B', children: [{ id: 'b1', name: 'B1', children: [] }] },
      ],
    },
  })
  return (
    <Form form={form}>
      <ItemList />
      <NodeList />
    </Form>
  )
}

function ItemList() {
  const items = useArrayField('items')
  return (
    <ArrayDrag.Provider value={items.dragProps}>
      <ul data-testid="items">
        {items.keys.map((row) => (
          <ItemRow key={row.key} index={row.index} id={row.key} />
        ))}
      </ul>
    </ArrayDrag.Provider>
  )
}

const ItemRow = memo(function ItemRow({ index, id }: { index: number; id: string }) {
  const dragProps = useContext(ArrayDrag)
  const renders = useRef(0)
  renders.current += 1
  return (
    <RowScope path={`items.${index}`} index={index}>
      <li data-testid={`row-${index}`} data-id={id} data-renders={renders.current} {...dragProps?.(index)}>
        <Name />
      </li>
    </RowScope>
  )
})

function Name() {
  const field = useField<Item>('name')
  return <span>{field.value}</span>
}

function NodeList() {
  const tree = useTreeField('nodes', { childrenKey: 'children', rowKey: 'id' })
  const flat = flatten(tree.value as Node[])
  return (
    <TreeDrag.Provider value={tree.dragProps}>
      <ul data-testid="tree">
        {flat.map((entry) => (
          <TreeNode key={entry.node.id} node={entry.node} pos={entry.pos} posKey={entry.posKey} />
        ))}
      </ul>
    </TreeDrag.Provider>
  )
}

function flatten(nodes: Node[], prefix: number[] = [], out: { node: Node; pos: number[]; posKey: string }[] = []) {
  nodes.forEach((node, index) => {
    const pos = [...prefix, index]
    out.push({ node, pos, posKey: pos.join('.') })
    if (node.children?.length) flatten(node.children, pos, out)
  })
  return out
}

const TreeNode = memo(function TreeNode({ node, pos, posKey }: { node: Node; pos: number[]; posKey: string }) {
  const dragProps = useContext(TreeDrag)
  const renders = useRef(0)
  renders.current += 1
  return (
    <li
      data-testid={`node-${node.id}`}
      data-pos={posKey}
      data-renders={renders.current}
      style={{ marginLeft: pos.length * 12 }}
      {...dragProps?.(pos)}
    >
      {node.name}
    </li>
  )
}, (prev, next) => prev.node.id === next.node.id && prev.posKey === next.posKey)
