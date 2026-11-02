// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { ArrayField, defineEffects, EnumSource, Field, Form, typed, useField, useForm, type FieldEnum } from '../src'
import type { FormEngine } from '../src/core'
import { Checkbox, EnumPretty, Radio, Select } from '../src/antd'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Values = { level: string; tags: string[]; n: number }
const LEVELS = [{ label: '黄金', value: 'gold' }, { label: '白银', value: 'silver' }]

describe('<Field enum>', () => {
  it('inline options reach the binding on the first render and `$enum` reads them', () => {
    let form!: FormEngine<Values>
    let seen: unknown
    function App() {
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 } })
      return (
        <Form form={form}>
          <Field name="level" enum={LEVELS}>{(field) => <span>{field.options.map((o) => o.label).join('/')}</span>}</Field>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('黄金/白银')
    form.batch((d) => { seen = d.level.$enum })
    expect(seen).toEqual(LEVELS)
  })

  it('bare primitives become { label: String(v), value: v }', () => {
    function App() {
      const form = useForm<Values>({ initialValues: { level: '', tags: [], n: 2 } })
      return (
        <Form form={form}>
          <Field name="n" enum={[1, 2, 3]} component={[EnumPretty]} />
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('2')
  })

  it('JSX enum wins over fields.x.enum; unmount restores the declaration; a reaction $enum wins over JSX', async () => {
    let form!: FormEngine<Values>
    let setShow!: (on: boolean) => void
    const opts = () => form.binding('level').options.map((o) => o.label)
    function App() {
      const [show, set] = useState(true)
      setShow = set
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 }, fields: { level: { enum: [{ label: '声明', value: 'gold' }] } } })
      return <Form form={form}>{show ? <Field name="level" enum={LEVELS} component={[EnumPretty]} /> : null}</Form>
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('黄金')
    await act(async () => setShow(false))
    expect(opts()).toEqual(['声明'])
    await act(async () => setShow(true))
    expect(opts()).toEqual(['黄金', '白银'])
    await act(async () => form.batch((d) => { d.level.$enum = [{ label: '联动', value: 'gold' }] }))
    expect(view.container.textContent).toBe('联动')
  })

  it('changing the prop re-applies it (deep compare: an inline array each render is a no-op)', async () => {
    let form!: FormEngine<Values>
    let setKind!: (k: 'a' | 'b') => void
    let renders = 0
    function App() {
      const [kind, set] = useState<'a' | 'b'>('a')
      setKind = set
      form = useForm<Values>({ initialValues: { level: 'x', tags: [], n: 1 } })
      return (
        <Form form={form}>
          <Field name="level" enum={kind === 'a' ? [{ label: 'A', value: 'x' }] : [{ label: 'B', value: 'x' }]}>
            {(field) => { renders++; return <span>{field.options[0]?.label}</span> }}
          </Field>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('A')
    const before = renders
    await act(async () => form.setValue('n', 2))
    expect(renders).toBe(before)
    await act(async () => setKind('b'))
    expect(view.container.textContent).toBe('B')
  })

  it('an update follows enumPolicy "clear"; the first mount does not clear', async () => {
    let form!: FormEngine<Values>
    let setList!: (l: string[]) => void
    function App() {
      const [list, set] = useState(['a', 'b'])
      setList = set
      form = useForm<Values>({ initialValues: { level: 'z', tags: [], n: 1 }, enumPolicy: 'clear' })
      return <Form form={form}><Field name="level" enum={list} /></Form>
    }
    render(<App />)
    await settle()
    expect(form.getValue('level')).toBe('z')
    await act(async () => form.setValue('level', 'a'))
    await act(async () => setList(['b']))
    expect(form.getValue('level')).toBeUndefined()
  })

  it('reactions that read $enum see the JSX enum', async () => {
    let form!: FormEngine<Values>
    const effects = defineEffects<Values>(({ reaction }) => {
      reaction((d) => { d.n.$value = d.level.$enum.length })
    })
    function App() {
      form = useForm<Values>({ initialValues: { level: '', tags: [], n: 0 }, effects: [effects] })
      return <Form form={form}><Field name="level" enum={['a', 'b', 'c']} /></Form>
    }
    render(<App />)
    await settle()
    expect(form.getValue('n')).toBe(3)
  })

  it('accepts EnumSource.with(params) and shows loading until it resolves', async () => {
    const source = EnumSource.from(async (q: string) => [{ label: `远程-${q}`, value: 'gold' }])
    function App() {
      const form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 } })
      return (
        <Form form={form}>
          <Field name="level" enum={source.with('x')}>{(field) => <span>{field.loading ? '…' : field.options[0]?.label}</span>}</Field>
        </Form>
      )
    }
    const view = render(<App />)
    await settle()
    expect(view.container.textContent).toBe('远程-x')
  })

  it('survives StrictMode (setup / cleanup / setup) and useField(name, { enum })', async () => {
    function Level() {
      const field = useField('level', { enum: LEVELS })
      return <span>{field.options.length}</span>
    }
    function App() {
      const form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 } })
      return <Form form={form}><Level /></Form>
    }
    const view = render(<StrictMode><App /></StrictMode>)
    await settle()
    expect(view.container.textContent).toBe('2')
  })

  it('rows: row.Field enum stays with its row when rows move', async () => {
    type Rows = { rows: { id: string; s: number }[] }
    let form!: FormEngine<Rows>
    function App() {
      form = useForm<Rows>({ initialValues: { rows: [{ id: 'a', s: 1 }, { id: 'b', s: 1 }] } })
      return (
        <Form form={form}>
          <ArrayField name="rows" rowKey="id">
            {({ index }) => <Field name="s" enum={[{ label: index === 0 ? '首' : '次', value: 1 }]} component={[EnumPretty]} />}
          </ArrayField>
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('首次')
    await act(async () => form.setValue('rows', [{ id: 'b', s: 1 }, { id: 'a', s: 1 }]))
    await settle()
    expect(view.container.textContent).toBe('首次')
  })
})

