import { describe, expect, it } from 'vitest'
import { defineEffects, EnumSource, ShikiUsageError, type EnumOption } from '@shikiform/core'
import { runsFor } from './fixtures/reaction-utils'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

interface Row {
  id: string
  name: string
  note: string
}

const rows = (): Row[] => [
  { id: 'a', name: 'A', note: '' },
  { id: 'b', name: 'B', note: '' },
  { id: 'c', name: 'C', note: '' },
]

describe('effect-scope $value drafts', () => {
  it('push in a reaction matches pushArray: templates, row identity, and precise each', async () => {
    const form = createEngine<{ go: boolean; rows: Row[] }>({
      initialValues: { go: false, rows: rows() },
      fields: { 'rows.*.name': { required: true } },
      effects: [
        defineEffects<{ go: boolean; rows: Row[] }>(({ reaction }) => {
          reaction.each((d) => d.rows, (row) => {
            row.note.$value = row.name.$value
          })
          reaction((d) => {
            if (!d.go.$value || d.rows.$value.length !== 3) return
            d.rows.$value.push({ id: 'd', name: '', note: '' })
          })
        }),
      ],
    })
    expect(form.getValue('rows').map((row) => row.note)).toEqual(['A', 'B', 'C'])
    const before = form.getDebugStats().runs
    form.setValue('go', true)
    const after = form.getDebugStats().runs
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(form.getValue('rows.3.note')).toBe('')
    expect(form.binding('rows.3.name').required).toBe(true)
    expect(form.binding('rows.0.name').required).toBe(true)
    expect(runsFor(after, '#0')).toBe(runsFor(before, '#0'))
    expect(runsFor(after, '#1')).toBe(runsFor(before, '#1'))
    expect(runsFor(after, '#2')).toBe(runsFor(before, '#2'))
    expect(runsFor(after, '#3')).toBeGreaterThan(0)

    const pushed = { id: 'e', name: 'E', note: '' }
    form.batch((d) => { d.rows.$value.push(pushed) })
    pushed.name = 'changed'
    expect(form.getValue('rows.4.name')).toBe('E')

    await fieldErrorsOf(form.validate('rows.3.name'))
    expect(form.errors.some((error) => error.path === 'rows.3.name')).toBe(true)
    form.moveArray('rows', 3, 0)
    expect(form.getValue('rows.0.id')).toBe('d')
    expect(form.errors.some((error) => error.path === 'rows.0.name')).toBe(true)
    expect(form.errors.some((error) => error.path === 'rows.3.name')).toBe(false)
    form.removeArray('rows', 0)
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'e'])
    expect(form.errors.some((error) => error.path === 'rows.0.name')).toBe(false)
  })

  it('splice shifts field state with the row; delete leaves a hole', async () => {
    const form = createEngine<{ rows: Row[]; tags: string[] }>({
      initialValues: { rows: rows(), tags: ['a', 'b', 'c', 'd'] },
      fields: { 'rows.*.name': { required: true } },
    })
    form.setValue('rows.2.name', '')
    await fieldErrorsOf(form.validate('rows.2.name'))
    expect(form.errors.some((error) => error.path === 'rows.2.name')).toBe(true)

    form.batch((d) => { d.rows.$value.splice(0, 1) })
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['b', 'c'])
    expect(form.errors.some((error) => error.path === 'rows.1.name')).toBe(true)
    expect(form.errors.some((error) => error.path === 'rows.2.name')).toBe(false)

    form.batch((d) => {
      const tags = d.tags.$value
      delete tags[1]
      expect(tags).toHaveLength(4)
      expect(1 in tags).toBe(false)
      expect(tags[2]).toBe('c')
    })
    const holed = form.getValue('tags')
    expect(holed).toHaveLength(4)
    expect(1 in holed).toBe(false)
    expect(holed[0]).toBe('a')
    expect(holed[2]).toBe('c')
    form.removeArray('tags', 0)
    // `delete` left a hole at index 1. `remove` splices index 0 (`a`) and shifts that hole down.
    expect(form.getValue('tags')).toHaveLength(3)
    expect(0 in form.getValue('tags')).toBe(false)
    expect(form.getValue('tags')[1]).toBe('c')
    expect(form.getValue('tags')[2]).toBe('d')
  })

  it('two separate $value reads in one reaction or watch both push', () => {
    const form = createEngine<{ go: string; rows: Row[] }>({
      initialValues: { go: '', rows: rows() },
      effects: [
        defineEffects<{ go: string; rows: Row[] }>(({ reaction }) => {
          reaction((d) => {
            if (d.go.$value !== 'reaction') return
            if (d.rows.$value.some((row) => row.id === 'd')) return
            d.rows.$value.push({ id: 'd', name: 'D', note: '' })
            d.rows.$value.push({ id: 'e', name: 'E', note: '' })
          })
        }),
      ],
    })
    form.setValue('go', 'reaction')
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    const watched = createEngine<{ go: boolean; rows: Row[] }>({
      initialValues: { go: false, rows: rows() },
      effects: [
        defineEffects<{ go: boolean; rows: Row[] }>(({ watch }) => {
          watch((d) => d.go.$value, (d) => {
            d.rows.$value.push({ id: 'd', name: 'D', note: '' })
            d.rows.$value.push({ id: 'e', name: 'E', note: '' })
          })
        }),
      ],
    })
    watched.setValue('go', true)
    expect(watched.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
  })

  it('a cell edit and a push in either order both survive, in batch and in a reaction', () => {
    const init = { go: '', rows: rows() }
    const run = (order: 'cell-first' | 'push-first', where: 'batch' | 'reaction') => {
      const form = createEngine<{ go: string; rows: Row[] }>({
        initialValues: { ...init, rows: rows() },
        effects: where === 'reaction'
          ? [
              defineEffects<{ go: string; rows: Row[] }>(({ reaction }) => {
                reaction((d) => {
                  if (d.go.$value !== order) return
                  if (d.rows.$value.length > 3) return
                  if (order === 'cell-first') {
                    d.rows.$value[0].name = 'Ada'
                    d.rows.$value.push({ id: 'z', name: 'Z', note: '' })
                  } else {
                    d.rows.$value.push({ id: 'z', name: 'Z', note: '' })
                    d.rows.$value[0].name = 'Ada'
                  }
                })
              }),
            ]
          : [],
      })
      if (where === 'batch') {
        form.batch((d) => {
          if (order === 'cell-first') {
            d.rows.$value[0].name = 'Ada'
            d.rows.$value.push({ id: 'z', name: 'Z', note: '' })
          } else {
            d.rows.$value.push({ id: 'z', name: 'Z', note: '' })
            d.rows.$value[0].name = 'Ada'
          }
        })
      } else {
        form.setValue('go', order)
      }
      expect(form.getValue('rows.0')).toMatchObject({ id: 'a', name: 'Ada' })
      expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'z'])
      expect(form.getValue('rows.3.name')).toBe('Z')
    }
    for (const where of ['batch', 'reaction'] as const) {
      for (const order of ['cell-first', 'push-first'] as const) run(order, where)
    }
  })

  it('two pushes in one batch commit once', () => {
    const lengths: number[] = []
    const first = { id: 'd', name: 'D', note: '' }
    const second = { id: 'e', name: 'E', note: '' }
    const form = createEngine<{ rows: Row[] }>({
      initialValues: { rows: rows() },
      effects: [
        defineEffects<{ rows: Row[] }>(({ reaction }) => {
          reaction((d) => { lengths.push(d.rows.$value.length) })
        }),
      ],
    })
    const atRest = lengths.slice()
    form.batch((d) => {
      d.rows.$value.push(first)
      d.rows.$value.push(second)
    })
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    first.name = 'changed'
    second.name = 'changed'
    expect(form.getValue('rows.3.name')).toBe('D')
    expect(form.getValue('rows.4.name')).toBe('E')
    // One commit: the length reaction does not observe the one-row intermediate.
    expect(lengths).toEqual([...atRest, 5])
  })

  it('watch and batch push the same way, and two pushes stack on one draft', () => {
    const form = createEngine<{ go: boolean; rows: Row[] }>({
      initialValues: { go: false, rows: rows() },
      effects: [
        defineEffects<{ go: boolean; rows: Row[] }>(({ watch }) => {
          watch((d) => d.go.$value, (d) => {
            const list = d.rows.$value
            list.push({ id: 'd', name: 'D', note: '' })
            list.push({ id: 'e', name: 'E', note: '' })
          })
        }),
      ],
    })
    form.setValue('go', true)
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c', 'd', 'e'])
    form.batch((d) => { d.rows.$value.splice(3, 2) })
    expect(form.getValue('rows').map((row) => row.id)).toEqual(['a', 'b', 'c'])
  })

  it('nested object assign is a path write, not a parent replace', () => {
    let cityRuns = 0
    let nameRuns = 0
    const form = createEngine<{ go: boolean; user: { name: string; city: string } }>({
      initialValues: { go: false, user: { name: 'a', city: 'sh' } },
      effects: [
        defineEffects<{ go: boolean; user: { name: string; city: string } }>(({ reaction }) => {
          reaction((d) => { cityRuns += 1; void d.user.city.$value })
          reaction((d) => { nameRuns += 1; void d.user.name.$value })
          reaction((d) => {
            if (d.go.$value) d.user.$value.name = 'Ada'
          })
        }),
      ],
    })
    const cityBefore = cityRuns
    const nameBefore = nameRuns
    form.setValue('go', true)
    expect(form.getValue('user')).toEqual({ name: 'Ada', city: 'sh' })
    expect(cityRuns).toBe(cityBefore)
    expect(nameRuns).toBeGreaterThan(nameBefore)
    const path = createEngine<{ go: boolean; user: { name: string; city: string } }>({
      initialValues: { go: false, user: { name: 'a', city: 'sh' } },
      effects: [
        defineEffects<{ go: boolean; user: { name: string; city: string } }>(({ reaction }) => {
          reaction((d) => { if (d.go.$value) d.user.name.$value = 'Ada' })
        }),
      ],
    })
    path.setValue('go', true)
    expect(path.getValue('user')).toEqual(form.getValue('user'))
  })

  it('a registered tree rejects array mutators on $value', () => {
    const form = createEngine<{ nodes: { id: string; name: string; children: { id: string; name: string; children: [] }[] }[] }>({
      initialValues: { nodes: [{ id: 'a', name: 'A', children: [] }] },
      trees: { nodes: { childrenKey: 'children', rowKey: 'id' } },
    })
    expect(() => form.batch((d) => { d.nodes.$value.push({ id: 'b', name: 'B', children: [] }) })).toThrow(ShikiUsageError)
    expect(() => form.batch((d) => { d.nodes.$value.push({ id: 'b', name: 'B', children: [] }) })).toThrow(/useTreeField/)
    expect(() => form.batch((d) => { d.nodes.$value[0].children.push({ id: 'c', name: 'C', children: [] }) })).toThrow(/registered tree/)
    form.batch((d) => { d.nodes.$value[0].name = 'Ada' })
    expect(form.getValue('nodes.0.name')).toBe('Ada')
    expect(form.getValue('nodes')).toHaveLength(1)
  })
})

