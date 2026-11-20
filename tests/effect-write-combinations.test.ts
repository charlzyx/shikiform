import { describe, expect, it, vi } from 'vitest'
import { defineEffects, ShikiConflictError, ShikiUsageError, toRaw } from '@shikiform/core'
import { createEngine } from '../packages/core/src/engine/create'
import { fieldErrorsOf } from './field-errors'

interface Row {
  id: string
  name: string
  note: string
}

interface Line {
  sku: string
  qty: number
}

interface Order {
  id: string
  lines: Line[]
}

const row = (id: string, name = id.toUpperCase(), note = ''): Row => ({ id, name, note })
const rows3 = (): Row[] => [row('a', 'A'), row('b', 'B'), row('c', 'C')]

function names(form: { getValue(path: string): unknown }, path = 'rows'): string[] {
  return (form.getValue(path) as { name?: string; id?: string }[]).map((item) => item.name ?? item.id ?? '')
}

function ids(form: { getValue(path: string): unknown }, path = 'rows'): string[] {
  return (form.getValue(path) as { id: string }[]).map((item) => item.id)
}

function dirtyIndexes(form: { dirtyRowSet(path: string): Set<number> | 'all' | undefined }, path: string): number[] | 'all' | undefined {
  const value = form.dirtyRowSet(path)
  if (value == null || value === 'all') return value
  return [...value].sort((a, b) => a - b)
}