describe('<Field enum> with antd choice controls (editable + readPretty)', () => {
  function mount(pattern?: 'readPretty') {
    function App() {
      const form = useForm<Values>({ initialValues: { level: 'silver', tags: ['gold'], n: 1 }, pattern })
      const F = typed(form)
      return (
        <Form form={form}>
          <F.Field name="level" enum={LEVELS} component={[Select, { 'aria-label': 'level' }]} />
          <F.Field name="tags" enum={LEVELS} component={[Checkbox.Group]} />
          <F.Field name="level" enum={LEVELS} component={[Radio]} />
        </Form>
      )
    }
    return render(<App />)
  }

  it('editable: Select / Checkbox.Group / Radio get the options', () => {
    const view = mount()
    expect(view.container.querySelectorAll('.ant-checkbox-wrapper')).toHaveLength(2)
    expect(view.container.querySelectorAll('.ant-radio-wrapper')).toHaveLength(2)
    expect(view.container.querySelector('.ant-select-selection-item')?.textContent).toBe('白银')
  })

  it('readPretty shows labels, not values', () => {
    const view = mount('readPretty')
    const text = view.container.textContent!
    expect(text).toContain('白银')
    expect(text).toContain('黄金')
    expect(text).not.toContain('silver')
    expect(view.container.querySelectorAll('input')).toHaveLength(0)
  })
})

describe('<Field enum> types', () => {
  it('option values follow the field value (element type for arrays)', () => {
    expectTypeOf<FieldEnum<string>>().toMatchTypeOf<FieldEnum<string>>()
    const ok: FieldEnum<'a' | 'b'> = [{ label: 'A', value: 'a' }]
    const okArray: FieldEnum<number[]> = [1, 2]
    // @ts-expect-error a number option on a string field
    const bad: FieldEnum<string> = [{ label: 'x', value: 1 }]
    // @ts-expect-error 'c' is not a value of the field
    const badLiteral: FieldEnum<'a' | 'b'> = ['c']
    const anything: FieldEnum = [{ label: 'x', value: { deep: true } }]
    void [ok, okArray, bad, badLiteral, anything]
  })

  it('typed(form).Field checks enum against the field', () => {
    function App() {
      const form = useForm({ initialValues: { level: 'gold' as 'gold' | 'silver', n: 1 } })
      const F = typed(form)
      return (
        <Form form={form}>
          <F.Field name="level" enum={[{ label: '黄金', value: 'gold' }]} />
          {/* @ts-expect-error 'bronze' is not a level */}
          <F.Field name="level" enum={[{ label: '铜', value: 'bronze' }]} />
          {/* @ts-expect-error string option on a number field */}
          <F.Field name="n" enum={['1']} />
          <F.Field name="n" enum={[1, 2]} />
        </Form>
      )
    }
    void App
  })
})
