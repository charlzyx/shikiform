import { createContext, memo, useContext, useMemo, useRef, type DragEvent, type RefObject } from 'react'
import { Form, RowScope, useArrayField, useArrayMove, useField, useForm, useTreeField, useTreeMove } from 'shikiform'
import type { Pos } from 'shikiform/core'

interface Item {
  id: string
  name: string
}

interface Node {
  id: string
  name: string
  children: Node[]
}

interface DragBag<T> {
  from: RefObject<T | null>
  move: (from: T, to: T) => void
}

const ArrayDrag = createContext<DragBag<number> | null>(null)
const TreeDrag = createContext<DragBag<Pos> | null>(null)

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
  const drag = useArrayMove('items')
  const from = useRef<number | null>(null)
  const bag = useMemo<DragBag<number>>(() => ({ from, move: drag.move }), [drag.move])
  return (
    <ArrayDrag.Provider value={bag}>
      <ul data-testid="items">
        {items.keys.map((row) => (
          <ItemRow key={row.key} index={row.index} id={row.key} />
        ))}
      </ul>
    </ArrayDrag.Provider>
  )
}

const ItemRow = memo(function ItemRow({ index, id }: { index: number; id: string }) {
  const drag = useContext(ArrayDrag)
  const renders = useRef(0)
  renders.current += 1
  return (
    <RowScope path={`items.${index}`} index={index}>
      <li
        data-testid={`row-${index}`}
        data-id={id}
        data-renders={renders.current}
        draggable
        onDragStart={() => {
          if (drag) drag.from.current = index
        }}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const from = drag?.from.current
          if (from != null && from !== index) drag?.move(from, index)
        }}
      >
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
  const drag = useTreeMove('nodes')
  const from = useRef<Pos | null>(null)
  const bag = useMemo<DragBag<Pos>>(() => ({ from, move: (a, b) => void drag.move(a, b) }), [drag.move])
  const flat = flatten(tree.value as Node[])
  return (
    <TreeDrag.Provider value={bag}>
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
  const drag = useContext(TreeDrag)
  const renders = useRef(0)
  renders.current += 1
  return (
    <li
      data-testid={`node-${node.id}`}
      data-pos={posKey}
      data-renders={renders.current}
      style={{ marginLeft: pos.length * 12 }}
      draggable
      onDragStart={(event: DragEvent) => {
        event.stopPropagation()
        if (drag) drag.from.current = pos
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const from = drag?.from.current
        if (from) drag?.move(from, pos)
      }}
    >
      {node.name}
    </li>
  )
}, (prev, next) => prev.node.id === next.node.id && prev.posKey === next.posKey)
