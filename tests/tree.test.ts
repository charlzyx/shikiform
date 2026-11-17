import { describe, expect, it } from 'vitest'
import { pathOf, posOf } from '@shikiform/core'
import { isPosPrefix } from '../packages/core/src/shared/tree-ops'
import { createEngine } from '../packages/core/src/engine/create'

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

  it('push, insert, remove, and replace keep field state with the node id', async () => {
    const form = createEngine<{ nodes: Node[] }>({ initialValues: { nodes: initial() } })
    form.registerTree('nodes', { childrenKey: 'children', rowKey: 'id' })
    form.registerField('nodes.*.children.*.name', { required: true })
    await form.validate('nodes.0.children.0.name')
    const paths = () => form.errors.map((error) => error.path)
    expect(paths()).toContain('nodes.0.children.0.name')

    form.pushTree('nodes', { id: 'c', name: 'C', children: [] })
    expect(form.getValue('nodes').map((node) => node.id)).toEqual(['a', 'b', 'c'])
    expect(paths()).toContain('nodes.0.children.0.name')

    form.pushTree('nodes', { id: 'b2', name: '', children: [] }, [1])
    expect(form.getValue('nodes.1.children').map((node) => node.id)).toEqual(['b1', 'b2'])
    expect(paths()).toContain('nodes.0.children.0.name')

    form.insertTree('nodes', [0, 0], { id: 'a0', name: 'A0', children: [] })
    expect(form.getValue('nodes.0.children').map((node) => node.id)).toEqual(['a0', 'a1'])
    expect(paths()).not.toContain('nodes.0.children.0.name')
    expect(paths()).toContain('nodes.0.children.1.name')

    form.removeTree('nodes', [0, 0])
    expect(form.getValue('nodes.0.children').map((node) => node.id)).toEqual(['a1'])
    expect(paths()).toContain('nodes.0.children.0.name')
    expect(paths()).not.toContain('nodes.0.children.1.name')

    form.replaceTree('nodes', [0, 0], { id: 'a2', name: 'A2', children: [] })
    expect(form.getValue('nodes.0.children.0.id')).toBe('a2')
    expect(paths()).not.toContain('nodes.0.children.0.name')
  })

  it('push creates a children array when the parent has none, and a missing parent is a no-op', () => {
    const form = createEngine<{ nodes: { id: string; children?: { id: string }[] }[] }>({
      initialValues: { nodes: [{ id: 'a' }] },
    })
    form.registerTree('nodes', { rowKey: 'id' })
    form.pushTree('nodes', { id: 'a1' }, [0])
    expect(form.getValue('nodes.0.children')).toEqual([{ id: 'a1' }])
    form.pushTree('nodes', { id: 'gone' }, [3])
    expect(form.getValue('nodes')).toEqual([{ id: 'a', children: [{ id: 'a1' }] }])
    form.insertTree('nodes', [], { id: 'nope' })
    expect(form.getValue('nodes').map((node) => node.id)).toEqual(['a'])
  })

  it('refuses a move into a descendant', () => {
    const form = createEngine<{ nodes: Node[] }>({ initialValues: { nodes: initial() } })
    form.registerTree('nodes', { childrenKey: 'children', rowKey: 'id' })
    const refused = form.moveTree('nodes', [0], [0, 0])
    expect(refused.ok).toBe(false)
    expect(form.getValue('nodes.0.id')).toBe('a')
  })
})