describe('array mutate and cell writes in one pass', () => {
  it('edits an existing row and a pushed row, in either order, from batch and from a reaction', () => {
    const run = (where: 'batch' | 'reaction', order: 'cell-first' | 'push-first') => {
      const form = createEngine<{ phase: string; rows: Row[] }>({
        initialValues: { phase: '', rows: rows3() },
        fields: { 'rows.*.name': { required: true } },
        effects: where === 'reaction'
          ? [defineEffects<{ phase: string; rows: Row[] }>(({ reaction }) => {
              reaction((d) => {
                if (d.phase.$value !== order) return
                if (d.rows.$value.some((item) => item.id === 'z')) return
                const list = d.rows.$value
                if (order === 'cell-first') {
                  list[0].name = 'Ada'
                  list.push(row('z', 'Z'))
                  list[3].name = 'Zoe'
                } else {
                  list.push(row('z', 'Z'))
                  list[3].name = 'Zoe'
                  list[0].name = 'Ada'
                }
              })
            })]
          : [],
      })
      if (where === 'batch') {
        form.batch((d) => {
          const list = d.rows.$value
          if (order === 'cell-first') {
            list[0].name = 'Ada'
            list.push(row('z', 'Z'))
            list[3].name = 'Zoe'
          } else {
            list.push(row('z', 'Z'))
            list[3].name = 'Zoe'
            list[0].name = 'Ada'
          }
        })
      } else {
        form.setValue('phase', order)
      }
      expect(ids(form)).toEqual(['a', 'b', 'c', 'z'])
      expect(form.getValue('rows.0.name')).toBe('Ada')
      expect(form.getValue('rows.3.name')).toBe('Zoe')
      expect(form.binding('rows.3.name').required).toBe(true)
      expect(form.binding('rows.0.name').required).toBe(true)
      expect(form.structureKeys('rows').map((item) => item.key)).toEqual(['a', 'b', 'c', 'z'])
    }
    for (const where of ['batch', 'reaction'] as const) {
      for (const order of ['cell-first', 'push-first'] as const) run(where, order)
    }
  })

  it('a cell edit follows its row through splice, reverse, and sort', () => {
    const form = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
    form.batch((d) => {
      d.rows.$value[0].name = 'Ada'
      d.rows.$value.splice(1, 1)
      d.rows.$value.reverse()
    })
    // splice drops b, reverse puts c then a. Ada was written on a, so it lands on a.
    expect(ids(form)).toEqual(['c', 'a'])
    expect(names(form)).toEqual(['C', 'Ada'])

    const sorted = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
    sorted.batch((d) => {
      d.rows.$value[0].name = 'Ada'
      d.rows.$value.sort((x, y) => (x.id < y.id ? 1 : x.id > y.id ? -1 : 0))
    })
    expect(ids(sorted)).toEqual(['c', 'b', 'a'])
    expect(names(sorted)).toEqual(['C', 'B', 'Ada'])
  })

  it('does not paint a removed row’s edit onto the row that slides into its index', () => {
    const form = createEngine<{ phase: number; rows: Row[] }>({
      initialValues: { phase: 0, rows: rows3() },
      effects: [defineEffects<{ phase: number; rows: Row[] }>(({ reaction }) => {
        reaction((d) => {
          if (d.phase.$value !== 1) return
          if (d.rows.$value.length !== 3) return
          d.rows.$value[0].name = 'Ada'
          d.rows.$value.splice(0, 1)
        })
      })],
    })
    form.setValue('phase', 1)
    expect(ids(form)).toEqual(['b', 'c'])
    expect(names(form)).toEqual(['B', 'C'])

    const after = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
    after.batch((d) => {
      d.rows.$value.splice(0, 1)
      d.rows.$value[0].name = 'Bee'
    })
    expect(ids(after)).toEqual(['b', 'c'])
    expect(names(after)).toEqual(['Bee', 'C'])
  })

  it('keeps a primitive edit on that element when the array is reversed, and drops it when the element is removed', () => {
    const form = createEngine<{ tags: string[] }>({ initialValues: { tags: ['a', 'b', 'c'] } })
    form.batch((d) => {
      d.tags.$value[0] = 'A'
      d.tags.$value.reverse()
    })
    expect(form.getValue('tags')).toEqual(['c', 'b', 'A'])

    const removed = createEngine<{ tags: string[] }>({ initialValues: { tags: ['a', 'b', 'c'] } })
    removed.batch((d) => {
      d.tags.$value[0] = 'A'
      d.tags.$value.splice(0, 1)
    })
    expect(removed.getValue('tags')).toEqual(['b', 'c'])

    // Two identical primitives have no identity. The edit stays on the index that was written.
    const dup = createEngine<{ tags: string[] }>({ initialValues: { tags: ['a', 'a', 'b'] } })
    dup.batch((d) => {
      d.tags.$value[0] = 'Z'
      d.tags.$value.reverse()
    })
    expect(dup.getValue('tags')).toEqual(['Z', 'a', 'a'])
  })

  it('a hole from delete does not shift later cells; truncating length drops the cell on the removed tail', () => {
    const form = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
    form.batch((d) => {
      d.rows.$value[2].name = 'Cee'
      delete d.rows.$value[0]
    })
    const holed = form.getValue('rows')
    expect(holed).toHaveLength(3)
    expect(0 in holed).toBe(false)
    expect(holed[1]).toMatchObject({ id: 'b', name: 'B' })
    expect(holed[2]).toMatchObject({ id: 'c', name: 'Cee' })

    const truncated = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
    truncated.batch((d) => {
      d.rows.$value[2].name = 'Cee'
      d.rows.$value.length = 1
    })
    expect(ids(truncated)).toEqual(['a'])
    expect(truncated.getValue('rows.0.name')).toBe('A')
  })

  it('moves field state with the surviving row, and keeps an exact declaration on its path', async () => {
    const form = createEngine<{ rows: Row[] }>({
      initialValues: { rows: [row('a', 'A', 'na'), row('b', '', 'nb'), row('c', 'C', 'nc')] },
      fields: {
        'rows.*.name': { required: true },
        'rows.0.note': { title: 'pinned' },
      },
    })
    await fieldErrorsOf(form.validate('rows.1.name'))
    form.blur('rows.2.name')
    expect(form.errors.map((error) => error.path)).toEqual(['rows.1.name'])
    expect(form.binding('rows.2.name').touched).toBe(true)

    form.batch((d) => {
      d.rows.$value[0].name = 'Ada'
      d.rows.$value.splice(0, 1)
    })
    // a is gone, so Ada is discarded. b slides to index 0 and keeps its error. c keeps touched.
    expect(ids(form)).toEqual(['b', 'c'])
    expect(names(form)).toEqual(['', 'C'])
    expect(form.errors.map((error) => error.path)).toEqual(['rows.0.name'])
    expect(form.binding('rows.1.name').touched).toBe(true)
    expect(form.binding('rows.0.name').touched).toBe(false)
    expect(form.query('rows.0.note').$title).toBe('pinned')
    expect(form.query('rows.1.note').$title).toBeUndefined()
    expect(form.binding('rows.0.name').required).toBe(true)
    expect(form.binding('rows.1.name').required).toBe(true)
    expect(dirtyIndexes(form, 'rows')).toEqual([0, 1])
    expect(form.structureKeys('rows').map((item) => item.key)).toEqual(['b', 'c'])
  })

  it('push, a cell on the new row, splice, and reverse commit one array and precise dirty rows', () => {
    const form = createEngine<{ rows: Row[] }>({
      initialValues: { rows: rows3() },
      fields: { 'rows.*.note': { required: true }, 'rows.0.note': { title: 'pinned' } },
    })
    form.batch((d) => {
      const list = d.rows.$value
      list[1].name = 'Bee'
      list.push(row('z', 'Z', 'nz'))
      list[3].note = 'Zoe'
      list.splice(0, 1)
      list.reverse()
    })
    // drop a, reverse the rest: z, c, b. Bee stays on b. Zoe stays on z.
    expect(ids(form)).toEqual(['z', 'c', 'b'])
    expect(names(form)).toEqual(['Z', 'C', 'Bee'])
    expect(form.getValue('rows.0.note')).toBe('Zoe')
    expect(form.getValue('rows.2.name')).toBe('Bee')
    expect(form.binding('rows.0.note').required).toBe(true)
    expect(form.query('rows.0.note').$title).toBe('pinned')
    expect(form.query('rows.2.note').$title).toBeUndefined()
    expect(dirtyIndexes(form, 'rows')).toEqual([0, 1, 2])
    expect(form.structureKeys('rows').map((item) => item.key)).toEqual(['z', 'c', 'b'])
  })

  it('copies a duplicated row object so the original keeps its field state', async () => {
    const form = createEngine<{ rows: { name: string }[] }>({
      initialValues: { rows: [{ name: '' }, { name: 'B' }] },
      fields: { 'rows.*.name': { required: true } },
    })
    await fieldErrorsOf(form.validate('rows.0.name'))
    const before = form.structureKeys('rows').map((item) => item.key)
    form.batch((d) => {
      d.rows.$value.push(d.rows.$value[0])
    })
    const keys = form.structureKeys('rows').map((item) => item.key)
    expect(keys[0]).toBe(before[0])
    expect(keys[2]).not.toBe(keys[0])
    expect(toRaw(form.getValue('rows.0'))).not.toBe(toRaw(form.getValue('rows.2')))
    expect(form.getValue('rows.2')).toEqual({ name: '' })
    expect(form.errors.map((error) => error.path)).toEqual(['rows.0.name'])

    // `id` is the row identity. A second row with the same id is the same row; the model follows the last index.
    // The stored objects are still distinct, so the copy is not an alias of the original.
    const identified = createEngine<{ rows: Row[] }>({
      initialValues: { rows: [row('a', ''), row('b', 'B')] },
      fields: { 'rows.*.name': { required: true } },
    })
    await fieldErrorsOf(identified.validate('rows.0.name'))
    identified.batch((d) => { d.rows.$value.push(d.rows.$value[0]) })
    expect(toRaw(identified.getValue('rows.0'))).not.toBe(toRaw(identified.getValue('rows.2')))
    expect(identified.getValue('rows.0.id')).toBe('a')
    expect(identified.getValue('rows.2.id')).toBe('a')
    expect(identified.errors.map((error) => error.path)).toEqual(['rows.2.name'])
  })
})