describe('effect-scope $enum and $rules', () => {
  const declared = [{ label: '上海', value: 'sh' }, { label: '北京', value: 'bj' }]

  it('push and assign replace the reaction list; undefined restores the declaration', () => {
    const form = createEngine<{ city: string }>({
      initialValues: { city: 'sh' },
      fields: { city: { enum: declared } },
    })
    form.batch((d) => {
      const options = d.city.$enum as { label: string; value: string }[]
      options.push({ label: '广州', value: 'gz' })
      options[0] = { label: '沪', value: 'sh' }
    })
    expect(form.binding('city').options).toEqual([
      { label: '沪', value: 'sh' },
      { label: '北京', value: 'bj' },
      { label: '广州', value: 'gz' },
    ])
    form.batch((d) => { d.city.$enum = [{ label: '深圳', value: 'sz' }] })
    expect(form.binding('city').options).toEqual([{ label: '深圳', value: 'sz' }])
    form.batch((d) => { d.city.$enum = [] })
    expect(form.binding('city').options).toEqual([])
    form.batch((d) => { d.city.$enum = undefined })
    expect(form.binding('city').options).toEqual(declared)
  })

  it('does not let push replace an EnumSource binding', async () => {
    let resolveLoad!: (rows: EnumOption[]) => void
    const source = EnumSource.from(() => new Promise<EnumOption[]>((resolve) => { resolveLoad = resolve }))
    const form = createEngine<{ city: string }>({
      initialValues: { city: '' },
      fields: { city: { enum: source.with(undefined) } },
    })
    expect(form.binding('city').loading).toBe(true)
    expect(() => form.batch((d) => { (d.city.$enum as { label: string; value: string }[]).push({ label: 'B', value: 'b' }) })).toThrow(/EnumSource/)
    expect(form.binding('city').loading).toBe(true)
    resolveLoad([{ label: 'A', value: 'a' }])
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(form.binding('city').options).toEqual([{ label: 'A', value: 'a' }])
    expect(form.binding('city').loading).toBe(false)
    expect(() => form.batch((d) => { (d.city.$enum as { label: string; value: string }[]).push({ label: 'B', value: 'b' }) })).toThrow(ShikiUsageError)
    expect(form.binding('city').options).toEqual([{ label: 'A', value: 'a' }])

    const assigned = createEngine<{ city: string }>({ initialValues: { city: '' } })
    assigned.batch((d) => { d.city.$enum = source.with('x') })
    expect(() => assigned.batch((d) => { (d.city.$enum as { label: string; value: string }[]).splice(0, 1) })).toThrow(/EnumSource/)
  })

  it('a rules push replaces the whole list', async () => {
    const form = createEngine<{ name: string }>({ initialValues: { name: '' } })
    form.batch((d) => { d.name.$rules.push({ required: true }) })
    expect(form.binding('name').required).toBe(false)
    expect(form.binding('name').errors).toEqual([])
    form.batch((d) => { d.name.$rules = [{ minLength: 2 }] })
    form.setValue('name', 'a')
    await expect(form.validate('name')).rejects.toEqual([{ path: 'name', messages: ['至少 2 个字符'] }])
  })
})

