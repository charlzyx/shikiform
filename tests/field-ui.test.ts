import { describe, expect, it } from 'vitest'
import { createForm, defineEffects } from 'shikiform'
import type { Draft } from 'shikiform'

type V = { city: string; kind: string; rows: { name: string }[] }
const initialValues: V = { city: '', kind: 'a', rows: [{ name: 'x' }, { name: 'y' }] }

describe('field UI state ($title, $componentProps, …)', () => {
  it('declares UI state in fields, including [Component, props] tuples and item templates', () => {
    const Comp = () => null
    const form = createForm({
      initialValues,
      fields: {
        city: { title: '城市', description: '选择城市', component: [Comp, { placeholder: 'p' }], decoratorProps: { colon: false } },
        'rows.*.name': { title: '名称' },
      },
    })
    const b = form.binding('city')
    expect(b.title).toBe('城市')
    expect(b.description).toBe('选择城市')
    expect(b.component).toBe(Comp)
    expect(b.componentProps).toEqual({ placeholder: 'p' })
    expect(b.decoratorProps).toEqual({ colon: false })
    expect(form.binding('rows.1.name').title).toBe('名称')
    form.pushArray('rows', { name: 'z' })
    expect(form.binding('rows.2.name').title).toBe('名称')
  })

  it('layers reaction > JSX > declaration; componentProps merge per key', () => {
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        d.city.$componentProps.disabled = d.kind.$value === 'b'
        if (d.kind.$value === 'b') d.city.$title = '城市（B）'
      })
    })
    const form = createForm({ initialValues, fields: { city: { title: '城市', componentProps: { placeholder: 'decl', allowClear: true } } }, effects: [effects] })
    const jsx = { title: 'JSX 城市', componentProps: { placeholder: 'jsx' } }
    expect(form.binding('city', jsx).title).toBe('JSX 城市')
    expect(form.binding('city', jsx).componentProps).toEqual({ placeholder: 'jsx', allowClear: true, disabled: false })
    form.setValue('kind', 'b')
    expect(form.binding('city', jsx).title).toBe('城市（B）')
    expect(form.binding('city', jsx).componentProps.disabled).toBe(true)
  })

  it('nested patches are immutable, keep other keys, and replay inside the same pass', () => {
    const seen: unknown[] = []
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        const kind = d.kind.$value
        const props = d.city.$componentProps
        props.style ??= {}
        props.style.color = kind === 'b' ? 'red' : 'blue'
        seen.push(d.city.$componentProps.style.color)
      })
    })
    const form = createForm({ initialValues, fields: { city: { componentProps: { placeholder: 'p', style: { width: 100 } } } }, effects: [effects] })
    const first = form.binding('city').componentProps
    expect(first).toEqual({ placeholder: 'p', style: { width: 100, color: 'blue' } })
    form.setValue('kind', 'b')
    const second = form.binding('city').componentProps
    expect(second).toEqual({ placeholder: 'p', style: { width: 100, color: 'red' } })
    expect(first.style.color).toBe('blue') // the earlier object was not mutated
    // A reaction that reads the prop it patches re-runs once and settles (its second write changes nothing).
    expect([...new Set(seen)]).toEqual(['blue', 'red'])
    expect(seen.at(-1)).toBe('red')
  })

  it('reads behave like plain JS: missing keys are undefined, missing intermediates throw', () => {
    const form = createForm({ initialValues })
    const d = form.draft as Draft<V>
    expect(d.city.$componentProps.placeholder).toBeUndefined()
    expect(d.city.$componentProps.style).toBeUndefined()
    expect(() => {
      d.city.$componentProps.style.color = 'red'
    }).toThrow(TypeError)
    expect(d.city.$title).toBeUndefined()
  })

  it('whole-object assignment replaces lower layers; undefined restores them', () => {
    const form = createForm({ initialValues, fields: { city: { componentProps: { placeholder: 'decl' }, title: 'T' } } })
    form.batch((d) => {
      d.city.$componentProps = { maxLength: 3 }
    })
    expect(form.binding('city', { componentProps: { allowClear: true } }).componentProps).toEqual({ maxLength: 3 })
    form.batch((d) => {
      d.city.$componentProps.placeholder = 'eff'
    })
    expect(form.binding('city').componentProps).toEqual({ maxLength: 3, placeholder: 'eff' })
    form.batch((d) => {
      d.city.$componentProps = undefined as never
      d.city.$title = 'T2'
    })
    expect(form.binding('city').componentProps).toEqual({ placeholder: 'decl' })
    expect(form.binding('city').title).toBe('T2')
    form.batch((d) => {
      d.city.$title = undefined
    })
    expect(form.binding('city').title).toBe('T')
  })

  it('delete removes a patched key; arrays inside props patch by index', () => {
    const form = createForm({ initialValues, fields: { city: { componentProps: { options: [{ v: 1 }, { v: 2 }], extra: 1 } } } })
    form.batch((d) => {
      d.city.$componentProps.options[1].v = 3
      delete d.city.$componentProps.extra
    })
    const props = form.binding('city').componentProps
    expect(props.options).toEqual([{ v: 1 }, { v: 3 }])
    expect(props.extra).toBeUndefined()
    expect({ ...(form.draft as Draft<V>).city.$componentProps }).toMatchObject({ options: [{ v: 1 }, { v: 3 }] })
  })

  it('tracks dependencies per field + prop name', () => {
    let runs = 0
    const effects = defineEffects<V>(({ reaction }) => {
      reaction((d) => {
        runs += 1
        d.kind.$value = d.city.$title === 'go' ? 'b' : 'a'
      })
    })
    const form = createForm({ initialValues, effects: [effects] })
    expect(runs).toBe(1)
    form.batch((d) => {
      d.city.$componentProps.placeholder = 'x'
    })
    expect(runs).toBe(1)
    form.batch((d) => {
      d.city.$title = 'go'
    })
    expect(runs).toBe(2)
    expect(form.getValue('kind')).toBe('b')
    form.batch((d) => {
      d.city.$title = 'go'
    })
    expect(runs).toBe(2)
  })

  it('notifies path subscribers when UI state changes', () => {
    const form = createForm({ initialValues })
    let calls = 0
    form.subscribePath('city', () => calls++)
    form.batch((d) => {
      d.city.$decoratorProps.tooltip = 'hi'
    })
    expect(calls).toBe(1)
    expect(form.binding('city').decoratorProps).toEqual({ tooltip: 'hi' })
  })
})
