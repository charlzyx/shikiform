// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Record the props each new Ant Design control receives; connect, FormItem and the engine are real.
const seen = vi.hoisted(() => ({} as Record<string, any>))
vi.mock('antd', async (importOriginal) => {
  const actual = await importOriginal<typeof import('antd')>()
  const spy = (name: string) =>
    function Recorder(props: any) {
      seen[name] = props
      return null
    }
  return {
    ...actual,
    TreeSelect: spy('TreeSelect'),
    Cascader: spy('Cascader'),
    Transfer: spy('Transfer'),
    Slider: spy('Slider'),
    Rate: spy('Rate'),
    AutoComplete: spy('AutoComplete'),
    ColorPicker: spy('ColorPicker'),
    TimePicker: Object.assign(spy('TimePicker'), { RangePicker: spy('TimeRangePicker') }),
    Upload: Object.assign(spy('Upload'), { Dragger: spy('Dragger') }),
  }
})
import { Field, Form, typed, useForm } from '@shikiform/react'
import { AutoComplete, Cascader, ColorPicker, FormItem, Rate, Slider, TimePicker, Transfer, TreeSelect, Upload } from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'

afterEach(() => {
  cleanup()
  for (const key of Object.keys(seen)) delete seen[key]
})

const AREA = [
  { label: '浙江', value: 'zj', children: [{ label: '杭州', value: 'hz', children: [{ label: '西湖', value: 'xh' }] }] },
  { label: '江苏', value: 'js', children: [{ label: '南京', value: 'nj' }] },
]

function mount<T extends object>(initialValues: T, field: (F: ReturnType<typeof typed<T>>) => React.ReactNode) {
  let form!: FormInstance<T>
  function App() {
    form = useForm<T>({ initialValues })
    return <Form form={form}>{field(typed(form))}</Form>
  }
  render(<App />)
  return () => form
}

