// @vitest-environment happy-dom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, expectTypeOf, it } from 'vitest'
import { Field, Form, useForm, useWatch } from '../src'
import { defineEffects, ShikiUsageError, type Draft } from '../src/core'
import { createEngine, type Engine, engineOf } from '../src/core/engine/create'

type Rec = { name: string; addr: { city: string }; rows: { id: string; qty: number }[] }
const EMPTY: Rec = { name: '', addr: { city: '' }, rows: [] }
afterEach(cleanup)

const RECORD: Rec = { name: 'Ada', addr: { city: '杭州' }, rows: [{ id: 'a', qty: 1 }, { id: 'b', qty: 2 }] }

describe('#33 reset(values) / setInitialValues', () => {
  it('reset(record) replaces values and the baseline; a later reset() returns to the record', () => {
    const form = createEngine<Rec>({ initialValues: EMPTY })
    form.reset(RECORD)
    expect(form.values).toEqual(RECORD)
    expect(form.initial).toEqual(RECORD)
    expect(form.dirty).toBe(false)
    expect(form.edited).toBe(false)
    form.setValue('name', 'Grace')
    expect(form.dirty).toBe(true)
    form.reset()
    expect(form.values).toEqual(RECORD)
    expect(form.dirty).toBe(false)
  })

  it('reset(record) clears touched, edited and messages, and does not alias the caller object', async () => {
    const form = createEngine<Rec>({ initialValues: EMPTY, fields: { name: { required: true } } })
    form.binding('name').onBlur()
    await form.validate()
    expect(form.errors.length).toBe(1)
    const record = structuredClone(RECORD)
    form.reset(record)
    expect(form.errors).toEqual([])
    expect(form.binding('name').touched).toBe(false)
    record.name = 'mutated'
    expect(form.getValue('name')).toBe('Ada')
  })

  it('reset(path) still restores one subtree', () => {
    const form = createEngine<Rec>({ initialValues: RECORD })
    form.setValue('name', 'x')
    form.setValue('addr.city', 'y')
    form.reset('addr')
    expect(form.values.addr.city).toBe('杭州')
    expect(form.values.name).toBe('x')
  })

  it('setInitialValues moves the baseline without touching values', () => {
    const form = createEngine<Rec>({ initialValues: EMPTY })
    form.setValue('name', 'Ada')
    expect(form.dirty).toBe(true)
    form.setInitialValues(form.values)
    expect(form.dirty).toBe(false)
    expect(form.values.name).toBe('Ada')
    form.setValue('name', 'B')
    form.reset()
    expect(form.values.name).toBe('Ada')
  })

  it('React: inputs, arrays and useWatch follow reset(record)', () => {
    let api!: Engine<Rec>
    function Rows() {
      const n = useWatch((d: Draft<Rec>) => d.rows.$value.length)
      const dirty = useWatch((d: Draft<Rec>) => d.$dirty)
      return <span data-testid="rows">{`${n}:${dirty}`}</span>
    }
    function Edit() {
      api = engineOf(useForm<Rec>({ initialValues: EMPTY }))
      return (
        <Form form={api}>
          <Field<Rec> name="name">{(f) => <input aria-label="name" value={String(f.value)} onChange={(e) => f.onChange(e.target.value)} />}</Field>
          <Rows />
        </Form>
      )
    }
    render(<Edit />)
    act(() => api.reset(RECORD))
    expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe('Ada')
    expect(screen.getByTestId('rows').textContent).toBe('2:false')
    act(() => api.setValue('name', 'Grace'))
    expect(screen.getByTestId('rows').textContent).toBe('2:true')
    act(() => api.reset())
    expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe('Ada')
    expect(screen.getByTestId('rows').textContent).toBe('2:false')
  })
})

