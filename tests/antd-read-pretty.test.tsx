// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { Field, Form, typed, useForm } from '@shikiform/react'
import {
  AutoComplete,
  Cascader,
  Checkbox,
  ColorPicker,
  DatePicker,
  Input,
  InputNumber,
  PreviewText,
  Radio,
  Rate,
  Select,
  Slider,
  Switch,
  TimePicker,
  Transfer,
  TreeSelect,
  Upload,
} from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'

afterEach(cleanup)

const AREA = [
  { label: '浙江', value: 'zj', children: [{ label: '杭州', value: 'hz', children: [{ label: '西湖', value: 'xh' }] }] },
  { label: '江苏', value: 'js', children: [{ label: '南京', value: 'nj' }] },
]
const COLORS = [
  { label: '红', value: 'r', color: 'error' },
  { label: '绿', value: 'g' },
  { label: '蓝', value: 'b' },
]

type Values = {
  text: string
  note: string
  secret: string
  amount: number | null
  one: string
  many: string[]
  on: boolean
  agree: boolean
  checks: string[]
  pick: string
  day: string
  days: [string, string]
  at: string
  hours: [string, string]
  dept: string
  depts: string[]
  area: string[]
  areas: string[][]
  volume: number
  range: [number, number]
  score: number
  users: string[]
  files: { uid: string; name: string; url?: string; status?: 'done' }[]
  city: string
  color: string
}

const VALUES: Values = {
  text: 'Ada',
  note: '第一行\n第二行',
  secret: 'p@ss',
  amount: 1200,
  one: 'g',
  many: ['r', 'b'],
  on: true,
  agree: false,
  checks: ['g'],
  pick: 'b',
  day: '2026-11-02',
  days: ['2026-11-01', '2026-11-03'],
  at: '09:30:00',
  hours: ['08:00', '18:00'],
  dept: 'hz',
  depts: ['xh', 'nj'],
  area: ['zj', 'hz', 'xh'],
  areas: [['zj', 'hz'], ['js', 'nj']],
  volume: 30,
  range: [10, 40],
  score: 3,
  users: ['r'],
  files: [{ uid: '1', name: 'a.png', url: 'https://cdn.example.com/a.png', status: 'done' }],
  city: '杭州',
  color: '#1677ff',
}

function mount(values: Partial<Values> = VALUES, messages?: { empty: string }) {
  let form!: FormInstance<Values>
  function App() {
    form = useForm<Values>({ initialValues: values as Values, pattern: 'readPretty', messages })
    const F = typed(form)
    return (
      <Form form={form}>
        <F.Field name="text" component={[Input, { addonBefore: 'Name:', placeholder: '请输入' }]} />
        <F.Field name="note" component={[Input.TextArea]} />
        <F.Field name="secret" component={[Input.Password]} />
        <F.Field name="amount" component={[InputNumber, { formatter: (v) => `¥ ${v}` }]} />
        <F.Field name="one" enum={COLORS} component={[Select]} />
        <F.Field name="many" enum={COLORS} component={[Select, { mode: 'multiple' }]} />
        <F.Field name="on" component={[Switch]} />
        <F.Field name="agree" component={[Checkbox]} />
        <F.Field name="checks" enum={COLORS} component={[Checkbox.Group]} />
        <F.Field name="pick" enum={COLORS} component={[Radio]} />
        <F.Field name="day" component={[DatePicker]} />
        <F.Field name="days" component={[DatePicker.RangePicker]} />
        <F.Field name="at" component={[TimePicker]} />
        <F.Field name="hours" component={[TimePicker.RangePicker, { format: 'HH:mm' }]} />
        <F.Field name="dept" enum={AREA} component={[TreeSelect]} />
        <F.Field name="depts" enum={AREA} component={[TreeSelect, { multiple: true }]} />
        <F.Field name="area" enum={AREA} component={[Cascader]} />
        <Field name="areas" enum={AREA} component={[Cascader, { multiple: true }]} />
        <F.Field name="volume" component={[Slider]} />
        <F.Field name="range" component={[Slider, { range: true }]} />
        <F.Field name="score" component={[Rate]} />
        <F.Field name="users" enum={COLORS} component={[Transfer]} />
        <F.Field name="files" component={[Upload]} />
        <F.Field name="city" component={[AutoComplete]} />
        <F.Field name="color" component={[ColorPicker]} />
      </Form>
    )
  }
  const view = render(<App />)
  const at = (path: string) => view.container.querySelector(`[data-path="${path}"]`) ?? view.container.querySelectorAll('[data-read-pretty]')[ORDER.indexOf(path)]!
  return { view, form: () => form, text: (path: string) => at(path)?.textContent, el: at }
}

const ORDER = ['text', 'note', 'secret', 'amount', 'one', 'many', 'on', 'agree', 'checks', 'pick', 'day', 'days', 'at', 'hours', 'dept', 'depts', 'area', 'areas', 'volume', 'range', 'score', 'users', 'files', 'city', 'color']

