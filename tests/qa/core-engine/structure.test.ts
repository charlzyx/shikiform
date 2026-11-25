import { defineEffects } from '@shikiform/core'
import { expect, it, vi } from 'vitest'
import { createEngine } from '../../../packages/core/src/engine/create'

type Node = { id: string; name: string; children: Node[] }

it('keeps exact declarations at their position and restores templates after insert and remove', () => {
  type Values = { rows: { id: string; name: string }[] }
  const form = createEngine<Values>({
    initialValues: { rows: [{ id: 'a', name: 'Ada' }, { id: 'b', name: 'Lin' }] },
    fields: {
      'rows.0.name': { title: 'First row' },
      'rows.*.name': { title: 'Any row', required: true },
    },
  })
  form.binding('rows.0.name').onBlur()
  form.insertArray('rows', 0, { id: 'c', name: 'Grace' })
  form.swapArray('rows', 1, 2)

  expect(form.values.rows.map((row) => row.id)).toEqual(['c', 'b', 'a'])
  expect(form.binding('rows.0.name')).toMatchObject({ title: 'First row', required: true, touched: false })
  expect(form.binding('rows.2.name')).toMatchObject({ title: 'Any row', required: true, touched: true })
  form.removeArray('rows', 0)
  expect(form.binding('rows.0.name')).toMatchObject({ value: 'Lin', title: 'First row', required: true })
  expect(form.binding('rows.1.name')).toMatchObject({ value: 'Ada', title: 'Any row', touched: true })
})

it('refuses a descendant tree move without notifying and preserves node state through neighboring edits', () => {
  const form = createEngine<{ nodes: Node[] }>({
    initialValues: { nodes: [{ id: 'a', name: 'Ada', children: [{ id: 'b', name: 'Lin', children: [] }] }] },
    trees: { nodes: { rowKey: 'id' } },
  })
  const before = form.getSubmitValues()
  form.binding('nodes.0.children.0.name').onBlur()
  const changed = vi.fn()
  const stop = form.subscribeStructure('nodes', changed)

  expect(form.moveTree('nodes', [0], [0, 0, 0]).ok).toBe(false)
  expect(form.getSubmitValues()).toEqual(before)
  expect(changed).not.toHaveBeenCalled()

  form.insertTree('nodes', [0, 0], { id: 'c', name: 'Grace', children: [] })
  expect(form.binding('nodes.0.children.1.name')).toMatchObject({ value: 'Lin', touched: true })
  form.removeTree('nodes', [0, 0])
  expect(form.getSubmitValues()).toEqual(before)
  expect(form.binding('nodes.0.children.0.name')).toMatchObject({ value: 'Lin', touched: true })
  expect(changed).toHaveBeenCalledTimes(2)
  stop()
})

it.fails('BUG: QA-23 leaves a fixed descendant reaction stale after a tree move', () => {
  type Values = { nodes: Node[]; firstChild: string }
  const form = createEngine<Values>({
    initialValues: {
      nodes: [{ id: 'a', name: 'Ada', children: [{ id: 'b', name: 'Lin', children: [] }] }],
      firstChild: '',
    },
    trees: { nodes: { rowKey: 'id' } },
    effects: [defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.firstChild.$value = d.nodes[0].children[0].name.$value ?? '' })
    })],
  })
  expect(form.values.firstChild).toBe('Lin')

  expect(form.moveTree('nodes', [0, 0], [1]).ok).toBe(true)

  expect(form.values.firstChild).toBe('')
})