describe('object reaction.each writing elsewhere', () => {
  it('writes a nested object and an array cell per key, and a sibling reaction reads Object.keys', () => {
    type Values = {
      flag: boolean
      extra: Record<string, number>
      mirror: Record<string, number>
      lines: number[]
      labels: string[]
    }
    const log: string[] = []
    const form = createEngine<Values>({
      initialValues: { flag: false, extra: { a: 1, b: 2 }, mirror: {}, lines: [0, 0], labels: [] },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          d.labels.$value = Object.keys(d.extra.$value).sort()
          log.push('keys')
        })
        reaction.each((d) => d.extra, (entry, { key, d }) => {
          const factor = d.flag.$value ? 2 : 1
          d.mirror[key].$value = (entry.$value ?? 0) * factor
          const index = key === 'a' ? 0 : key === 'b' ? 1 : 2
          d.lines[index].$value = entry.$value
          log.push(`each:${key}`)
        })
      })],
    })
    expect(form.getValue('labels')).toEqual(['a', 'b'])
    expect(form.getValue('mirror')).toEqual({ a: 1, b: 2 })
    expect(form.getValue('lines')).toEqual([1, 2])
    log.length = 0
    form.setValue('flag', true)
    expect(log.filter((item) => item.startsWith('each:')).sort()).toEqual(['each:a', 'each:b'])
    expect(form.getValue('mirror')).toEqual({ a: 2, b: 4 })
    expect(form.getValue('labels')).toEqual(['a', 'b'])
    log.length = 0
    form.batch((d) => {
      delete d.extra.$value.a
      d.extra.$value.c = 3
    })
    expect(form.getValue('labels')).toEqual(['b', 'c'])
    // `flag` is still true, so the new key is doubled. Deleting `a` drops its instance; it does not clear mirror.a.
    expect(form.getValue('mirror')).toEqual({ a: 2, b: 4, c: 6 })
    expect(form.getValue('lines.2')).toBe(3)
    expect(log).toContain('each:c')
    expect(log).not.toContain('each:a')
    form.setValue('flag', false)
    expect(form.getValue('mirror')).toEqual({ a: 2, b: 2, c: 3 })
  })

  it('delete and re-add of the same key in one batch keeps the instance; across batches it starts fresh', () => {
    type Values = { extra: Record<string, number>; flag: boolean }
    const log: string[] = []
    const form = createEngine<Values>({
      initialValues: { extra: { a: 1, b: 2 }, flag: false },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction.each((d) => d.extra, (entry, { key, d }) => {
          void d.flag.$value
          log.push(`${key}:${entry.$value}`)
        })
      })],
    })
    expect(log.splice(0).sort()).toEqual(['a:1', 'b:2'])
    form.batch((d) => {
      delete d.extra.$value.a
      d.extra.$value.a = 5
    })
    // One batch coalesces delete+set of `extra.a`, so the key never leaves and the same instance re-runs.
    expect(log.splice(0)).toEqual(['a:5'])
    form.batch((d) => { delete d.extra.$value.a })
    expect(log.splice(0)).toEqual([])
    form.setValue('flag', true)
    expect(log.splice(0)).toEqual(['b:2'])
    form.batch((d) => { d.extra.$value.a = 9 })
    expect(log.splice(0)).toEqual(['a:9'])
  })

  it('treats two each instances pushing one shared array as two writers', () => {
    expect(() => createEngine<{ extra: Record<string, number>; rows: Row[] }>({
      initialValues: { extra: { a: 1, b: 2 }, rows: [] },
      effects: [defineEffects<{ extra: Record<string, number>; rows: Row[] }>(({ reaction }) => {
        reaction.each((d) => d.extra, (entry, { key, d }) => {
          d.rows.$value.push(row(key, String(entry.$value)))
        })
      })],
    })).toThrow(ShikiConflictError)
  })
})

