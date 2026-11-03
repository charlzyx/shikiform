// @vitest-environment happy-dom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { MergedTable, groupRowSpan } from '../src/antd/tables/merged-table'

afterEach(cleanup)

type Row = { id: string; group: string; text: string }

describe('groupRowSpan', () => {
  it('consecutive rows with the same key share one span (first = n, rest = 0)', () => {
    const rows: Row[] = [
      { id: 'a', group: 'A', text: 'a' },
      { id: 'b', group: 'A', text: 'b' },
      { id: 'c', group: 'B', text: 'c' },
      { id: 'd', group: 'A', text: 'd' },
    ]
    expect(groupRowSpan(rows, (row) => row.group)).toEqual([2, 0, 1, 1])
  })

  it('an empty list has no spans; a single row spans 1', () => {
    expect(groupRowSpan([], () => 'x')).toEqual([])
    expect(groupRowSpan([{ id: 'a', group: 'A', text: 'a' }], (row) => row.group)).toEqual([1])
  })

  it('one group over every row spans the whole table; empty-string keys still group', () => {
    const rows: Row[] = [
      { id: 'a', group: '', text: 'a' },
      { id: 'b', group: '', text: 'b' },
    ]
    expect(groupRowSpan(rows, (row) => row.group)).toEqual([2, 0])
  })

  it('boundary rows: the last row of a group is always 0', () => {
    const rows: Row[] = [
      { id: 'a', group: 'A', text: 'a' },
      { id: 'b', group: 'B', text: 'b' },
    ]
    expect(groupRowSpan(rows, (row) => row.group)).toEqual([1, 1])
  })
})

describe('MergedTable', () => {
  const rows: Row[] = [
    { id: 'a', group: 'A', text: 'a1' },
    { id: 'b', group: 'A', text: 'a2' },
    { id: 'c', group: 'B', text: 'b1' },
  ]

  it('renders one row per row and applies rowSpan only to the merge column', () => {
    const { container } = render(
      <MergedTable<Row>
        rows={rows}
        groupOf={(row) => row.group}
        columns={[
          { title: '组', key: 'group', merge: true, render: (row) => row.group },
          { title: '内容', key: 'text', render: (row) => row.text },
        ]}
      />,
    )
    // 组列：A 合并两行（rowSpan=2，第二行的组单元格被吞掉），B 独占一行；内容列不合并
    const trs = [...container.querySelectorAll('.ant-table-tbody > tr')]
    expect(trs[0]!.querySelector('td')!.getAttribute('rowspan')).toBe('2')
    expect(trs[0]!.querySelectorAll('td')).toHaveLength(2)
    expect(trs[1]!.querySelector('td')!.getAttribute('rowspan')).toBeNull() // A 组第二行只剩内容列
    expect(trs[1]!.querySelectorAll('td')).toHaveLength(1)
    // rowSpan=1 时 antd 不输出 rowspan 属性（默认值）
    expect(trs[2]!.querySelector('td')!.getAttribute('rowspan')).toBeNull()
    const textCells = [...container.querySelectorAll('.ant-table-tbody td')]
    expect(textCells.map((td) => td.textContent)).toEqual(['A', 'a1', 'a2', 'B', 'b1'])
  })

  it('supports a custom rowKey function', () => {
    const { container } = render(
      <MergedTable<Row>
        rows={rows}
        groupOf={(row) => row.group}
        rowKey={(row) => `k-${row.id}`}
        columns={[{ title: '内容', key: 'text', render: (row) => row.text }]}
      />,
    )
    expect([...container.querySelectorAll('tr[data-row-key]')].map((tr) => tr.getAttribute('data-row-key'))).toEqual([
      'k-a',
      'k-b',
      'k-c',
    ])
  })

  it('renders nothing but the table when rows is empty', () => {
    const { container } = render(
      <MergedTable<Row> rows={[]} groupOf={(row) => row.group} columns={[{ title: '组', key: 'g', merge: true, render: (row) => row.group }]} />,
    )
    expect(container.querySelector('.ant-table-tbody')).not.toBeNull()
    // 空数据只有 antd 的占位行（measure row / empty），没有数据行
    expect(container.querySelectorAll('.ant-table-tbody tr[data-row-key]')).toHaveLength(0)
  })
})