describe('#34 setErrors / clearErrors', () => {
  type V = { username: string; email: string; addr: { city: string } }
  const init: V = { username: 'ada', email: '', addr: { city: '' } }

  it('shows server messages, blocks canSubmit, and clears when that field changes', () => {
    const form = createEngine<V>({ initialValues: init })
    form.setErrors({ username: '用户名已存在', email: ['格式不对', '已被占用'] })
    expect(form.errors).toEqual([
      { path: 'username', messages: ['用户名已存在'] },
      { path: 'email', messages: ['格式不对', '已被占用'] },
    ])
    expect(form.binding('username').errors).toEqual(['用户名已存在'])
    expect(form.canSubmit).toBe(false)
    form.binding('username').onChange('grace')
    expect(form.binding('username').errors).toEqual([])
    expect(form.binding('email').errors).toEqual(['格式不对', '已被占用'])
    form.setValue('email', 'a@b.c')
    expect(form.canSubmit).toBe(true)
  })

  it('an edit below or above the path clears it; the root message clears on any edit', () => {
    const form = createEngine<V>({ initialValues: init })
    form.setErrors([{ path: 'addr', messages: ['地址无效'] }, { path: '', messages: ['服务器繁忙'] }])
    expect(form.errors.map((e) => e.path).sort()).toEqual(['', 'addr'])
    form.setValue('addr.city', '杭州')
    expect(form.errors).toEqual([])
  })

  it('setErrors + $errors; revalidating the field replaces the server message', async () => {
    const form = createEngine<V>({ initialValues: init })
    form.setErrors({ username: '用户名已存在' })
    let seen: string[] = []
    form.batch((d) => { seen = d.username.$errors })
    expect(seen).toEqual(['用户名已存在'])
    await form.validate('username')
    expect(form.errors).toEqual([])
  })

  it('setErrors({ path: null }) clears that path\'s external messages', () => {
    const form = createEngine<V>({ initialValues: init })
    form.setErrors({ username: '用户名已存在', email: '格式不对' })
    form.setErrors({ username: null })
    expect(form.errors).toEqual([{ path: 'email', messages: ['格式不对'] }])
    form.setErrors({ email: null })
    expect(form.errors).toEqual([])
    expect(form.canSubmit).toBe(true)
  })

  it('submit revalidates, so a resubmit is not stuck on the old server message', async () => {
    const form = createEngine<V>({ initialValues: init })
    const first = await form.submit(async () => { form.setErrors({ username: '用户名已存在' }) })
    expect(first.ok).toBe(true)
    expect(form.errors).toEqual([{ path: 'username', messages: ['用户名已存在'] }])
    const second = await form.submit()
    expect(second.ok).toBe(true)
  })

  it('clearErrors(path?) and an empty entry clear messages; React shows them', () => {
    const form = createEngine<V>({ initialValues: init })
    form.setErrors({ username: 'x', email: 'y' })
    form.setErrors({ email: [] })
    expect(form.errors.map((e) => e.path)).toEqual(['username'])
    form.clearErrors('username')
    expect(form.errors).toEqual([])

    let api!: Engine<V>
    function F() {
      api = engineOf(useForm<V>({ initialValues: init }))
      return <Form form={api}><Field<V> name="username">{(f) => <span data-testid="err">{f.errors.join(',')}</span>}</Field></Form>
    }
    render(<F />)
    act(() => api.setErrors({ username: '用户名已存在' }))
    expect(screen.getByTestId('err').textContent).toBe('用户名已存在')
    act(() => api.clearErrors())
    expect(screen.getByTestId('err').textContent).toBe('')
  })
})

describe('#35 $value snapshots are read-only inside form.batch (development)', () => {
  type V = { profile: { name: string; city: string }; tags: string[] }
  const init: V = { profile: { name: 'Ada', city: '杭州' }, tags: ['a'] }

  it('in-place mutation throws ShikiUsageError and leaves the store untouched', () => {
    const form = createEngine<V>({ initialValues: structuredClone(init) })
    let notified = 0
    form.subscribePath('profile.name', () => notified++)
    expect(() => form.batch((d) => { (d.profile.$value as any).name = 'x' })).toThrow(ShikiUsageError)
    expect(() => form.batch((d) => { (d.tags.$value as any).push('b') })).toThrow(/Assign a new array/)
    expect(form.values).toEqual(init)
    expect(notified).toBe(0)
  })

  it('reading and re-assigning snapshots in batch still works and stores plain data', () => {
    const form = createEngine<V>({ initialValues: structuredClone(init) })
    form.batch((d) => {
      d.tags.$value = [...d.tags.$value, 'b']
      d.profile.$value = { ...d.profile.$value, name: 'x' }
    })
    expect(form.values).toEqual({ profile: { name: 'x', city: '杭州' }, tags: ['a', 'b'] })
    expect(structuredClone(form.values)).toEqual(form.values)
  })
})

describe('#36 FormEngine state is read-only', () => {
  it('values / submitting / dirty / submitCount / validating have no setter', () => {
    const form = createEngine<{ name: string }>({ initialValues: { name: '' } })
    for (const key of ['values', 'submitting', 'dirty', 'edited', 'submitCount', 'validating', 'initial'] as const) {
      const desc = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(form), key)
      expect(desc?.get, key).toBeTypeOf('function')
      expect(desc?.set, key).toBeUndefined()
    }
    expect(() => { (form as any).values = { name: 'x' } }).toThrow(TypeError)
    expectTypeOf<Engine<{ name: string }>>().toHaveProperty('values')
    const typeOnly = () => {
      // @ts-expect-error values is read-only
      form.values = { name: 'x' }
      // @ts-expect-error dirty is read-only
      form.dirty = false
      // @ts-expect-error submitting is read-only
      form.submitting = false
    }
    expect(typeOnly).toBeTypeOf('function')
  })
})