describe('reaction chains over an array write', () => {
  it('runs array → enum → props → watch in one flush, without a conflict or a cycle', () => {
    type Values = { go: boolean; rows: Row[]; city: string; trace: string }
    const log: string[] = []
    const initialEnum = [{ label: 'A', value: 'a' }, { label: 'B', value: 'b' }, { label: 'C', value: 'c' }]
    const form = createEngine<Values>({
      initialValues: { go: false, rows: rows3(), city: 'a', trace: '' },
      fields: { city: { enum: initialEnum, componentProps: { placeholder: 'A' } } },
      effects: [defineEffects<Values>(({ reaction, watch }) => {
        reaction((d) => {
          if (!d.go.$value || d.rows.$value.some((item) => item.id === 'z')) return
          d.rows.$value.push(row('z', 'Z'))
          log.push('A')
        })
        reaction((d) => {
          d.city.$enum = d.rows.$value.map((item) => ({ label: item.name, value: item.id }))
          log.push('B')
        })
        reaction((d) => {
          const options = d.city.$enum as unknown as { label: string }[]
          d.city.$componentProps.placeholder = options[0]?.label ?? ''
          log.push('C')
        })
        watch((d) => d.city.$enum, (d) => {
          d.trace.$value = d.rows.$value.map((item) => item.id).join(',')
          log.push('W')
        })
      })],
    })
    expect(form.getValue('trace')).toBe('')
    expect(log).not.toContain('W')
    const before = log.length
    form.setValue('go', true)
    // Watch subscribed to `$enum` at install; the props reaction records that dep when it first runs,
    // so in this wave the watch is queued ahead of it. Both still finish in the same flush.
    expect(log.slice(before)).toEqual(['A', 'B', 'W', 'C'])
    expect(ids(form)).toEqual(['a', 'b', 'c', 'z'])
    expect(form.binding('city').options.map((option) => option.value)).toEqual(['a', 'b', 'c', 'z'])
    expect(form.binding('city').componentProps.placeholder).toBe('A')
    expect(form.getValue('trace')).toBe('a,b,c,z')
    form.setValue('rows.0.name', 'Ada')
    expect(form.binding('city').options[0]).toEqual({ label: 'Ada', value: 'a' })
    expect(form.getValue('trace')).toBe('a,b,c,z')
    expect(log.filter((item) => item === 'W').length).toBe(2)
  })
})

