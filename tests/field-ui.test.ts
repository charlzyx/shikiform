import { describe, expect, it } from 'vitest'
import { defineEffects } from '@shikiform/react'
import type { Draft } from '@shikiform/react'
import { createEngine } from '../packages/core/src/engine/create'

type V = { city: string; kind: string; rows: { name: string }[] }
const initialValues: V = { city: '', kind: 'a', rows: [{ name: 'x' }, { name: 'y' }] }

describe('field UI state ($title, $componentProps, …)', () => {
  it('declares UI state in fields, including [Component, props] tuples and item templates', () => {
    const Comp = () => null
    const form = createEngine({
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
    const form = createEngine({ initialValues, fields: { city: { title: '城市', componentProps: { placeholder: 'decl', allowClear: true } } }, effects: [effects] })
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
    const form = createEngine({ initialValues, fields: { city: { componentProps: { placeholder: 'p', style: { width: 100 } } } }, effects: [effects] })
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
    const form = createEngine({ initialValues })
    const d = form.draft as Draft<V>
    expect(d.city.$componentProps.placeholder).toBeUndefined()
    expect(d.city.$componentProps.style).toBeUndefined()
    expect(() => {
      d.city.$componentProps.style.color = 'red'
    }).toThrow(TypeError)
    expect(d.city.$title).toBeUndefined()
  })

  it('whole-object assignment replaces lower layers; undefined restores them', () => {
    const form = createEngine({ initialValues, fields: { city: { componentProps: { placeholder: 'decl' }, title: 'T' } } })
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
    const form = createEngine({ initialValues, fields: { city: { componentProps: { options: [{ v: 1 }, { v: 2 }], extra: 1 } } } })
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
    const form = createEngine({ initialValues, effects: [effects] })
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
    const form = createEngine({ initialValues })
    let calls = 0
    form.subscribePath('city', () => calls++)
    form.batch((d) => {
      d.city.$decoratorProps.tooltip = 'hi'
    })
    expect(calls).toBe(1)
    expect(form.binding('city').decoratorProps).toEqual({ tooltip: 'hi' })
  })

  /** Decision 2026-10-30: object UI state deep-merges across layers, reaction > JSX > declaration. */
  describe('deep merge across layers', () => {
    const jsx = { componentProps: { placeholder: 'jsx', style: { width: 120, fontSize: 12 } } }

    it('a nested reaction write merges into the JSX style instead of replacing it', () => {
      const effects = defineEffects<V>(({ reaction }) => {
        reaction((d) => {
          const props = d.city.$componentProps
          props.style ??= {}
          props.style.color = d.kind.$value === 'b' ? 'red' : 'blue'
        })
      })
      const form = createEngine({ initialValues, effects: [effects] })
      expect(form.binding('city', jsx).componentProps).toEqual({ placeholder: 'jsx', style: { width: 120, fontSize: 12, color: 'blue' } })
      form.setValue('kind', 'b')
      expect(form.binding('city', jsx).componentProps).toEqual({ placeholder: 'jsx', style: { width: 120, fontSize: 12, color: 'red' } })
    })

    it('JSX deep-merges over the declaration', () => {
      const form = createEngine({
        initialValues,
        fields: { city: { componentProps: { style: { width: 100, margin: 4 }, allowClear: true }, decoratorProps: { labelCol: { span: 4 } } } },
      })
      const b = form.binding('city', { componentProps: { style: { width: 200 } }, decoratorProps: { labelCol: { offset: 1 } } })
      expect(b.componentProps).toEqual({ style: { width: 200, margin: 4 }, allowClear: true })
      expect(b.decoratorProps).toEqual({ labelCol: { span: 4, offset: 1 } })
    })

    it('arrays, functions, React elements and class instances are replaced whole', () => {
      class Box {
        constructor(readonly n: number) {}
      }
      const fnA = () => 'a'
      const fnB = () => 'b'
      const el = { $$typeof: Symbol.for('react.element'), type: 'b', props: {} }
      const form = createEngine({
        initialValues,
        fields: { city: { componentProps: { options: [1, 2, 3], render: fnA, icon: { a: 1 }, box: new Box(1) } } },
      })
      const b = form.binding('city', { componentProps: { options: [9], render: fnB, icon: el, box: new Box(2) } }).componentProps
      expect(b.options).toEqual([9])
      expect(b.render).toBe(fnB)
      expect(b.icon).toBe(el)
      expect(b.box).toBeInstanceOf(Box)
      expect(b.box.n).toBe(2)
    })

    it('whole-key assignment still replaces that key on every lower layer', () => {
      const form = createEngine({ initialValues, fields: { city: { componentProps: { style: { margin: 4 } } } } })
      form.batch((d) => {
        d.city.$componentProps.style = { color: 'red' }
      })
      expect(form.binding('city', jsx).componentProps).toEqual({ placeholder: 'jsx', style: { color: 'red' } })
    })

    it('deep writes merge at every depth; two keys of one nested object both survive', () => {
      const form = createEngine({ initialValues, fields: { city: { decoratorProps: { wrapperCol: { style: { padding: 1 } } } } } })
      form.batch((d) => {
        d.city.$decoratorProps.wrapperCol.style.color = 'red'
        d.city.$decoratorProps.wrapperCol.style.margin = 2
      })
      expect(form.binding('city', { decoratorProps: { wrapperCol: { span: 8, style: { border: 0 } } } }).decoratorProps).toEqual({
        wrapperCol: { span: 8, style: { padding: 1, border: 0, color: 'red', margin: 2 } },
      })
    })
  })
})
