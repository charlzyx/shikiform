import { createContext, memo, useContext, useRef } from 'react'
import { ArrayField, Form, TreeField, useArray, useField, useForm, useTreeNode } from '@shikiform/react'

interface Item {
  id: string
  name: string
}

interface Node {
  id: string
  name: string
  children: Node[]
}

/** `handle.dragProps` is stable per array, so memoized rows read it from context without re-rendering. */
const ArrayDrag = createContext<ReturnType<typeof useArray>['dragProps'] | null>(null)

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
  const items = useArray('items')
  return (
    <ArrayDrag.Provider value={items.dragProps}>
      <ul data-testid="items">
        <ArrayField name="items">{renderItemRow}</ArrayField>
      </ul>
    </ArrayDrag.Provider>
  )
}

function renderItemRow(row: { index: number; key: string }) {
  return <ItemRow index={row.index} id={row.key} />
}

const ItemRow = memo(function ItemRow({ index, id }: { index: number; id: string }) {
  const dragProps = useContext(ArrayDrag)
  const renders = useRef(0)
  renders.current += 1
  return (
    <li data-testid={`row-${index}`} data-id={id} data-renders={renders.current} {...dragProps?.(index)}>
      <Name />
    </li>
  )
})

function Name() {
  const field = useField<Item>('name')
  return <span>{field.value}</span>
}

function NodeList() {
  return (
    <ul data-testid="tree">
      <TreeField name="nodes" rowKey="id">
        {(node) => (
          <li>
            <NodeRow />
            {node.children && <ul style={{ paddingLeft: 20, listStyle: 'none', margin: 0 }}>{node.children}</ul>}
          </li>
        )}
      </TreeField>
    </ul>
  )
}

const NodeRow = memo(function NodeRow() {
  const { pos, record, dragProps } = useTreeNode<Node>()
  const renders = useRef(0)
  renders.current += 1
  return (
    <div
      data-testid={`node-${record.id}`}
      data-pos={pos.join('.')}
      data-renders={renders.current}
      {...dragProps()}
    >
      {record.name}
    </div>
  )
})