describe('draft reads in the same pass', () => {
  it('replays array length, nested fields, props, and $enum, and rejects a flag read', () => {
    const declared = [{ label: '上海', value: 'sh' }, { label: '北京', value: 'bj' }]
    const form = createEngine<{ user: { name: string; city: string }; rows: Row[]; city: string }>({
      initialValues: { user: { name: 'a', city: 'sh' }, rows: rows3(), city: 'sh' },
      fields: { city: { enum: declared, componentProps: { placeholder: 'p', style: { width: 1 } } } },
    })
    form.batch((d) => {
      const list = d.rows.$value
      const before = list.length
      list.push(row('z', 'Z'))
      expect(list.length).toBe(before + 1)
      expect(list[before].id).toBe('z')
      d.user.$value.name = 'Ada'
      expect(d.user.$value.name).toBe('Ada')
      expect(d.user.$value.city).toBe('sh')
      const props = d.city.$componentProps
      props.style ??= {}
      props.style.color = 'red'
      expect(props.style).toEqual({ width: 1, color: 'red' })
      const options = d.city.$enum as { label: string; value: string }[]
      options.push({ label: '广州', value: 'gz' })
      expect(options.map((option) => option.value)).toEqual(['sh', 'bj', 'gz'])
      const next = false
      d.city.$visible = next
      expect(() => { void d.city.$visible }).toThrow(/same batch/)
    })
    expect(form.getValue('user')).toEqual({ name: 'Ada', city: 'sh' })
    expect(form.binding('city').componentProps.style).toEqual({ width: 1, color: 'red' })
    expect(form.binding('city').options.map((option) => option.value)).toEqual(['sh', 'bj', 'gz'])
    expect(form.binding('city').visible).toBe(false)

    expect(() => createEngine<{ city: string }>({
      initialValues: { city: 'sh' },
      effects: [defineEffects<{ city: string }>(({ reaction }) => {
        reaction((d) => {
          d.city.$visible = false
          void d.city.$visible
        })
      })],
    })).toThrow(/same reaction/)
  })
})