describe('effect-scope props and UI drafts', () => {
  it('patches a nested object and intercepts an array inside props', () => {
    const owned = ['a', 'b', 'c', 'd']
    const form = createEngine<{ city: string }>({
      initialValues: { city: '' },
      fields: { city: { componentProps: { options: owned, placeholder: 'p', style: { width: 1 } } } },
    })
    form.batch((d) => {
      const props = d.city.$componentProps
      props.style ??= {}
      props.style.color = 'red'
      props.options.push('e')
      delete props.options[1]
      props.options.splice(3, 1)
    })
    expect(owned).toEqual(['a', 'b', 'c', 'd'])
    const props = form.binding('city').componentProps
    expect(props.placeholder).toBe('p')
    expect(props.style).toEqual({ width: 1, color: 'red' })
    expect(props.options).toHaveLength(4)
    expect(1 in props.options).toBe(false)
    expect(props.options[0]).toBe('a')
    expect(props.options[2]).toBe('c')
    expect(props.options[3]).toBe('e')
  })

  it('$ui componentProps uses the same intercept', () => {
    const form = createEngine<{ city: string }>({
      initialValues: { city: '' },
      fields: { city: { componentProps: { placeholder: 'field' } } },
    })
    form.batch((d) => {
      const props = d.city.$ui('echo').$componentProps
      props.placeholder = 'echo'
      props.options = ['a', 'b']
      props.options.push('c')
      delete props.options[0]
    })
    const echo = form.uiBinding('city', 'echo', undefined, 'field').componentProps
    expect(echo.placeholder).toBe('echo')
    expect(echo.options).toHaveLength(3)
    expect(0 in echo.options).toBe(false)
    expect(echo.options[1]).toBe('b')
    expect(echo.options[2]).toBe('c')
    expect(form.binding('city').componentProps).toEqual({ placeholder: 'field' })
  })
})

describe('scalars and read-only state', () => {
  it('assigns scalars and booleans and refuses read-only keys', () => {
    const form = createEngine<{ count: number }>({ initialValues: { count: 1 } })
    form.batch((d) => {
      d.count.$value = 4
      d.count.$visible = false
      d.count.$readOnly = true
      expect(() => { (d.count as { $errors: string[] }).$errors = ['x'] }).toThrow(/read-only/)
      expect(() => { (d.count as { $dirty: boolean }).$dirty = true }).toThrow(/read-only/)
    })
    expect(form.getValue('count')).toBe(4)
    expect(form.binding('count').visible).toBe(false)
    expect(form.binding('count').readOnly).toBe(true)
    expect(form.binding('count').errors).toEqual([])
  })
})
