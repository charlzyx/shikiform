import { describe, expect, it } from 'vitest'
import { findPos, getNode, listPositions, locateIds, mapMoveIndex, posKey, samePos } from '../src/core'

type Node = { id: string; name?: string; children?: Node[] }

const TREE: Node[] = [
  { id: 'a', name: 'A', children: [{ id: 'a1', name: 'A1' }, { id: 'a2', name: 'A2' }] },
  { id: 'b', name: 'B' },
]

describe('posKey / samePos', () => {
  it('joins indexes with dots', () => {
    expect(posKey([0, 2])).toBe('0.2')
    expect(posKey([])).toBe('')
    expect(posKey([3])).toBe('3')
  })

  it('samePos compares length and each index', () => {
    expect(samePos([0, 1], [0, 1])).toBe(true)
    expect(samePos([0, 1], [0, 2])).toBe(false)
    expect(samePos([0, 1], [0])).toBe(false)
    expect(samePos([], [])).toBe(true)
  })
})

describe('getNode', () => {
  it('walks the index path', () => {
    expect(getNode(TREE, [0])).toBe(TREE[0])
    expect(getNode(TREE, [0, 1])).toBe(TREE[0]!.children![1])
    expect(getNode(TREE, [])).toBeUndefined()
  })

  it('returns undefined when the path walks off the tree', () => {
    expect(getNode(TREE, [2])).toBeUndefined()
    expect(getNode(TREE, [0, 5])).toBeUndefined()
    expect(getNode(TREE, [0, 0, 0])).toBeUndefined() // 叶子没有 children
    expect(getNode(undefined, [0])).toBeUndefined()
  })
})

describe('findPos', () => {
  it('walks depth-first and finds by predicate', () => {
    expect(findPos(TREE, (node) => node.id === 'b')).toEqual([1])
    expect(findPos(TREE, (node) => node.id === 'a2')).toEqual([0, 1])
    expect(findPos(TREE, (node) => node.id === 'a')).toEqual([0])
  })

  it('returns undefined when nothing matches or the input is not an array', () => {
    expect(findPos(TREE, () => false)).toBeUndefined()
    expect(findPos(undefined, () => true)).toBeUndefined()
    expect(findPos({}, () => true)).toBeUndefined()
  })

  it('supports a custom childrenKey', () => {
    const nodes = [{ id: 'a', kids: [{ id: 'a1' }] }]
    expect(findPos(nodes, (node) => node.id === 'a1', 'kids')).toEqual([0, 0])
  })
})

describe('locateIds', () => {
  it('maps each row id to its data path', () => {
    const map = locateIds(TREE, 'menus', 'children', 'id')
    expect(map.get('a')).toBe('menus.0')
    expect(map.get('a1')).toBe('menus.0.children.0')
    expect(map.get('a2')).toBe('menus.0.children.1')
    expect(map.get('b')).toBe('menus.1')
  })

  it('skips nodes without the key and non-arrays', () => {
    const map = locateIds([{ id: 'x' }, { name: 'no-id' }, null], 'root', 'children', 'id')
    expect(map.size).toBe(1)
    expect(locateIds(undefined, 'root', 'children', 'id').size).toBe(0)
  })
})

describe('listPositions', () => {
  it('lists every node as { id, pos, path }; missing ids fall back to posKey', () => {
    const out = listPositions(TREE, 'menus', 'children', 'id')
    expect(out.map((item) => [item.id, posKey(item.pos), item.path])).toEqual([
      ['a', '0', 'menus.0'],
      ['a1', '0.0', 'menus.0.children.0'],
      ['a2', '0.1', 'menus.0.children.1'],
      ['b', '1', 'menus.1'],
    ])
    const anonymous = listPositions([{ name: 'x' }], 'root', 'children', 'id')
    expect(anonymous[0]).toMatchObject({ id: '0', pos: [0], path: 'root.0' })
    expect(listPositions('not-array', 'root', 'children', 'id')).toEqual([])
  })
})

describe('mapMoveIndex', () => {
  it('final-index semantics for a move', () => {
    // [a, b, c, d] move(1 -> 3) → [a, c, d, b]：b 从 1 到 3；c、d 各前移一位
    expect(mapMoveIndex(1, 1, 3)).toBe(3)
    expect(mapMoveIndex(2, 1, 3)).toBe(1)
    expect(mapMoveIndex(3, 1, 3)).toBe(2)
    expect(mapMoveIndex(0, 1, 3)).toBe(0)
    // [a, b, c, d] move(3 -> 0) → [d, a, b, c]：d 从 3 到 0；a、b、c 各后移一位
    expect(mapMoveIndex(3, 3, 0)).toBe(0)
    expect(mapMoveIndex(0, 3, 0)).toBe(1)
    expect(mapMoveIndex(2, 3, 0)).toBe(3)
    // 不在区间内不变
    expect(mapMoveIndex(5, 1, 3)).toBe(5)
  })
})
