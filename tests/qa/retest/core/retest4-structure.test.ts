import { createForm } from '@shikiform/core'
import { engineOf } from '@shikiform/core/internal'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

afterEach(() => vi.unstubAllEnvs())

describe.each(['development', 'production'])('F7 structure variants in %s', (mode) => {
  beforeEach(() => vi.stubEnv('NODE_ENV', mode))

  it('QA-65 applies direct scalar writes to anonymous records through sort and insertion', async () => {
    const form = createForm({ initialValues: { box: { rows: [{ meta: { rank: 1 } }, { meta: { rank: 2 } }] } } })
    form.batch((d) => {
      d.box.rows[0].meta.rank.$value = 3
      d.box.$value.rows.sort((a, b) => a.meta.rank - b.meta.rank)
      d.box.rows.$value.unshift({ meta: { rank: 0 } })
      d.box.rows[1].meta.rank.$value = 4
    })
    await expect(form.submit()).resolves.toEqual({ box: { rows: [0, 4, 3].map((rank) => ({ meta: { rank } })) } })
  })

  it('QA-65 distinguishes a deleted primitive row from an explicit undefined slot', () => {
    const form = createForm({ initialValues: { rows: [1, undefined, 3] as (number | undefined)[] } })
    form.batch((d) => {
      d.rows[0].$value = 9
      d.rows.$value.reverse()
      delete d.rows.$value[2]
      d.rows[0].$value = 8
    })
    expect(form.getSubmitValues().rows).toStrictEqual([8, undefined, ,])
    form.reset()
    expect(form.getValue('rows')).toStrictEqual([1, undefined, 3])
  })

  it('QA-66 preserves anonymous row identity and nested edits through a handle swap', async () => {
    const form = createForm({ initialValues: { rows: [{ nested: { tags: ['a'] } }, { nested: { tags: ['b'] } }] } })
    const engine = engineOf(form)
    const [a, b] = engine.structureKeys('rows').map(({ key }) => key)
    form.batch((d) => {
      d.rows.$value[0].nested.tags.splice(0, 1, 'A')
      engine.swapArray('rows', 0, 1)
      d.rows[1].nested.tags.$value.push('saved')
      expect(form.getValue('rows.1.nested.tags')).toEqual(['A', 'saved'])
    })
    expect(engine.structureKeys('rows').map(({ key }) => key)).toEqual([b, a])
    await expect(form.submit()).resolves.toEqual({ rows: [{ nested: { tags: ['b'] } }, { nested: { tags: ['A', 'saved'] } }] })
  })

  it('QA-66 moves a row inserted by an earlier array-handle edit in the same batch', async () => {
    const form = createForm({ initialValues: { rows: [{ id: 'a', items: [1] }, { id: 'b', items: [2] }] } })
    const engine = engineOf(form)
    form.batch((d) => {
      engine.insertArray('rows', 1, { id: 'new', items: [3] })
      d.rows[1].items.$value.push(4)
      engine.moveArray('rows', 1, 0)
      engine.removeArray('rows', 2)
    })
    await expect(form.submit()).resolves.toEqual({ rows: [{ id: 'new', items: [3, 4] }, { id: 'a', items: [1] }] })
  })

  it('QA-17 composes writes through root and leaf drafts over a sparse tuple list', async () => {
    type Pair = [string, number]
    const form = createForm({ initialValues: { box: { lines: [['a', 1], , ['c', 3]] as Pair[] } } })
    form.batch((d) => {
      const lines = d.$value.box.lines
      lines[2][1] = 30
      d.box.lines.$value.reverse()
      lines.push(['d', 4])
      lines[0][0] = 'C'
      expect(form.getValue('box.lines')).toStrictEqual([['C', 30], , ['a', 1], ['d', 4]])
    })
    await expect(form.submit()).resolves.toStrictEqual({ box: { lines: [['C', 30], , ['a', 1], ['d', 4]] } })
  })

  it('QA-17 composes nested edits after a whole-parent replacement inside a child batch', () => {
    const form = createForm({ initialValues: { order: { groups: [{ items: [1] }] } } })
    form.batch((d) => {
      d.order.$value = { groups: [{ items: [10] }, { items: [20] }] }
      form.batch((inner) => {
        inner.order.$value.groups[1].items.push(21)
        inner.order.groups[1].items.$value.unshift(19)
        inner.order.$value.groups.reverse()
      })
      d.order.$value.groups[0].items.pop()
      expect(form.getValue('order.groups.0.items')).toEqual([19, 20])
    })
    expect(form.getSubmitValues()).toEqual({ order: { groups: [{ items: [19, 20] }, { items: [10] }] } })
    form.reset('order')
    expect(form.getValue('order')).toEqual({ groups: [{ items: [1] }] })
  })

  type Node = { key: string; parts: { qty: number }[]; kids: Node[] }
  const node = (key: string, quantities: number[], kids: Node[] = []): Node => ({
    key, parts: quantities.map((qty) => ({ qty })), kids,
  })
  const makeForest = () => createForm({
    initialValues: { data: { forest: [node('left', [1], [node('child', [3, 5]), node('sibling', [7])]), node('right', [2])] } },
    trees: { 'data.forest': { rowKey: 'key', childrenKey: 'kids' } },
  })

  it('QA-67 keeps an edited primitive leaf through tree insertion and a sort by that edit', async () => {
    const form = makeForest()
    const engine = engineOf(form)
    form.batch((d) => {
      d.data.forest[0].kids[0].parts[0].qty.$value = 9
      engine.insertTree('data.forest', [0, 0], node('new', [4]))
      d.data.forest[0].kids[1].parts.$value.sort((a, b) => a.qty - b.qty)
      d.data.forest[0].kids[1].parts.$value.push({ qty: 12 })
    })
    await expect(form.submit()).resolves.toEqual({
      data: { forest: [node('left', [1], [node('new', [4]), node('child', [5, 9, 12]), node('sibling', [7])]), node('right', [2])] },
    })
  })

  it('QA-67 carries two anonymous part edits through a cross-parent move and replacement of a sibling', async () => {
    const form = makeForest()
    const engine = engineOf(form)
    form.batch((d) => {
      const parts = d.data.forest[0].kids[0].parts.$value
      parts[1].qty = 8
      expect(engine.moveTree('data.forest', [0, 0], [1, 0]).ok).toBe(true)
      engine.replaceTree('data.forest', [0, 0], node('replacement', [6]))
      d.data.forest[1].kids[0].parts.$value.reverse()
      d.data.forest[1].kids[0].parts[1].qty.$value = 4
    })
    await expect(form.submit()).resolves.toEqual({
      data: { forest: [node('left', [1], [node('replacement', [6])]), node('right', [2], [node('child', [8, 4])])] },
    })
  })

  it('QA-62 reads two child-list edits at their final coordinates after a cross-parent move', async () => {
    const form = makeForest()
    const engine = engineOf(form)
    form.batch((d) => {
      d.data.$value.forest[0].kids[0].parts.splice(0, 1, { qty: 13 })
      d.data.forest[0].kids[1].parts.$value.push({ qty: 17 })
      expect(engine.moveTree('data.forest', [0, 0], [1, 0]).ok).toBe(true)
      expect(form.getValue('data.forest.0.kids.0.parts')).toEqual([{ qty: 7 }, { qty: 17 }])
      expect(form.getValue('data.forest.1.kids.0.parts')).toEqual([{ qty: 13 }, { qty: 5 }])
      engine.removeTree('data.forest', [0])
    })
    await expect(form.submit()).resolves.toEqual({ data: { forest: [node('right', [2], [node('child', [13, 5])])] } })
  })

  it('QA-62 recovers cross-parent edits after a declined move and a scoped reset', () => {
    const form = makeForest()
    const engine = engineOf(form)
    form.batch((d) => {
      d.data.forest[0].kids[0].parts.$value.push({ qty: 8 })
      expect(engine.moveTree('data.forest', [0], [0, 0, 0]).ok).toBe(false)
      expect(engine.moveTree('data.forest', [0, 0], [1, 0]).ok).toBe(true)
      d.data.forest[1].kids[0].parts.$value.unshift({ qty: 0 })
    })
    expect(form.getSubmitValues().data.forest[1].kids).toEqual([node('child', [0, 3, 5, 8])])
    expect(form.dirty).toBe(true)
    form.reset('data')
    expect(form.getSubmitValues()).toEqual(makeForest().getSubmitValues())
    expect(form.dirty).toBe(false)
  })
})
