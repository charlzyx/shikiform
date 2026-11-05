// @vitest-environment happy-dom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CascaderPlusView, SuggestionView } from '../src/antd'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('SuggestionView', () => {
  it('renders the current value and searches remotely on input', async () => {
    const fetch = vi.fn(async (keyword: string) => [{ label: `${keyword}-1`, value: `${keyword}-1` }])
    const onChange = vi.fn()
    render(<SuggestionView value="a" onChange={onChange} fetch={fetch} debounce={10} />)
    // 已选值作为单选项渲染（antd Select 的选中回显）
    expect(screen.queryAllByText('a').length).toBeGreaterThan(0)
    // 打开下拉输入触发远程搜索
    const input = document.querySelector('input.ant-select-selection-search-input') as HTMLInputElement
    fireEvent.mouseDown(input)
    fireEvent.change(input, { target: { value: 'ab' } })
    const option = await screen.findByTitle('ab-1', {}, { timeout: 3000 })
    fireEvent.click(option)
    await waitFor(() => expect(onChange).toHaveBeenCalledWith('ab-1'))
  })

  it('multiple + labelInValue holds { label, value } lists', async () => {
    const onChange = vi.fn()
    render(
      <SuggestionView
        value={[{ label: '甲', value: 'jia' }]}
        onChange={onChange}
        fetch={async () => []}
        multiple
        labelInValue
      />,
    )
    expect(screen.queryAllByText('甲').length).toBeGreaterThan(0)
  })

  it('shows a spinner while loading (notFoundContent)', async () => {
    let resolve!: (rows: { label: string; value: string }[]) => void
    const fetch = vi.fn(() => new Promise<{ label: string; value: string }[]>((r) => (resolve = r)))
    render(<SuggestionView value="" fetch={fetch} debounce={0} />)
    fireEvent.mouseDown(screen.getByRole('combobox'))
    // 输入才触发远程搜索（打开下拉不会）；搜索进行中下拉的 notFoundContent 是一个 Spin
    fireEvent.change(document.querySelector('input.ant-select-selection-search-input')!, { target: { value: 'x' } })
    await waitFor(() => expect(document.querySelector('.ant-select-dropdown .ant-spin')).not.toBeNull())
    resolve([])
  })
})

describe('CascaderPlusView', () => {  type Opt = { label: string; value: string; children?: Opt[] }
  const load = vi.fn(async (path: (string | number)[]): Promise<Opt[]> =>
    path.length === 0 ? [{ label: '浙江', value: 'zj', children: [] }] : [{ label: '杭州', value: 'hz' }],
  )

  it('renders the cascader and loads the root level', async () => {
    render(<CascaderPlusView value={undefined} loadData={load} />)
    await waitFor(() => expect(load).toHaveBeenCalled())
    await waitFor(() => expect(document.querySelector('.ant-cascader')).not.toBeNull())
  })

  it('echoes a bare value by loading its ancestors', async () => {
    render(<CascaderPlusView value={['zj']} loadData={load} />)
    await waitFor(() => expect(load).toHaveBeenCalled())
    // 单选值定位到 antd cascader 的选中回显
    expect(document.querySelector('.ant-cascader')).not.toBeNull()
  })

  it('emits picked values through onChange', async () => {
    const onChange = vi.fn()
    render(<CascaderPlusView value={undefined} onChange={onChange} loadData={load} />)
    await waitFor(() => expect(document.querySelector('.ant-cascader')).not.toBeNull())
    // 打开下拉
    fireEvent.mouseDown(document.querySelector('input.ant-cascader-input, input.ant-select-selection-search-input')!)
    await waitFor(() => expect(document.querySelector('.ant-cascader-dropdown')).not.toBeNull())
    fireEvent.click(screen.getByText('浙江'))
    await waitFor(() => expect(onChange).toHaveBeenCalled())
    expect(onChange.mock.calls[0]![0]).toEqual(['zj'])
  })
})