describe('#39 dirty = differs from initial; edited = sticky', () => {
  it('reverting a field clears dirty (form and field); edited stays', () => {
    const form = createEngine<{ name: string }>({ initialValues: { name: 'Ada' } })
    form.binding('name').onChange('Adaa')
    expect(form.dirty).toBe(true)
    expect(form.binding('name').dirty).toBe(true)
    form.binding('name').onChange('Ada')
    expect(form.dirty).toBe(false)
    expect(form.binding('name').dirty).toBe(false)
    expect(form.edited).toBe(true)
    expect(form.binding('name').edited).toBe(true)
    form.reset()
    expect(form.edited).toBe(false)
  })

  it('deep compares objects and arrays; array ops count', () => {
    const form = createEngine<Rec>({ initialValues: RECORD })
    form.setValue('addr', { city: '杭州' })
    expect(form.dirty).toBe(false)
    form.pushArray('rows', { id: 'c', qty: 3 })
    expect(form.dirty).toBe(true)
    expect(form.binding('rows').dirty).toBe(true)
    form.removeArray('rows', 2)
    expect(form.dirty).toBe(false)
  })

  it('virtual and computed fields do not make the form dirty', () => {
    type V = { price: number; qty: number; total: number; confirm: string }
    const effects = defineEffects<V>(({ reaction }) => reaction((d) => { d.total.$value = d.price.$value * d.qty.$value }))
    const form = createEngine<V>({ initialValues: { price: 2, qty: 1, total: 0, confirm: '' }, fields: { confirm: { virtual: true } }, effects: [effects] })
    expect(form.values.total).toBe(2)
    expect(form.dirty).toBe(false)
    form.setValue('confirm', 'yes')
    expect(form.dirty).toBe(false)
    form.setValue('qty', 2)
    expect(form.dirty).toBe(true)
    form.setValue('qty', 1)
    expect(form.dirty).toBe(false)
  })

  it('a reaction and useWatch reading $dirty follow edits, reverts and setInitialValues', () => {
    type V = { name: string; saveDisabled: boolean }
    const effects = defineEffects<V>(({ reaction }) => reaction((d) => { d.saveDisabled.$value = !d.$dirty }))
    const form = createEngine<V>({ initialValues: { name: 'Ada', saveDisabled: true }, fields: { saveDisabled: { virtual: true } }, effects: [effects] })
    expect(form.values.saveDisabled).toBe(true)
    form.setValue('name', 'B')
    expect(form.values.saveDisabled).toBe(false)
    form.setValue('name', 'Ada')
    expect(form.values.saveDisabled).toBe(true)
    form.setValue('name', 'C')
    form.setInitialValues({ ...form.values })
    expect(form.values.saveDisabled).toBe(true)

    let api!: Engine<{ name: string }>
    function F() {
      api = engineOf(useForm({ initialValues: { name: 'Ada' } }))
      return <Form form={api}><DirtyLabel /></Form>
    }
    function DirtyLabel() {
      const dirty = useWatch((d: Draft<{ name: string }>) => d.$dirty)
      const field = useWatch((d: Draft<{ name: string }>) => d.name.$dirty)
      return <span data-testid="d">{`${dirty}:${field}`}</span>
    }
    render(<F />)
    expect(screen.getByTestId('d').textContent).toBe('false:false')
    act(() => api.setValue('name', 'x'))
    expect(screen.getByTestId('d').textContent).toBe('true:true')
    act(() => api.setValue('name', 'Ada'))
    expect(screen.getByTestId('d').textContent).toBe('false:false')
  })

  it('subscribeMeta fires when form-level dirty flips', () => {
    const form = createEngine<{ name: string }>({ initialValues: { name: 'Ada' } })
    let calls = 0
    form.subscribeMeta(() => calls++)
    form.batch((d) => { d.name.$value = 'x' })
    expect(form.dirty).toBe(true)
    expect(calls).toBeGreaterThan(0)
    const before = calls
    form.batch((d) => { d.name.$value = 'Ada' })
    expect(form.dirty).toBe(false)
    expect(calls).toBeGreaterThan(before)
  })
})