describe('readPretty: every control has a read view (root pattern inherited via useForm({ pattern }))', () => {
  it('no control renders an input; each field renders exactly one read view', () => {
    const { view } = mount()
    expect(view.container.querySelectorAll('input, textarea, button[role="switch"]').length).toBe(0)
    expect(view.container.querySelectorAll('[data-read-pretty]').length).toBe(ORDER.length)
  })

  it('text controls: addons, line breaks, masked password, number formatter', () => {
    const { text, el } = mount()
    expect(text('text')).toBe('Name:Ada')
    expect(text('note')).toBe('第一行\n第二行')
    expect((el('note') as HTMLElement).style.whiteSpace).toBe('pre-wrap')
    expect(text('secret')).toBe('******')
    expect(text('amount')).toBe('¥ 1200')
    expect(text('city')).toBe('杭州')
  })

  it('choices show labels from the enum; several values are tags', () => {
    const { text, el } = mount()
    expect(text('one')).toBe('绿')
    expect([...el('many').querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['红', '蓝'])
    expect([...el('checks').querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['绿'])
    expect(text('pick')).toBe('蓝')
    expect(text('on')).toBe('是')
    expect(text('agree')).toBe('否')
    expect([...el('users').querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['红'])
  })

  it('tree / cascader values resolve labels through the tree', () => {
    const { text, el } = mount()
    expect(text('dept')).toBe('杭州')
    expect([...el('depts').querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['西湖', '南京'])
    expect(text('area')).toBe('浙江 / 杭州 / 西湖')
    expect([...el('areas').querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['浙江 / 杭州', '江苏 / 南京'])
  })

  it('dates and times keep their formatted text; ranges join with ~', () => {
    const { text } = mount()
    expect(text('day')).toBe('2026-11-02')
    expect(text('days')).toBe('2026-11-01 ~ 2026-11-03')
    expect(text('at')).toBe('09:30:00')
    expect(text('hours')).toBe('08:00 ~ 18:00')
  })

  it('slider, rate, upload and color picker', () => {
    const { text, el } = mount()
    expect(text('volume')).toBe('30')
    expect(text('range')).toBe('10 ~ 40')
    expect(el('score').querySelectorAll('.ant-rate-disabled').length).toBe(1)
    expect(el('score').querySelectorAll('.ant-rate-star-full').length).toBe(3)
    expect(el('files').querySelector('a')?.getAttribute('href')).toBe('https://cdn.example.com/a.png')
    expect(el('files').textContent).toBe('a.png')
    expect(text('color')).toBe('#1677ff')
  })

  it('empty values show messages.empty everywhere (default `-`, one setting per form)', () => {
    const empty: Partial<Values> = { amount: null, many: [], days: undefined, files: [], areas: [] }
    const one = mount(empty)
    const skip = new Set(['on', 'agree', 'score'])
    for (const path of ORDER) if (!skip.has(path)) expect([path, one.text(path)]).toEqual([path, '-'])
    expect(one.text('on')).toBe('否')
    one.view.unmount()
    const custom = mount(empty, { empty: 'N/A' })
    expect(custom.text('text')).toBe('N/A')
    expect(custom.text('files')).toBe('N/A')
  })

  it('switching the root pattern back to editable restores the controls', () => {
    const { view, form } = mount()
    act(() => form().batch((d) => { d.$pattern = 'editable' }))
    expect(view.container.querySelectorAll('[data-read-pretty]').length).toBe(0)
    expect(view.container.querySelectorAll('input').length).toBeGreaterThan(10)
  })
})

describe('PreviewText views as pure components', () => {
  it('Select: unknown values show themselves, labelInValue items their label, prettyType colors', () => {
    const { container, rerender } = render(<PreviewText.Select value={['r', 'x', { label: '外', value: 'w' }]} options={COLORS} />)
    expect([...container.querySelectorAll('.ant-tag')].map((n) => n.textContent)).toEqual(['红', 'x', '外'])
    rerender(<PreviewText.Select value="r" options={COLORS} prettyType="tag" />)
    expect(container.querySelector('.ant-tag-red, .ant-tag')?.className).toContain('red')
    rerender(<PreviewText.Select value={1} options={[{ label: '一', value: '1' }]} />)
    expect(container.textContent).toBe('一')
  })

  it('TreeSelect honours fieldNames / treeData; Cascader takes labelInValue paths', () => {
    const tree = [{ name: '根', id: 1, kids: [{ name: '叶', id: 2 }] }]
    const { container, rerender } = render(<PreviewText.TreeSelect value={2} treeData={tree} fieldNames={{ label: 'name', value: 'id', children: 'kids' }} />)
    expect(container.textContent).toBe('叶')
    rerender(<PreviewText.Cascader value={[{ label: '甲', value: 'a' }, { label: '乙', value: 'b' }]} />)
    expect(container.textContent).toBe('甲 / 乙')
  })

  it('a per-view `empty` wins over messages.empty', () => {
    const { container } = render(<PreviewText.DatePicker value="" empty="无" />)
    expect(container.textContent).toBe('无')
  })
})