describe('new controls: options from the field enum, value ↔ props, onChange → value', () => {
  it('TreeSelect: tree enum → treeData (children kept), value written as given', () => {
    const form = mount({ dept: undefined as string | undefined }, (F) => (
      <F.Field name="dept" title="部门" enum={AREA} decorator={[FormItem]} component={[TreeSelect]} />
    ))
    expect(seen.TreeSelect.treeData[0]).toMatchObject({ label: '浙江', value: 'zj', children: [{ label: '杭州', value: 'hz' }] })
    expect(seen.TreeSelect.treeData[0].children[0].children[0]).toMatchObject({ label: '西湖', value: 'xh' })
    expect(seen.TreeSelect.disabled).toBe(false)
    act(() => seen.TreeSelect.onChange('hz', ['杭州']))
    expect(form().getValue('dept')).toBe('hz')
    expect(seen.TreeSelect.value).toBe('hz')
    expect('prettyType' in seen.TreeSelect).toBe(false)
  })

  it('Cascader: tree enum → options, the path is the value; readOnly → disabled', () => {
    const form = mount({ area: [] as string[] }, (F) => (
      <F.Field name="area" enum={AREA} disabled decorator={[FormItem]} component={[Cascader]} />
    ))
    expect(seen.Cascader.options[1]).toMatchObject({ label: '江苏', value: 'js', children: [{ label: '南京', value: 'nj' }] })
    expect(seen.Cascader.disabled).toBe(true)
    act(() => seen.Cascader.onChange(['zj', 'hz'], []))
    expect(form().getValue('area')).toEqual(['zj', 'hz'])
  })

  it('Transfer: enum → dataSource { key, title }, value ↔ targetKeys (never undefined)', () => {
    const form = mount({ users: undefined as string[] | undefined }, (F) => (
      <F.Field name="users" enum={[{ label: '甲', value: 'a' }, { label: '乙', value: 'b', disabled: true }]} component={[Transfer]} />
    ))
    expect(seen.Transfer.dataSource).toEqual([
      { label: '甲', value: 'a', disabled: undefined, key: 'a', title: '甲' },
      { label: '乙', value: 'b', disabled: true, key: 'b', title: '乙' },
    ])
    expect(seen.Transfer.targetKeys).toEqual([])
    expect(seen.Transfer.render({ title: 'x' })).toBe('x')
    act(() => seen.Transfer.onChange(['a'], 'right', ['a']))
    expect(form().getValue('users')).toEqual(['a'])
    expect(seen.Transfer.targetKeys).toEqual(['a'])
  })

  it('Upload / Upload.Dragger: fileList ↔ value; onChange({ fileList }) drops xhr and fills url from the response', () => {
    const form = mount({ files: [] as any[], drop: undefined as any }, (F) => (
      <>
        <F.Field name="files" component={[Upload, { action: '/upload' }]} />
        <F.Field name="drop" component={[Upload.Dragger]} />
      </>
    ))
    expect(seen.Upload.fileList).toEqual([])
    expect(seen.Dragger.fileList).toEqual([])
    const done = { uid: '1', name: 'a.png', status: 'done', response: { url: 'https://cdn/a.png' }, xhr: {} }
    act(() => seen.Upload.onChange({ file: done, fileList: [done] }))
    expect(form().getValue('files')).toEqual([{ uid: '1', name: 'a.png', status: 'done', response: { url: 'https://cdn/a.png' }, url: 'https://cdn/a.png' }])
    expect(seen.Upload.fileList).toHaveLength(1)
    expect('status' in seen.Upload && seen.Upload.status).toBe(false)
    act(() => seen.Dragger.onChange({ file: { uid: '2', name: 'b' }, fileList: [{ uid: '2', name: 'b', url: 'keep' }] }))
    expect(form().getValue('drop')).toEqual([{ uid: '2', name: 'b', url: 'keep' }])
  })

  it('TimePicker / RangePicker: the field holds the formatted text; the picker gets dayjs', () => {
    const form = mount({ at: '09:30:00', span: ['08:00', '18:00'] as [string, string] }, (F) => (
      <>
        <F.Field name="at" component={[TimePicker]} />
        <F.Field name="span" component={[TimePicker.RangePicker, { format: 'HH:mm' }]} />
      </>
    ))
    expect(seen.TimePicker.value.format('HH:mm:ss')).toBe('09:30:00')
    expect(seen.TimeRangePicker.value.map((d: any) => d.format('HH:mm'))).toEqual(['08:00', '18:00'])
    act(() => seen.TimePicker.onChange({}, '10:00:00'))
    expect(form().getValue('at')).toBe('10:00:00')
    act(() => seen.TimePicker.onChange(null, ''))
    expect(form().getValue('at')).toBeUndefined()
    act(() => seen.TimeRangePicker.onChange([{}, {}], ['07:00', '19:00']))
    expect(form().getValue('span')).toEqual(['07:00', '19:00'])
  })

  it('Slider / Rate / AutoComplete / ColorPicker map value, disabled and options', () => {
    const form = mount({ volume: 30, score: 3, city: '', color: '#1677ff' }, (F) => (
      <>
        <F.Field name="volume" disabled component={[Slider]} />
        <F.Field name="score" component={[Rate]} />
        <F.Field name="city" enum={['杭州', '南京']} component={[AutoComplete]} />
        <F.Field name="color" component={[ColorPicker]} />
      </>
    ))
    expect(seen.Slider).toMatchObject({ value: 30, disabled: true })
    expect('status' in seen.Slider).toBe(false)
    act(() => seen.Rate.onChange(4))
    expect(form().getValue('score')).toBe(4)
    expect(seen.AutoComplete.options).toEqual([{ label: '杭州', value: '杭州', disabled: undefined }, { label: '南京', value: '南京', disabled: undefined }])
    act(() => seen.AutoComplete.onChange('杭'))
    expect(form().getValue('city')).toBe('杭')
    expect(seen.ColorPicker.value).toBe('#1677ff')
    act(() => seen.ColorPicker.onChange({ cleared: false }, '#ff0000'))
    expect(form().getValue('color')).toBe('#ff0000')
    act(() => seen.ColorPicker.onChange({ cleared: true }, ''))
    expect(form().getValue('color')).toBeUndefined()
  })
})