describe('nested arrays mutated from an effect', () => {
  it('pushes a row and a nested line in the same pass, and a parent reverse keeps the line edit', () => {
    const form = createEngine<{ orders: Order[] }>({
      initialValues: { orders: [{ id: 'o1', lines: [{ sku: 'a', qty: 1 }] }] },
      fields: { 'orders.*.lines.*.sku': { required: true } },
    })
    const beforeKeys = form.structureKeys('orders').map((item) => item.key)
    form.batch((d) => {
      const orders = d.orders.$value
      const at = orders.length
      expect(at).toBe(1)
      orders.push({ id: 'o2', lines: [] })
      expect(orders.length).toBe(2)
      orders[at].lines.push({ sku: 'b', qty: 2 })
      orders[at].lines[0].qty = 5
      orders[0].lines[0].qty = 9
      orders[0].lines.push({ sku: 'c', qty: 3 })
    })
    expect(form.getValue('orders')).toEqual([
      { id: 'o1', lines: [{ sku: 'a', qty: 9 }, { sku: 'c', qty: 3 }] },
      { id: 'o2', lines: [{ sku: 'b', qty: 5 }] },
    ])
    expect(form.structureKeys('orders').map((item) => item.key)[0]).toBe(beforeKeys[0])
    expect(form.binding('orders.1.lines.0.sku').required).toBe(true)
    expect(form.binding('orders.0.lines.1.sku').required).toBe(true)

    const moved = createEngine<{ orders: Order[] }>({
      initialValues: { orders: [{ id: 'o1', lines: [{ sku: 'a', qty: 1 }, { sku: 'c', qty: 3 }] }, { id: 'o2', lines: [{ sku: 'b', qty: 5 }] }] },
    })
    moved.batch((d) => {
      d.orders.$value[0].lines[0].qty = 7
      d.orders.$value[0].lines.push({ sku: 'd', qty: 4 })
      d.orders.$value.reverse()
    })
    expect(moved.getValue('orders').map((order) => order.id)).toEqual(['o2', 'o1'])
    expect(moved.getValue('orders.1.lines')).toEqual([{ sku: 'a', qty: 7 }, { sku: 'c', qty: 3 }, { sku: 'd', qty: 4 }])
    expect(moved.getValue('orders.0.lines')).toEqual([{ sku: 'b', qty: 5 }])
  })
})

describe('draft aliasing', () => {
  it('shares a draft assigned to two paths until a path write copies, and rejects a mutation after the pass', () => {
    const form = createEngine<{ user: { name: string; city: string }; left: { name: string; city: string }; right: { name: string; city: string } }>({
      initialValues: {
        user: { name: 'a', city: 'sh' },
        left: { name: '', city: '' },
        right: { name: '', city: '' },
      },
    })
    form.batch((d) => { d.left.$value = d.user.$value })
    // A reaction / batch assign stores the object by reference (a path write later copies).
    expect(toRaw(form.getValue('left'))).toBe(toRaw(form.getValue('user')))

    form.batch((d) => {
      const user = d.user.$value
      d.left.$value = user
      d.right.$value = user
      user.name = 'Z'
      d.left.$value.city = 'hz'
    })
    expect(form.getValue('user')).toEqual({ name: 'Z', city: 'sh' })
    expect(form.getValue('left')).toEqual({ name: 'a', city: 'hz' })
    expect(form.getValue('right')).toEqual({ name: 'a', city: 'sh' })
    expect(toRaw(form.getValue('left'))).not.toBe(toRaw(form.getValue('right')))
    expect(toRaw(form.getValue('left'))).not.toBe(toRaw(form.getValue('user')))

    const dated = createEngine<{ user: { name: string; when: Date }; left: { name: string; when: Date } }>({
      initialValues: { user: { name: 'a', when: new Date('2020-01-01T00:00:00Z') }, left: { name: '', when: new Date(0) } },
    })
    dated.batch((d) => { d.left.$value = d.user.$value })
    dated.batch((d) => { d.user.$value.when.setFullYear(1999) })
    // Date is not a draft. An in-place edit changes the stored object, and every alias sees it.
    expect(dated.getValue('user.when').getFullYear()).toBe(1999)
    expect(dated.getValue('left.when').getFullYear()).toBe(1999)

    let savedRow: { name: string }
    let savedList: { push(row: Row): number; sort(): unknown }
    let savedOptions: { push(option: { label: string; value: string }): number }
    let savedProps: { placeholder?: string }
    const held = createEngine<{ rows: Row[]; city: string }>({
      initialValues: { rows: rows3(), city: 'sh' },
      fields: { city: { enum: [{ label: '上海', value: 'sh' }], componentProps: { placeholder: 'p' } } },
    })
    held.batch((d) => {
      savedRow = d.rows.$value[0]
      savedList = d.rows.$value
      savedOptions = d.city.$enum as unknown as typeof savedOptions
      savedProps = d.city.$ui('echo').$componentProps
    })
    expect(() => { savedRow.name = 'x' }).toThrow(ShikiUsageError)
    expect(() => { savedRow.name = 'x' }).toThrow(/was changed after/)
    expect(() => savedList.push(row('z'))).toThrow(ShikiUsageError)
    expect(() => savedList.sort()).toThrow(ShikiUsageError)
    expect(() => savedOptions.push({ label: 'x', value: 'x' })).toThrow(ShikiUsageError)
    expect(() => { savedProps.placeholder = 'x' }).toThrow(ShikiUsageError)
    expect(held.getValue('rows.0.name')).toBe('A')
    expect(held.getValue('rows')).toHaveLength(3)
    expect(held.binding('city').options).toEqual([{ label: '上海', value: 'sh' }])
  })
})

