// @vitest-environment happy-dom
import { act, cleanup, render } from '@testing-library/react'
import { StrictMode, useState } from 'react'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { ArrayField, defineEffects, EnumSource, Field, Form, typed, useField, useForm, type FieldEnum } from '@shikiform/react'

import { Checkbox, Radio, Select } from '@shikiform/antd'
import type { FormInstance } from '@shikiform/react'
import { engineOf } from '../packages/core/src/engine/create'

afterEach(cleanup)
const settle = () => act(() => new Promise((resolve) => setTimeout(resolve, 20)))

type Values = { level: string; tags: string[]; n: number }
const LEVELS = [{ label: '黄金', value: 'gold' }, { label: '白银', value: 'silver' }]

describe('<Field enum>', () => {
  it('inline options reach the binding on the first render and `$enum` reads them', () => {
    let form!: FormInstance<Values>
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
          <Field name="n" enum={[1, 2, 3]} readOnly component={[Select]} />
        </Form>
      )
    }
    const view = render(<App />)
    expect(view.container.textContent).toBe('2')
  })

  it('JSX enum wins over fields.x.enum; unmount restores the declaration; a reaction $enum wins over JSX', async () => {
    let form!: FormInstance<Values>
    let setShow!: (on: boolean) => void
    const opts = () => engineOf(form).binding('level').options.map((o) => o.label)
    function App() {
      const [show, set] = useState(true)
      setShow = set
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 }, fields: { level: { enum: [{ label: '声明', value: 'gold' }] } } })
      return <Form form={form}>{show ? <Field name="level" enum={LEVELS} readOnly component={[Select]} /> : null}</Form>
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
    let form!: FormInstance<Values>
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
    let form!: FormInstance<Values>
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
    let form!: FormInstance<Values>
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
    let form!: FormInstance<Rows>
    function App() {
      form = useForm<Rows>({ initialValues: { rows: [{ id: 'a', s: 1 }, { id: 'b', s: 1 }] } })
      return (
        <Form form={form}>
          <ArrayField name="rows" rowKey="id">
            {({ index }) => <Field name="s" enum={[{ label: index === 0 ? '首' : '次', value: 1 }]} readOnly component={[Select]} />}
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

describe('reaction `$enum = undefined` falls back', () => {
  type Flag = Values & { on: boolean }
  const RX = [{ label: '联动', value: 'rx' }]
  const DECL = [{ label: '声明', value: 'gold' }]

  function setup(opts: { decl?: boolean; jsx?: unknown; policy?: 'clear'; level?: string; initialOn?: boolean } = {}) {
    let form!: FormInstance<Flag>
    let setShow!: (on: boolean) => void
    const effects = defineEffects<Flag>(({ reaction }) => {
      reaction((d) => { d.level.$enum = d.on.$value ? RX : undefined })
    })
    function App() {
      const [show, set] = useState(true)
      setShow = set
      form = useForm<Flag>({
        initialValues: { level: opts.level ?? 'gold', tags: [], n: 1, on: opts.initialOn ?? true },
        fields: opts.decl ? { level: { enum: DECL } } : undefined,
        effects: [effects],
        enumPolicy: opts.policy,
      })
      return <Form form={form}>{show ? <Field name="level" enum={opts.jsx as any} /> : null}</Form>
    }
    render(<App />)
    const labels = () => engineOf(form).binding('level').options.map((o) => o.label)
    const read = () => { let seen: readonly { label: string }[] = []; form.batch((d) => { seen = d.level.$enum }); return seen.map((o) => o.label) }
    return { form: () => form, setShow: (on: boolean) => setShow(on), labels, read }
  }

  it('JSX enum > fields.x.enum: undefined drops the reaction layer; reading $enum returns the fallback', async () => {
    const t = setup({ decl: true, jsx: LEVELS })
    await settle()
    expect(t.labels()).toEqual(['联动'])
    await act(async () => t.form().setValue('on', false))
    expect(t.labels()).toEqual(['黄金', '白银'])
    expect(t.read()).toEqual(['黄金', '白银'])
    // The JSX layer works again while the reaction is off: unmount restores the declaration.
    await act(async () => t.setShow(false))
    expect(t.labels()).toEqual(['声明'])
    await act(async () => t.form().setValue('on', true))
    expect(t.labels()).toEqual(['联动'])
    await act(async () => t.form().setValue('on', false))
    expect(t.labels()).toEqual(['声明'])
    expect(t.read()).toEqual(['声明'])
  })

  it('falls back to the rows.*.x template, and to no options when nothing is declared', async () => {
    type Rows = { rows: { id: string; s: string }[]; on: boolean }
    let form!: FormInstance<Rows>
    const effects = defineEffects<Rows>(({ reaction }) => {
      reaction((d) => { d.rows[0].s.$enum = d.on.$value ? RX : undefined })
    })
    function App() {
      form = useForm<Rows>({
        initialValues: { rows: [{ id: 'a', s: 'x' }], on: true },
        fields: { 'rows.*.s': { enum: [{ label: '模板', value: 'x' }] } },
        effects: [effects],
      })
      return <Form form={form}><ArrayField name="rows" rowKey="id">{() => <Field name="s" />}</ArrayField></Form>
    }
    render(<App />)
    await settle()
    expect(engineOf(form).binding('rows.0.s').options.map((o) => o.label)).toEqual(['联动'])
    await act(async () => form.setValue('on', false))
    expect(engineOf(form).binding('rows.0.s').options.map((o) => o.label)).toEqual(['模板'])

    const bare = setup()
    await settle()
    expect(bare.labels()).toEqual(['联动'])
    await act(async () => bare.form().setValue('on', false))
    expect(bare.labels()).toEqual([])
  })

  it('`$enum = []` still clears explicitly (wins over JSX and declarations)', async () => {
    let form!: FormInstance<Values>
    function App() {
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 }, fields: { level: { enum: DECL } } })
      return <Form form={form}><Field name="level" enum={LEVELS} /></Form>
    }
    render(<App />)
    await act(async () => form.batch((d) => { d.level.$enum = [] }))
    expect(engineOf(form).binding('level').options).toEqual([])
    await act(async () => form.batch((d) => { d.level.$enum = undefined }))
    expect(engineOf(form).binding('level').options).toEqual(LEVELS)
  })

  it('enumPolicy "clear" applies to the fallback options', async () => {
    const t = setup({ decl: true, policy: 'clear', level: 'rx' })
    await settle()
    expect(t.form().getValue('level')).toBe('rx')
    await act(async () => t.form().setValue('on', false))
    expect(t.labels()).toEqual(['声明'])
    expect(t.form().getValue('level')).toBeUndefined()
  })

  it('cancels a reaction EnumSource load: abort, loading reset, late result ignored', async () => {
    let release!: (list: { label: string; value: unknown }[]) => void
    let signal!: AbortSignal
    const slow = EnumSource.from((_: string, ctx) => new Promise<{ label: string; value: unknown }[]>((resolve) => { signal = ctx.signal; release = resolve }))
    let form!: FormInstance<Values>
    function App() {
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 }, fields: { level: { enum: DECL } } })
      return <Form form={form}><Field name="level" /></Form>
    }
    render(<App />)
    await act(async () => form.batch((d) => { d.level.$enum = slow.with('q') }))
    expect(engineOf(form).binding('level').loading).toBe(true)
    await act(async () => form.batch((d) => { d.level.$enum = undefined }))
    expect(signal.aborted).toBe(true)
    expect(engineOf(form).binding('level').loading).toBe(false)
    expect(engineOf(form).binding('level').options).toEqual(DECL)
    await act(async () => release([{ label: '迟到', value: 'late' }]))
    await settle()
    expect(engineOf(form).binding('level').options).toEqual(DECL)
  })

  it('cancels a debounced reaction load before it starts', async () => {
    let calls = 0
    const debounced = EnumSource.from(async (q: string) => { calls++; return [{ label: q, value: q }] }, { debounce: 10 })
    let form!: FormInstance<Values>
    function App() {
      form = useForm<Values>({ initialValues: { level: 'gold', tags: [], n: 1 } })
      return <Form form={form}><Field name="level" enum={LEVELS} /></Form>
    }
    render(<App />)
    await act(async () => form.batch((d) => { d.level.$enum = debounced.with('q') }))
    await act(async () => form.batch((d) => { d.level.$enum = undefined }))
    await settle()
    expect(calls).toBe(0)
    expect(engineOf(form).binding('level').loading).toBe(false)
    expect(engineOf(form).binding('level').options).toEqual(LEVELS)
  })

  it('a JSX EnumSource re-binds on fallback', async () => {
    let calls = 0
    const remote = EnumSource.from(async (q: string) => { calls++; return [{ label: `远程-${q}`, value: 'gold' }] })
    const t = setup({ jsx: remote.with('x'), initialOn: false })
    await settle()
    expect(t.labels()).toEqual(['远程-x'])
    await act(async () => t.form().setValue('on', true))
    expect(t.labels()).toEqual(['联动'])
    await act(async () => t.form().setValue('on', false))
    await settle()
    expect(t.labels()).toEqual(['远程-x'])
    expect(engineOf(t.form()).binding('level').loading).toBe(false)
    expect(t.read()).toEqual(['远程-x'])
    expect(calls).toBe(1) // the second bind hits the source cache
  })
})

describe('<Field enum> with antd choice controls (editable + readPretty)', () => {
  function mount(readOnly?: boolean) {
    function App() {
      const form = useForm<Values>({ initialValues: { level: 'silver', tags: ['gold'], n: 1 }, readOnly })
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
    const view = mount(true)
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
