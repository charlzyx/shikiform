import { describe, expect, it } from 'vitest'
import { pathOf, posOf } from '../src/core'
import { isPosPrefix } from '../src/core/shared/tree-ops'
import { createEngine } from '../src/core/engine/form-engine'

interface Node {
  id: string
  name: string
  children: Node[]
}

describe('tree move', () => {
  const initial = (): Node[] => [
    { id: 'a', name: 'A', children: [{ id: 'a1', name: '', children: [] }] },
    { id: 'b', name: 'B', children: [{ id: 'b1', name: 'B1', children: [] }] },
  ]

  it('round-trips pos and path', () => {
    expect(pathOf('nodes', [0, 2, 1])).toBe('nodes.0.children.2.children.1')
    expect(posOf('nodes', 'nodes.0.children.2.children.1')).toEqual([0, 2, 1])
    expect(isPosPrefix([0, 1], [0, 1, 2])).toBe(true)
    expect(isPosPrefix([0, 1], [0, 2])).toBe(false)
  })

  it('moves a node across parents and keeps its error', async () => {
    const form = createEngine<{ nodes: Node[] }>({ initialValues: { nodes: initial() } })
    form.registerTree('nodes', { childrenKey: 'children', rowKey: 'id' })
    form.registerField('nodes.*.children.*.name', { required: true })
    await form.validate('nodes.0.children.0.name')
    expect(form.errors.some((error) => error.path === 'nodes.0.children.0.name')).toBe(true)
    const moved = form.moveTree('nodes', [0, 0], [1, 1])
    expect(moved.ok).toBe(true)
    const nodes = form.getValue('nodes')
    expect(nodes[0]!.children).toEqual([])
    expect(nodes[1]!.children.map((node) => node.id)).toEqual(['b1', 'a1'])
    expect(form.errors.some((error) => error.path === 'nodes.1.children.1.name')).toBe(true)
  })

  it('refuses a move into a descendant', () => {
    const form = createEngine<{ nodes: Node[] }>({ initialValues: { nodes: initial() } })
    form.registerTree('nodes', { childrenKey: 'children', rowKey: 'id' })
    const refused = form.moveTree('nodes', [0], [0, 0])
    expect(refused.ok).toBe(false)
    expect(form.getValue('nodes.0.id')).toBe('a')
  })
})