describe('async watch and the read-only guard', () => {
  it('throws when an async watch writes through the draft, and accepts a later batch', async () => {
    let form!: ReturnType<typeof createEngine<{ go: boolean; rows: Row[] }>>
    let saved: { push(row: Row): number } | undefined
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    form = createEngine<{ go: boolean; rows: Row[] }>({
      initialValues: { go: false, rows: rows3() },
      effects: [defineEffects<{ go: boolean; rows: Row[] }>(({ watch }) => {
        watch((d) => d.go.$value, (d) => {
          saved = d.rows.$value
          void gate.then(() => {
            form.batch((draft) => { draft.rows.$value.push(row('z', 'Z')) })
          })
        })
      })],
    })
    expect(() => (form.getValue('rows') as Row[]).push(row('nope'))).toThrow(ShikiUsageError)
    form.setValue('go', true)
    expect(() => saved!.push(row('z'))).toThrow(/was changed after/)
    expect(form.getValue('rows')).toHaveLength(3)
    release()
    await gate
    expect(ids(form)).toEqual(['a', 'b', 'c', 'z'])

    expect(() => createEngine<{ go: boolean; n: number }>({
      initialValues: { go: false, n: 0 },
      effects: [defineEffects<{ go: boolean; n: number }>(({ watch }) => {
        watch((d) => d.go.$value, async (d) => {
          await Promise.resolve()
          d.n.$value = 1
        })
      })],
    }).setValue('go', true)).toThrow(/must be synchronous/)
  })

  it('production still applies a draft mutation made after the pass', () => {
    vi.stubEnv('NODE_ENV', 'production')
    try {
      const form = createEngine<{ rows: Row[] }>({ initialValues: { rows: rows3() } })
      let saved!: { push(row: Row): number }
      form.batch((d) => { saved = d.rows.$value })
      saved.push(row('z', 'Z'))
      expect(ids(form)).toEqual(['a', 'b', 'c', 'z'])
    } finally {
      vi.unstubAllEnvs()
    }
  })
})

describe('validate and submit after effect writes', () => {
  it('submits reaction-assigned fields, keeps a hidden field, and drops omit', async () => {
    type Values = { secret: string; hidden: string; total: number; alias: string; rows: Row[]; go: boolean }
    const form = createEngine<Values>({
      initialValues: { secret: 'nope', hidden: 'keep', total: 0, alias: '', rows: [row('a', 'A'), row('b', 'B')], go: false },
      fields: { secret: { omit: true }, 'rows.*.name': { required: true } },
      effects: [defineEffects<Values>(({ reaction }) => {
        reaction((d) => {
          d.total.$value = d.rows.$value.reduce((sum, item) => sum + item.name.length, 0)
          d.alias.$value = d.rows.$value.map((item) => item.id).join(',')
          d.hidden.$visible = false
          if (d.go.$value && d.rows.$value.length === 2) d.rows.$value.push(row('z', 'Z'))
        })
      })],
    })
    expect(form.dirty).toBe(false)
    expect(form.binding('hidden').visible).toBe(false)
    form.batch((d) => { d.$ui('tip').$title = 'note' })
    form.setValue('go', true)
    // The array push is an ArrayOps commit. Unlike `d.total.$value = …`, it does not mark `rows` computed,
    // so the form is dirty even though a reaction did the push.
    expect(form.dirty).toBe(true)
    const submitted = {
      hidden: 'keep',
      total: 3,
      alias: 'a,b,z',
      rows: [row('a', 'A'), row('b', 'B'), row('z', 'Z')],
      go: true,
    }
    const validated = await form.validate()
    expect(validated).toEqual(submitted)
    validated.rows[0].name = 'mutated'
    expect(form.getValue('rows.0.name')).toBe('A')
    await expect(form.submit()).resolves.toEqual(submitted)
    expect(form.getSubmitValues()).not.toHaveProperty('secret')
  })
})
