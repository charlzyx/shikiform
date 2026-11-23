// @vitest-environment happy-dom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { enumItems, useLazyCascader, useSuggestion, type CascaderOption } from '@shikiform/react'
import { useCascaderLabels, useColumnSettings } from '@shikiform/react/internal'
import { cascaderPaths } from '../packages/react/src/hooks/use-lazy-cascader'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const LIST = [
  { label: '啊', value: 'a' },
  { label: '哦', value: 'o', color: 'success' },
  { label: '呃', value: 'e' },
]

describe('enumItems / prettyType', () => {
  it('resolves labels and colors loosely; an unknown value keeps its own text', () => {
    expect(enumItems(['a', 'o'], LIST).map((item) => [item.label, item.color])).toEqual([
      ['啊', ''],
      ['哦', 'green'],
    ])
    expect(enumItems(['a', 'o'], LIST, { colorful: true }).map((item) => [item.label, item.color])).toEqual([
      ['啊', 'blue'],
      ['哦', 'green'],
    ])
    expect(enumItems(1, [{ label: 'one', value: '1' }])[0]).toMatchObject({ label: 'one', matched: true })
    expect(enumItems('x', LIST)).toEqual([{ value: 'x', label: 'x', color: '', matched: false }])
    expect(enumItems({ label: '外', value: 'w' }, LIST)[0]).toMatchObject({ label: '外', value: 'w' })
  })
})

describe('useSuggestion', () => {
  it('debounces, keeps only the newest answer, and remembers picked labels', async () => {
    vi.useFakeTimers()
    const calls: string[] = []
    const fetch = vi.fn(async (keyword: string) => {
      calls.push(keyword)
      return [{ label: `${keyword}-1`, value: `${keyword}-1` }]
    })
    const { result } = renderHook(() => useSuggestion({ fetch, debounce: 200 }))
    act(() => result.current.search('a'))
    act(() => result.current.search('ab'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(calls).toEqual(['ab'])
    expect(result.current.options.map((option) => option.value)).toEqual(['ab-1'])
    act(() => result.current.remember([{ label: 'ab-1', value: 'ab-1' }]))
    act(() => result.current.search('z'))
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    expect(result.current.options.map((option) => option.value)).toEqual(['z-1', 'ab-1'])
    expect(result.current.labelOf('ab-1')).toBe('ab-1')
  })
})

const AREA: Record<string, CascaderOption[]> = {
  '[]': [
    { label: '北京市', value: '110000', isLeaf: false },
    { label: '河南省', value: '410000', isLeaf: false },
  ],
  '["110000"]': [{ label: '北京市', value: '11000000', isLeaf: false }],
  '["110000","11000000"]': [{ label: '朝阳区', value: '110105', isLeaf: true }],
  '["410000"]': [{ label: '鹤壁市', value: '410600', isLeaf: false }],
  '["410000","410600"]': [{ label: '浚县', value: '410621', isLeaf: true }],
}

describe('useLazyCascader', () => {
  it('loads the root, then each ancestor level of an echoed value', async () => {
    const load = vi.fn(async (path: Array<string | number>) => AREA[JSON.stringify(path)] ?? [])
    const { result } = renderHook(() => useLazyCascader({ load, paths: [['110000', '11000000', '110105']] }))
    await waitFor(() => expect(result.current.labelsOf(['110000', '11000000', '110105'])).toEqual(['北京市', '北京市', '朝阳区']))
    expect(load.mock.calls.map((call) => call[0])).toEqual([[], ['110000'], ['110000', '11000000']])
    await act(() => result.current.loadChildren(['410000']))
    expect(result.current.labelsOf(['410000', '410600'])).toEqual(['河南省', '鹤壁市'])
    await act(() => result.current.loadChildren(['410000']))
    expect(load).toHaveBeenCalledTimes(4)
  })
})

describe('CascaderPlus read-only labels', () => {
  const load = () => vi.fn(async (path: Array<string | number>) => AREA[JSON.stringify(path)] ?? [])

  it('useCascaderLabels resolves bare codes through the loader, and skips loading for labelInValue', async () => {
    const loader = load()
    const { result } = renderHook(() => useCascaderLabels({ value: ['410000', '410600', '410621'], load: loader }))
    await waitFor(() => expect(result.current.labels).toEqual([['河南省', '鹤壁市', '浚县']]))
    expect(result.current.loading).toBe(false)
    const labeledLoader = load()
    const labeled = renderHook(() =>
      useCascaderLabels({ value: [{ label: '北京市', value: '110000' }, { label: '朝阳区', value: '110105' }], load: labeledLoader }),
    )
    expect(labeled.result.current.labels).toEqual([['北京市', '朝阳区']])
    expect(labeledLoader).not.toHaveBeenCalled()
    // No loader: the value is all there is.
    expect(renderHook(() => useCascaderLabels({ value: ['x', 'y'] })).result.current.labels).toEqual([['x', 'y']])
    expect(cascaderPaths([[{ label: 'a', value: 1 }, 2], 'bad'], true)).toEqual([[1, 2]])
  })
})

describe('useColumnSettings drag', () => {
  it('moveKey and dragProps reorder by key', () => {
    const { result } = renderHook(() => useColumnSettings([{ key: 'a' }, { key: 'b' }, { key: 'c' }]))
    act(() => result.current.moveKey('c', 'a'))
    expect(result.current.visibleKeys).toEqual(['c', 'a', 'b'])
    const event = { preventDefault: vi.fn(), dataTransfer: { setData: vi.fn(), effectAllowed: '', dropEffect: '' } }
    act(() => result.current.dragProps('c').onDragStart(event))
    expect(event.dataTransfer.setData).toHaveBeenCalledWith('text/plain', 'c')
    act(() => result.current.dragProps('b').onDragOver(event))
    expect(event.preventDefault).toHaveBeenCalled()
    expect(result.current.drag).toEqual({ from: 'c', over: 'b' })
    act(() => result.current.dragProps('b').onDrop(event))
    expect(result.current.visibleKeys).toEqual(['a', 'b', 'c'])
    expect(result.current.drag).toEqual({ from: null, over: null })
  })
})
